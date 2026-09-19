import type {
  InferenceError,
  InferenceWorkerRequest,
  InferenceWorkerResponse,
  ModelStatus,
} from "../inference/protocol";
import type { ExtensionResponse, OffscreenMessage } from "../lib/types";

export interface WorkerPort {
  postMessage(message: InferenceWorkerRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<InferenceWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

interface PendingRequest {
  resolve(response: ExtensionResponse<unknown>): void;
}

type WorkerFactory = () => WorkerPort;

export class InferenceWorkerHost {
  private worker?: WorkerPort;
  private lastError?: InferenceError;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(private readonly createWorker: WorkerFactory) {}

  initialize(requestId: string): Promise<ExtensionResponse<unknown>> {
    return this.requestWorker({ type: "initialize", requestId });
  }

  handle(message: OffscreenMessage): Promise<ExtensionResponse<unknown>> {
    switch (message.type) {
      case "predict":
        if (typeof message.content !== "string") {
          return Promise.resolve(failure("invalid-response", false, "Predict content is missing"));
        }
        return this.requestWorker({ type: "predict", requestId: message.requestId, content: message.content });
      case "model-status":
        if (!this.worker && this.lastError) {
          const status: ModelStatus = { state: "error", error: this.lastError };
          return Promise.resolve({ ok: true, data: status });
        }
        return this.requestWorker({ type: "status", requestId: message.requestId });
      case "retry-model":
        this.resetWorker();
        this.lastError = undefined;
        return this.requestWorker({ type: "initialize", requestId: message.requestId });
    }
  }

  dispose(): void {
    this.resetWorker();
  }

  private requestWorker(request: InferenceWorkerRequest): Promise<ExtensionResponse<unknown>> {
    if (this.pending.has(request.requestId)) {
      return Promise.resolve(failure("invalid-response", false, "Duplicate worker requestId"));
    }

    const worker = this.ensureWorker();
    return new Promise((resolve) => {
      this.pending.set(request.requestId, { resolve });
      try {
        worker.postMessage(request);
      } catch (error) {
        this.pending.delete(request.requestId);
        resolve(failure("inference", true, errorMessage(error)));
      }
    });
  }

  private ensureWorker(): WorkerPort {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.onmessage = (event) => this.receive(event.data);
    worker.onerror = (event) => this.handleCrash(event);
    this.worker = worker;
    return worker;
  }

  private receive(response: InferenceWorkerResponse): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);
    pending.resolve(response.ok
      ? { ok: true, data: response.data }
      : { ok: false, error: response.error });
  }

  private handleCrash(event: ErrorEvent): void {
    event.preventDefault();
    const error: InferenceError = {
      kind: "inference",
      retryable: true,
      message: event.message || "Inference worker crashed",
    };
    this.lastError = error;
    this.worker?.terminate();
    this.worker = undefined;
    for (const request of this.pending.values()) request.resolve({ ok: false, error });
    this.pending.clear();
  }

  private resetWorker(): void {
    this.worker?.terminate();
    this.worker = undefined;
    const error = failure("model-loading", true, "Inference worker is restarting");
    for (const request of this.pending.values()) request.resolve(error);
    this.pending.clear();
  }
}

function failure(
  kind: InferenceError["kind"],
  retryable: boolean,
  message: string,
): ExtensionResponse<never> {
  return { ok: false, error: { kind, retryable, message } };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "Unknown worker error");
}

function installOffscreenHost(): void {
  const workerUrl = new URL("./inference-worker.js", globalThis.location.href);
  const host = new InferenceWorkerHost(() => new Worker(workerUrl) as unknown as WorkerPort);
  void host.initialize(`startup-${Date.now()}`);

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isOffscreenMessage(message)) return false;
    void host.handle(message).then(sendResponse);
    return true;
  });
}

function isOffscreenMessage(message: unknown): message is OffscreenMessage {
  if (!message || typeof message !== "object") return false;
  const record = message as Record<string, unknown>;
  return record.target === "offscreen"
    && typeof record.requestId === "string"
    && (record.type === "predict" || record.type === "model-status" || record.type === "retry-model");
}

if (typeof Worker !== "undefined" && typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  installOffscreenHost();
}

import type {
  InferenceError,
  InferenceErrorKind,
  InferenceWorkerRequest,
  InferenceWorkerResponse,
  ModelStatus,
} from "../inference/protocol";
import type {
  ClearStatsRange,
  EventPayload,
  ExtensionMessage,
  ExtensionResponse,
  ModelMetadata,
  Prediction,
  StatsSnapshot,
} from "./types";

const ERROR_KINDS = new Set<InferenceErrorKind>([
  "model-loading",
  "model-load",
  "inference",
  "busy",
  "invalid-response",
]);

class CyberShieldClientError extends Error implements InferenceError {
  readonly kind: InferenceErrorKind;
  readonly retryable: boolean;

  constructor(error: InferenceError) {
    super(error.message ?? error.kind);
    this.name = "CyberShieldClientError";
    this.kind = error.kind;
    this.retryable = error.retryable;
  }
}

interface WorkerPort {
  postMessage(message: InferenceWorkerRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<InferenceWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
}

class StandaloneInferenceClient {
  private worker?: WorkerPort;
  private sequence = 0;
  private readonly pending = new Map<string, {
    resolve(value: unknown): void;
    reject(error: unknown): void;
  }>();

  predict(content: string): Promise<Prediction> {
    return this.request("predict", content) as Promise<Prediction>;
  }

  status(): Promise<ModelStatus> {
    return this.request("status") as Promise<ModelStatus>;
  }

  retry(): Promise<ModelStatus> {
    this.reset(new CyberShieldClientError({
      kind: "model-loading",
      retryable: true,
      message: "Inference worker is restarting",
    }));
    return this.request("initialize") as Promise<ModelStatus>;
  }

  private request(type: "initialize" | "predict" | "status", content?: string): Promise<unknown> {
    const requestId = `standalone-${Date.now()}-${++this.sequence}`;
    const request: InferenceWorkerRequest = type === "predict"
      ? { type, requestId, content: content ?? "" }
      : { type, requestId };
    const worker = this.ensureWorker();
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      try {
        worker.postMessage(request);
      } catch (error) {
        this.pending.delete(requestId);
        reject(new CyberShieldClientError({ kind: "inference", retryable: true, message: errorMessage(error) }));
      }
    });
  }

  private ensureWorker(): WorkerPort {
    if (this.worker) return this.worker;
    const workerUrl = new URL("../extension/dist/inference-worker.js", document.baseURI);
    const worker = new Worker(workerUrl) as unknown as WorkerPort;
    worker.onmessage = (event) => this.receive(event.data);
    worker.onerror = (event) => {
      event.preventDefault();
      this.reset(new CyberShieldClientError({
        kind: "inference",
        retryable: true,
        message: event.message || "Inference worker crashed",
      }));
    };
    this.worker = worker;
    return worker;
  }

  private receive(response: InferenceWorkerResponse): void {
    const pending = this.pending.get(response.requestId);
    if (!pending) return;
    this.pending.delete(response.requestId);
    if (response.ok) pending.resolve(response.data);
    else pending.reject(new CyberShieldClientError(response.error));
  }

  private reset(error: CyberShieldClientError): void {
    this.worker?.terminate();
    this.worker = undefined;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}

let standaloneClient: StandaloneInferenceClient | undefined;
const standaloneStats: StatsSnapshot = { scanned: 0, toxic: 0, threat: 0, links: 0, revealed: 0 };

function hasExtensionRuntime(): boolean {
  return typeof chrome !== "undefined" && typeof chrome.runtime?.id === "string";
}

function directClient(): StandaloneInferenceClient {
  standaloneClient ??= new StandaloneInferenceClient();
  return standaloneClient;
}

async function request<T>(message: ExtensionMessage): Promise<T> {
  if (!hasExtensionRuntime()) return standaloneRequest<T>(message);
  const value = await chrome.runtime.sendMessage<ExtensionMessage, unknown>(message);
  const envelope = validateEnvelope<T>(value);
  if (!envelope.ok) throw new CyberShieldClientError(envelope.error);
  return envelope.data;
}

async function standaloneRequest<T>(message: ExtensionMessage): Promise<T> {
  switch (message.type) {
    case "predict":
      return directClient().predict(message.content) as Promise<T>;
    case "model-status":
      return directClient().status() as Promise<T>;
    case "retry-model":
      return directClient().retry() as Promise<T>;
    case "event": {
      const field = message.event.type === "link" ? "links" : message.event.type;
      standaloneStats[field] += message.event.count;
      return { ok: true } as T;
    }
    case "stats":
      return { ...standaloneStats } as T;
    case "clear-stats":
      for (const field of Object.keys(standaloneStats) as Array<keyof StatsSnapshot>) {
        standaloneStats[field] = 0;
      }
      return { ok: true } as T;
  }
}

function validateEnvelope<T>(value: unknown): ExtensionResponse<T> {
  if (!value || typeof value !== "object") throw invalidResponse();
  const record = value as Record<string, unknown>;
  if (record.ok === true && Object.prototype.hasOwnProperty.call(record, "data")) {
    return { ok: true, data: record.data as T };
  }
  if (record.ok === false && isInferenceError(record.error)) {
    return { ok: false, error: record.error };
  }
  throw invalidResponse();
}

function isInferenceError(value: unknown): value is InferenceError {
  if (!value || typeof value !== "object") return false;
  const error = value as Record<string, unknown>;
  return typeof error.kind === "string"
    && ERROR_KINDS.has(error.kind as InferenceErrorKind)
    && typeof error.retryable === "boolean"
    && (error.message === undefined || typeof error.message === "string");
}

function invalidResponse(): CyberShieldClientError {
  return new CyberShieldClientError({
    kind: "invalid-response",
    retryable: false,
    message: "Invalid extension response envelope",
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "Unknown client error");
}

async function loadMetadata(): Promise<ModelMetadata> {
  const url = hasExtensionRuntime()
    ? chrome.runtime.getURL("dist/model/metadata.json")
    : new URL("../extension/dist/model/metadata.json", document.baseURI).href;
  const response = await fetch(url);
  if (!response.ok) throw invalidResponse();
  const metadata = await response.json() as ModelMetadata;
  if (metadata.schemaVersion !== 1 || !metadata.modelVersion || metadata.labels?.length !== 2) {
    throw invalidResponse();
  }
  return metadata;
}

export const CyberShieldModel = {
  predict: (content: string) => request<Prediction>({ type: "predict", content }),
  status: () => request<ModelStatus>({ type: "model-status" }),
  retryModel: () => request<ModelStatus>({ type: "retry-model" }),
  stats: (range: "day" | "week") => request<StatsSnapshot>({ type: "stats", range }),
  event: (event: EventPayload) => request<{ ok: boolean }>({ type: "event", event }),
  clearStats: (range: ClearStatsRange) => request<{ ok: boolean }>({ type: "clear-stats", range }),
  loadMetadata,
};

declare global {
  interface Window {
    CyberShieldModel?: typeof CyberShieldModel;
  }
}

if (!hasExtensionRuntime() && typeof window !== "undefined") {
  window.CyberShieldModel = CyberShieldModel;
}

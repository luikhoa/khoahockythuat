import type { Prediction } from "../lib/types";
import type {
  InferenceError,
  InferenceErrorKind,
  InferenceProvider,
  ModelStatus,
} from "./protocol";

export interface EncodedInput {
  text: string;
  inputIds: BigInt64Array;
  attentionMask: BigInt64Array;
  dims: [number, number];
}

export interface TokenizerAdapter {
  encode(text: string): Promise<EncodedInput>;
}

export interface InferenceSession {
  run(input: EncodedInput): Promise<readonly number[]>;
  dispose(): Promise<void>;
}

export interface InferenceAdapter {
  loadTokenizer(): Promise<TokenizerAdapter>;
  createSession(provider: InferenceProvider): Promise<InferenceSession>;
}

interface RuntimeOptions {
  maxCacheEntries?: number;
  maxQueueSize?: number;
}

interface QueueItem {
  input: EncodedInput;
  resolve: (prediction: Prediction) => void;
  reject: (error: unknown) => void;
}

const MAX_CONTENT_LENGTH = 1_200;
// Nguồn sự thật duy nhất cho ngưỡng quyết định — PHẢI khớp tay với
// backend/threshold.py::TOXIC_THRESHOLD (TypeScript không import được file
// Python đó). Xem rationale đầy đủ + PR-curve ở backend/threshold.py: 0.25
// tối ưu F1 trên checkpoint phobert-offensive-1, không phải 0.4/0.5 — nâng
// ngưỡng làm F1 tệ hơn vì phần lớn true positive có p1 nằm trong 0.40-0.62.
// content.ts không còn tự áp ngưỡng blur riêng (QA-006/W6) — chỉ tin theo
// `label` được tính ở đây, nên đây là ngưỡng THẬT SỰ duy nhất còn lại phía
// runtime extension. Hiệu chỉnh lại sau mỗi lần retrain bằng
// backend/calibrate_threshold.py.
const TOXIC_THRESHOLD = 0.25;

export class ModelRuntimeError extends Error implements InferenceError {
  readonly kind: InferenceErrorKind;
  readonly retryable: boolean;

  constructor(kind: InferenceErrorKind, retryable: boolean, message?: string) {
    super(message ?? kind);
    this.name = "ModelRuntimeError";
    this.kind = kind;
    this.retryable = retryable;
  }

  toJSON(): InferenceError {
    return { kind: this.kind, retryable: this.retryable, message: this.message };
  }
}

export class ModelRuntime {
  private readonly maxCacheEntries: number;
  private readonly maxQueueSize: number;
  private readonly cache = new Map<string, Prediction>();
  private readonly inFlight = new Map<string, Promise<Prediction>>();
  private readonly queue: QueueItem[] = [];

  private status: ModelStatus = { state: "loading" };
  private tokenizer?: TokenizerAdapter;
  private session?: InferenceSession;
  private initializePromise?: Promise<ModelStatus>;
  private processing = false;

  constructor(
    private readonly adapter: InferenceAdapter,
    options: RuntimeOptions = {},
  ) {
    this.maxCacheEntries = options.maxCacheEntries ?? 4_000;
    this.maxQueueSize = options.maxQueueSize ?? 128;
    if (this.maxCacheEntries < 1 || this.maxQueueSize < 1) {
      throw new Error("Cache and queue limits must be positive");
    }
  }

  getStatus(): ModelStatus {
    return this.status;
  }

  initialize(): Promise<ModelStatus> {
    if (this.status.state === "ready-webgpu" || this.status.state === "ready-wasm") {
      return Promise.resolve(this.status);
    }
    if (this.status.state === "error") return Promise.resolve(this.status);
    if (this.initializePromise) return this.initializePromise;

    this.status = { state: "loading" };
    this.initializePromise = this.initializeProviders();
    return this.initializePromise;
  }

  predict(content: string): Promise<Prediction> {
    try {
      this.validateContent(content);
    } catch (error) {
      return Promise.reject(error);
    }

    const cached = this.cache.get(content);
    if (cached) {
      this.cache.delete(content);
      this.cache.set(content, cached);
      return Promise.resolve(cached);
    }

    const existing = this.inFlight.get(content);
    if (existing) return existing;

    if (this.inFlight.size >= this.maxQueueSize) {
      return Promise.reject(new ModelRuntimeError("busy", true, "Inference queue is full"));
    }

    const predictionPromise = this.preparePrediction(content);
    const trackedPromise = predictionPromise.finally(() => this.inFlight.delete(content));
    this.inFlight.set(content, trackedPromise);
    return trackedPromise;
  }

  private async preparePrediction(content: string): Promise<Prediction> {
    const status = await this.initialize();
    if (status.state === "error") {
      throw new ModelRuntimeError("model-load", false, status.error.message);
    }
    if (!this.tokenizer || !this.session) {
      throw new ModelRuntimeError("model-loading", true, "Model is still loading");
    }

    let resolvePrediction!: (prediction: Prediction) => void;
    let rejectPrediction!: (error: unknown) => void;
    const predictionPromise = new Promise<Prediction>((resolve, reject) => {
      resolvePrediction = resolve;
      rejectPrediction = reject;
    });

    try {
      const input = await this.tokenizer.encode(content);
      this.queue.push({ input, resolve: resolvePrediction, reject: rejectPrediction });
      this.pumpQueue();
    } catch (error) {
      throw new ModelRuntimeError("inference", true, errorMessage(error));
    }

    return predictionPromise;
  }

  async dispose(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    this.tokenizer = undefined;
    this.initializePromise = undefined;
    this.status = { state: "loading" };
    this.cache.clear();
    if (session) await session.dispose();
  }

  private async initializeProviders(): Promise<ModelStatus> {
    try {
      this.tokenizer = await this.adapter.loadTokenizer();
    } catch (error) {
      return this.failInitialization(error);
    }

    let lastError: unknown;
    for (const provider of ["webgpu", "wasm"] as const) {
      let candidate: InferenceSession | undefined;
      try {
        candidate = await this.adapter.createSession(provider);
        const warmup = await this.tokenizer.encode("kiểm tra");
        validateLogits(await candidate.run(warmup));
        this.session = candidate;
        this.status = provider === "webgpu"
          ? { state: "ready-webgpu", provider }
          : { state: "ready-wasm", provider };
        return this.status;
      } catch (error) {
        lastError = error;
        if (candidate) await candidate.dispose().catch(() => undefined);
      }
    }

    return this.failInitialization(lastError);
  }

  private failInitialization(error: unknown): ModelStatus {
    const runtimeError = new ModelRuntimeError("model-load", false, errorMessage(error));
    this.status = { state: "error", error: runtimeError.toJSON() };
    return this.status;
  }

  private pumpQueue(): void {
    if (this.processing) return;
    const item = this.queue.shift();
    if (!item) return;
    this.processing = true;

    void this.runItem(item).finally(() => {
      this.processing = false;
      this.pumpQueue();
    });
  }

  private async runItem(item: QueueItem): Promise<void> {
    try {
      if (!this.session) {
        throw new ModelRuntimeError("model-load", false, "Inference session is unavailable");
      }
      const prediction = predictionFromLogits(await this.session.run(item.input));
      this.storeCache(item.input.text, prediction);
      item.resolve(prediction);
    } catch (error) {
      item.reject(error instanceof ModelRuntimeError
        ? error
        : new ModelRuntimeError("inference", true, errorMessage(error)));
    }
  }

  private storeCache(text: string, prediction: Prediction): void {
    this.cache.delete(text);
    this.cache.set(text, prediction);
    if (this.cache.size > this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
  }

  private validateContent(content: string): void {
    if (!content.trim() || content.length > MAX_CONTENT_LENGTH) {
      throw new ModelRuntimeError(
        "invalid-response",
        false,
        `Content must contain 1-${MAX_CONTENT_LENGTH} characters`,
      );
    }
  }
}

function predictionFromLogits(logits: readonly number[]): Prediction {
  const logit = validateLogits(logits);
  const p1Raw = 1 / (1 + Math.exp(-logit));
  const label = p1Raw >= TOXIC_THRESHOLD ? 1 : 0;
  const proba: [number, number] = [round4(1 - p1Raw), round4(p1Raw)];
  return {
    label,
    name: label === 1 ? "độc hại" : "an toàn",
    confidence: proba[label],
    proba,
  };
}

function validateLogits(logits: readonly number[]): number {
  if (logits.length !== 1 || !Number.isFinite(logits[0])) {
    throw new ModelRuntimeError("invalid-response", false, "Model must return one finite logit");
  }
  return logits[0];
}

function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

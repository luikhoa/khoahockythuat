import type { Prediction } from "../lib/types";

export type InferenceProvider = "webgpu" | "wasm";

export type ModelStatus =
  | { state: "loading" }
  | { state: "ready-webgpu"; provider: "webgpu" }
  | { state: "ready-wasm"; provider: "wasm" }
  | { state: "error"; error: InferenceError };

export type InferenceErrorKind =
  | "model-loading"
  | "model-load"
  | "inference"
  | "busy"
  | "invalid-response";

export interface InferenceError {
  kind: InferenceErrorKind;
  retryable: boolean;
  message?: string;
}

export type InferenceWorkerRequest =
  | { requestId: string; type: "initialize" }
  | { requestId: string; type: "predict"; content: string }
  | { requestId: string; type: "status" }
  | { requestId: string; type: "dispose" };

export type InferenceWorkerResponse =
  | { requestId: string; ok: true; type: "initialize" | "status"; data: ModelStatus }
  | { requestId: string; ok: true; type: "predict"; data: Prediction }
  | { requestId: string; ok: true; type: "dispose"; data: null }
  | { requestId: string; ok: false; error: InferenceError };

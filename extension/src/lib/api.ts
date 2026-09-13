/**
 * api.ts — Cầu nối giữa content script và backend AI.
 *
 * predict() gửi text tới backend (POST http://127.0.0.1:8000/predict, xem
 * backend/predictor.py) để phân loại; việc suy luận không còn chạy trong
 * trình duyệt.
 *
 * model.json vẫn được tải để lấy thông tin mô tả mô hình (phiên bản,
 * macro-F1 lúc huấn luyện) hiển thị trong popup — không dùng để suy luận.
 */
import type {
  BackendMessage,
  BackendResponse,
  EventPayload,
  ModelMeta,
  Prediction,
  StatsSnapshot,
} from "./types";

const BACKEND_URL = "http://127.0.0.1:8000";

interface ModelFile {
  meta: ModelMeta;
  // vocab/coef/intercept vẫn có trong model.json nhưng không còn dùng để suy
  // luận trong trình duyệt — không cần khai báo kiểu chi tiết ở đây.
  [key: string]: unknown;
}

let M: ModelFile | null = null;

async function load(url: string): Promise<ModelMeta> {
  const res = await fetch(url);
  M = (await res.json()) as ModelFile;
  return M.meta;
}

async function directOnce<T>(message: BackendMessage): Promise<BackendResponse<T>> {
  const route = message.type === "health"
    ? "/health"
    : message.type === "predict"
      ? "/predict"
      : message.type === "stats"
        ? `/stats?range=${message.range}`
        : "/events";
  const method = message.type === "health" || message.type === "stats" ? "GET" : "POST";
  const body = message.type === "predict"
    ? JSON.stringify({ content: message.content })
    : message.type === "event"
      ? JSON.stringify(message.event)
      : undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), message.type === "predict" ? 15_000 : 3_000);
  try {
    const response = await fetch(`${BACKEND_URL}${route}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body,
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: { kind: "http", retryable: response.status >= 500 } };
    return { ok: true, data: await response.json() as T };
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError"
      ? { ok: false, error: { kind: "timeout", retryable: true } }
      : { ok: false, error: { kind: "network", retryable: true } };
  } finally {
    clearTimeout(timeout);
  }
}

async function directRequest<T>(message: BackendMessage): Promise<BackendResponse<T>> {
  const first = await directOnce<T>(message);
  if (message.type !== "predict" || first.ok || !first.error.retryable) return first;
  await new Promise((resolve) => setTimeout(resolve, 500));
  return directOnce<T>(message);
}

function hasExtensionRuntime(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

async function request<T>(message: BackendMessage): Promise<T> {
  const envelope = hasExtensionRuntime()
    ? await chrome.runtime.sendMessage<BackendMessage, BackendResponse<T>>(message)
    : await directRequest<T>(message);
  if (!envelope.ok) {
    const error = new Error(envelope.error.kind);
    Object.assign(error, envelope.error);
    throw error;
  }
  return envelope.data;
}

async function predict(raw: string): Promise<Prediction> {
  return request<Prediction>({ type: "predict", content: raw });
}

export const CyberShieldModel = {
  load,
  predict,
  health: () => request<{ status: string }>({ type: "health" }),
  stats: (range: "day" | "week") => request<StatsSnapshot>({ type: "stats", range }),
  event: (event: EventPayload) => request<{ ok: boolean }>({ type: "event", event }),
  get meta(): ModelMeta | null {
    return M ? M.meta : null;
  },
};

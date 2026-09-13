import type { BackendMessage, BackendResponse } from "./lib/types";

const BACKEND_URL = "http://127.0.0.1:8000";

function failure(kind: "timeout" | "network" | "http" | "invalid-response", retryable: boolean): BackendResponse<never> {
  return { ok: false, error: { kind, retryable } };
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce(message: BackendMessage): Promise<BackendResponse<unknown>> {
  const controller = new AbortController();
  const timeoutMs = message.type === "predict" ? 15_000 : 3_000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const route = message.type === "health"
    ? "/health"
    : message.type === "predict"
      ? "/predict"
      : message.type === "stats"
        ? `/stats?range=${message.range}`
        : "/events";
  const body = message.type === "predict"
    ? JSON.stringify({ content: message.content })
    : message.type === "event"
      ? JSON.stringify(message.event)
      : undefined;

  try {
    const response = await fetch(BACKEND_URL + route, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body,
      signal: controller.signal,
    });
    if (!response.ok) return failure("http", response.status >= 500);
    try {
      return { ok: true, data: await response.json() as unknown };
    } catch {
      return failure("invalid-response", false);
    }
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError"
      ? failure("timeout", true)
      : failure("network", true);
  } finally {
    clearTimeout(timeout);
  }
}

export async function dispatch(message: BackendMessage): Promise<BackendResponse<unknown>> {
  const first = await fetchOnce(message);
  if (message.type !== "predict" || first.ok || !first.error.retryable) return first;
  await wait(500);
  return fetchOnce(message);
}

chrome.runtime.onMessage.addListener((message: BackendMessage, _sender, sendResponse) => {
  void dispatch(message).then(sendResponse);
  return true;
});

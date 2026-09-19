// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn(() => {
    throw new Error("network fetch is forbidden for control requests");
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CyberShieldModel extension transport", () => {
  it("gửi predict/status/event/stats qua chrome.runtime mà không fetch", async () => {
    const sendMessage = vi.fn(async (message: { type: string }) => ({
      ok: true,
      data: message.type === "predict"
        ? { label: 0, name: "an toàn", confidence: 0.9, proba: [0.9, 0.1] }
        : message.type === "model-status"
          ? { state: "ready-webgpu", provider: "webgpu" }
          : { ok: true },
    }));
    vi.stubGlobal("chrome", { runtime: { id: "fixture", sendMessage } });
    const { CyberShieldModel } = await import("./api");

    await CyberShieldModel.predict("xin chào");
    await CyberShieldModel.status();
    await CyberShieldModel.event({ type: "scanned", count: 1 });
    await CyberShieldModel.clearStats("day");

    expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual([
      "predict", "model-status", "event", "clear-stats",
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("từ chối response envelope sai schema", async () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "fixture", sendMessage: vi.fn(async () => ({ success: true })) },
    });
    const { CyberShieldModel } = await import("./api");

    await expect(CyberShieldModel.predict("fixture")).rejects.toMatchObject({
      kind: "invalid-response",
      retryable: false,
    });
  });

  it("giữ lỗi có cấu trúc từ service worker", async () => {
    vi.stubGlobal("chrome", {
      runtime: {
        id: "fixture",
        sendMessage: vi.fn(async () => ({
          ok: false,
          error: { kind: "busy", retryable: true, message: "queue full" },
        })),
      },
    });
    const { CyberShieldModel } = await import("./api");

    await expect(CyberShieldModel.predict("fixture")).rejects.toMatchObject({
      kind: "busy",
      retryable: true,
      message: "queue full",
    });
  });
});

describe("CyberShieldModel standalone transport", () => {
  it("dùng inference worker local và correlate prediction", async () => {
    class FakeWorker {
      static instances: FakeWorker[] = [];
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      readonly postMessage = vi.fn((message: { requestId: string; type: string }) => {
        queueMicrotask(() => this.onmessage?.({ data: {
          requestId: message.requestId,
          ok: true,
          type: message.type,
          data: { label: 1, name: "độc hại", confidence: 0.8, proba: [0.2, 0.8] },
        } } as MessageEvent));
      });
      readonly terminate = vi.fn();
      constructor(readonly url: URL | string) { FakeWorker.instances.push(this); }
    }
    vi.stubGlobal("chrome", undefined);
    vi.stubGlobal("Worker", FakeWorker);
    const { CyberShieldModel } = await import("./api");

    await expect(CyberShieldModel.predict("đồ ngu")).resolves.toMatchObject({ label: 1 });
    expect(FakeWorker.instances).toHaveLength(1);
    expect(String(FakeWorker.instances[0].url)).toContain("extension/dist/inference-worker.js");
    expect(FakeWorker.instances[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "predict",
      content: "đồ ngu",
    }));
    expect(fetch).not.toHaveBeenCalled();
  });
});

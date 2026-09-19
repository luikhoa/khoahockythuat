import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chromeMocks = vi.hoisted(() => ({
  createDocument: vi.fn(async () => undefined),
  getContexts: vi.fn(async () => [] as Array<{ documentUrl: string }>),
  sendMessage: vi.fn(),
  addListener: vi.fn(),
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  chromeMocks.getContexts.mockResolvedValue([]);
  chromeMocks.sendMessage.mockImplementation(async (message: { requestId: string; content?: string }) => ({
    ok: true,
    data: message.content ? { content: message.content, requestId: message.requestId } : { state: "ready-wasm" },
  }));
  vi.stubGlobal("fetch", vi.fn(() => {
    throw new Error("background must not call fetch");
  }));
  vi.stubGlobal("chrome", {
    runtime: {
      id: "fixture-extension",
      getURL: (path: string) => `chrome-extension://fixture-extension/${path}`,
      getContexts: chromeMocks.getContexts,
      sendMessage: chromeMocks.sendMessage,
      onMessage: { addListener: chromeMocks.addListener },
    },
    offscreen: { createDocument: chromeMocks.createDocument },
    storage: { local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() } },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("background offscreen routing", () => {
  it("chỉ tạo một offscreen document cho hai predict đồng thời", async () => {
    const { dispatch } = await import("./background");

    const [first, second] = await Promise.all([
      dispatch({ type: "predict", content: "một" }),
      dispatch({ type: "predict", content: "hai" }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(chromeMocks.createDocument).toHaveBeenCalledTimes(1);
    expect(chromeMocks.createDocument).toHaveBeenCalledWith({
      url: "dist/offscreen.html",
      reasons: ["WORKERS"],
      justification: expect.any(String),
    });
  });

  it("dùng lại offscreen context đang tồn tại", async () => {
    chromeMocks.getContexts.mockResolvedValue([
      { documentUrl: "chrome-extension://fixture-extension/dist/offscreen.html" },
    ]);
    const { dispatch } = await import("./background");

    await dispatch({ type: "model-status" });

    expect(chromeMocks.createDocument).not.toHaveBeenCalled();
  });

  it("giữ đúng response khi worker trả hai request ngược thứ tự", async () => {
    const resolvers = new Map<string, (value: unknown) => void>();
    chromeMocks.sendMessage.mockImplementation((message: { requestId: string }) => new Promise((resolve) => {
      resolvers.set(message.requestId, resolve);
    }));
    const { dispatch } = await import("./background");
    const first = dispatch({ type: "predict", requestId: "request-a", content: "A" });
    const second = dispatch({ type: "predict", requestId: "request-b", content: "B" });
    await vi.waitFor(() => expect(resolvers.size).toBe(2));

    resolvers.get("request-b")?.({ ok: true, data: { value: "B" } });
    resolvers.get("request-a")?.({ ok: true, data: { value: "A" } });

    await expect(first).resolves.toEqual({ ok: true, data: { value: "A" } });
    await expect(second).resolves.toEqual({ ok: true, data: { value: "B" } });
  });

  it("truyền nguyên lỗi có cấu trúc từ worker", async () => {
    chromeMocks.sendMessage.mockResolvedValue({
      ok: false,
      error: { kind: "busy", retryable: true, message: "queue full" },
    });
    const { dispatch } = await import("./background");

    await expect(dispatch({ type: "predict", content: "fixture" })).resolves.toEqual({
      ok: false,
      error: { kind: "busy", retryable: true, message: "queue full" },
    });
  });

  it("gửi retry-model tới offscreen host và không gọi fetch", async () => {
    const { dispatch } = await import("./background");

    await dispatch({ type: "retry-model", requestId: "retry-1" });

    expect(chromeMocks.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      target: "offscreen",
      type: "retry-model",
      requestId: "retry-1",
    }));
    expect(fetch).not.toHaveBeenCalled();
  });
});

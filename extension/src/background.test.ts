import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("chrome", { runtime: { onMessage: { addListener: vi.fn() } } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("background transport", () => {
  it("retry predict một lần sau 500 ms khi lỗi mạng", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ label: 0 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { dispatch } = await import("./background");
    const resultPromise = dispatch({ type: "predict", content: "fixture" });
    await vi.advanceTimersByTimeAsync(500);
    const result = await resultPromise;
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("không retry HTTP 4xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 422 }));
    vi.stubGlobal("fetch", fetchMock);
    const { dispatch } = await import("./background");
    const result = await dispatch({ type: "predict", content: "fixture" });
    expect(result).toEqual({ ok: false, error: { kind: "http", retryable: false } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

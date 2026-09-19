import { describe, expect, it, vi } from "vitest";

import {
  ModelRuntime,
  ModelRuntimeError,
  type EncodedInput,
  type InferenceAdapter,
  type InferenceSession,
} from "./model-runtime";

function encoded(text: string): EncodedInput {
  return {
    text,
    inputIds: new BigInt64Array([0n, 2n]),
    attentionMask: new BigInt64Array([1n, 1n]),
    dims: [1, 2],
  };
}

function adapterWith(
  createSession: InferenceAdapter["createSession"],
): InferenceAdapter {
  return {
    loadTokenizer: vi.fn(async () => ({ encode: async (text: string) => encoded(text) })),
    createSession,
  };
}

function sessionWith(run: InferenceSession["run"]): InferenceSession {
  return { run, dispose: vi.fn(async () => undefined) };
}

describe("ModelRuntime", () => {
  it("khởi tạo WebGPU đúng một lần cho các caller đồng thời", async () => {
    const session = sessionWith(vi.fn(async () => [0]));
    const adapter = adapterWith(vi.fn(async () => session));
    const runtime = new ModelRuntime(adapter);

    const [first, second] = await Promise.all([runtime.initialize(), runtime.initialize()]);

    expect(first).toEqual({ state: "ready-webgpu", provider: "webgpu" });
    expect(second).toEqual(first);
    expect(adapter.loadTokenizer).toHaveBeenCalledTimes(1);
    expect(adapter.createSession).toHaveBeenCalledTimes(1);
    expect(session.run).toHaveBeenCalledTimes(1); // warm-up
  });

  it("fallback sang WASM khi WebGPU không tạo hoặc warm-up được", async () => {
    const wasm = sessionWith(vi.fn(async () => [0]));
    const adapter = adapterWith(vi.fn(async (provider) => {
      if (provider === "webgpu") throw new Error("operator unsupported");
      return wasm;
    }));

    const status = await new ModelRuntime(adapter).initialize();

    expect(status).toEqual({ state: "ready-wasm", provider: "wasm" });
    expect(adapter.createSession).toHaveBeenCalledTimes(2);
  });

  it("báo model-load không retry khi cả hai provider đều lỗi", async () => {
    const runtime = new ModelRuntime(adapterWith(vi.fn(async () => {
      throw new Error("cannot load");
    })));

    expect(await runtime.initialize()).toMatchObject({ state: "error" });
    await expect(runtime.predict("xin chào")).rejects.toMatchObject({
      kind: "model-load",
      retryable: false,
    });
  });

  it("hợp nhất hai request cùng text đang chạy", async () => {
    let finish: ((value: readonly number[]) => void) | undefined;
    const run = vi.fn(async (input: EncodedInput) => {
      if (input.text === "kiểm tra") return [0];
      return new Promise<readonly number[]>((resolve) => { finish = resolve; });
    });
    const runtime = new ModelRuntime(adapterWith(vi.fn(async () => sessionWith(run))));
    await runtime.initialize();

    const first = runtime.predict("đồ ngu");
    const second = runtime.predict("đồ ngu");
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    finish?.([1]);

    expect(await first).toEqual(await second);
    expect(run).toHaveBeenCalledTimes(2); // warm-up + one prediction
  });

  it("cache LRU chạm lại entry và loại entry cũ nhất", async () => {
    const run = vi.fn(async () => [0]);
    const runtime = new ModelRuntime(
      adapterWith(vi.fn(async () => sessionWith(run))),
      { maxCacheEntries: 2 },
    );
    await runtime.initialize();

    await runtime.predict("a");
    await runtime.predict("b");
    await runtime.predict("a");
    await runtime.predict("c");
    await runtime.predict("b");

    expect(run).toHaveBeenCalledTimes(5); // warm-up + a,b,c,b; second a is cached
  });

  it("trả busy khi hàng đợi unique đã đầy", async () => {
    let finish: ((value: readonly number[]) => void) | undefined;
    const run = vi.fn(async (input: EncodedInput) => {
      if (input.text === "kiểm tra") return [0];
      return new Promise<readonly number[]>((resolve) => { finish = resolve; });
    });
    const runtime = new ModelRuntime(
      adapterWith(vi.fn(async () => sessionWith(run))),
      { maxQueueSize: 1 },
    );
    await runtime.initialize();

    const first = runtime.predict("một");
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await expect(runtime.predict("hai")).rejects.toMatchObject({ kind: "busy", retryable: true });
    finish?.([0]);
    await first;
  });

  it.each(["", " ", "x".repeat(1201)])("từ chối input không hợp lệ", async (text) => {
    const run = vi.fn(async () => [0]);
    const runtime = new ModelRuntime(adapterWith(vi.fn(async () => sessionWith(run))));

    await expect(runtime.predict(text)).rejects.toBeInstanceOf(ModelRuntimeError);
    await expect(runtime.predict(text)).rejects.toMatchObject({
      kind: "invalid-response",
      retryable: false,
    });
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    { output: [Number.NaN] },
    { output: [] },
    { output: [1, 2] },
  ])("từ chối output model sai schema", async ({ output }) => {
    const run = vi.fn(async (input: EncodedInput) => input.text === "kiểm tra" ? [0] : output);
    const runtime = new ModelRuntime(adapterWith(vi.fn(async () => sessionWith(run))));

    await expect(runtime.predict("nội dung")).rejects.toMatchObject({
      kind: "invalid-response",
      retryable: false,
    });
  });

  it("áp dụng sigmoid, threshold và làm tròn giống predictor Python", async () => {
    const run = vi.fn(async (input: EncodedInput) => input.text === "kiểm tra" ? [0] : [1]);
    const runtime = new ModelRuntime(adapterWith(vi.fn(async () => sessionWith(run))));

    await expect(runtime.predict("đồ ngu")).resolves.toEqual({
      label: 1,
      name: "độc hại",
      confidence: 0.7311,
      proba: [0.2689, 0.7311],
    });
  });
});

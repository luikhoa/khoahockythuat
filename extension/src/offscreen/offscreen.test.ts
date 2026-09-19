import { describe, expect, it, vi } from "vitest";

import type { InferenceWorkerRequest, InferenceWorkerResponse } from "../inference/protocol";
import type { OffscreenMessage } from "../lib/types";
import { InferenceWorkerHost, type WorkerPort } from "./offscreen";

class FakeWorker implements WorkerPort {
  readonly sent: InferenceWorkerRequest[] = [];
  readonly terminate = vi.fn();
  onmessage: ((event: MessageEvent<InferenceWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(message: InferenceWorkerRequest): void {
    this.sent.push(message);
  }

  respond(response: InferenceWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<InferenceWorkerResponse>);
  }

  crash(message: string): void {
    this.onerror?.({ message, preventDefault: vi.fn() } as unknown as ErrorEvent);
  }
}

function predict(requestId: string, content: string): OffscreenMessage {
  return { target: "offscreen", type: "predict", requestId, content };
}

describe("InferenceWorkerHost", () => {
  it("correlate hai response về ngược thứ tự", async () => {
    const workers: FakeWorker[] = [];
    const host = new InferenceWorkerHost(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });

    const first = host.handle(predict("a", "một"));
    const second = host.handle(predict("b", "hai"));
    expect(workers).toHaveLength(1);
    workers[0].respond({ requestId: "b", ok: true, type: "predict", data: {
      label: 0, name: "an toàn", confidence: 0.9, proba: [0.9, 0.1],
    } });
    workers[0].respond({ requestId: "a", ok: true, type: "predict", data: {
      label: 1, name: "độc hại", confidence: 0.8, proba: [0.2, 0.8],
    } });

    await expect(first).resolves.toMatchObject({ ok: true, data: { label: 1 } });
    await expect(second).resolves.toMatchObject({ ok: true, data: { label: 0 } });
  });

  it("trả lỗi request đang chờ và tạo worker mới ở predict tiếp theo sau crash", async () => {
    const workers: FakeWorker[] = [];
    const host = new InferenceWorkerHost(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });

    const failed = host.handle(predict("crash", "một"));
    workers[0].crash("worker died");
    await expect(failed).resolves.toEqual({
      ok: false,
      error: { kind: "inference", retryable: true, message: "worker died" },
    });

    const recovered = host.handle(predict("recovered", "hai"));
    expect(workers).toHaveLength(2);
    workers[1].respond({ requestId: "recovered", ok: true, type: "predict", data: {
      label: 0, name: "an toàn", confidence: 1, proba: [1, 0],
    } });
    await expect(recovered).resolves.toMatchObject({ ok: true, data: { label: 0 } });
  });

  it("retry-model terminate worker cũ và initialize worker mới", async () => {
    const workers: FakeWorker[] = [];
    const host = new InferenceWorkerHost(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const first = host.handle(predict("first", "một"));
    workers[0].respond({ requestId: "first", ok: true, type: "predict", data: {
      label: 0, name: "an toàn", confidence: 1, proba: [1, 0],
    } });
    await first;

    const retried = host.handle({ target: "offscreen", type: "retry-model", requestId: "retry" });

    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(2);
    expect(workers[1].sent).toEqual([{ type: "initialize", requestId: "retry" }]);
    workers[1].respond({
      requestId: "retry",
      ok: true,
      type: "initialize",
      data: { state: "ready-wasm", provider: "wasm" },
    });
    await expect(retried).resolves.toEqual({
      ok: true,
      data: { state: "ready-wasm", provider: "wasm" },
    });
  });
});

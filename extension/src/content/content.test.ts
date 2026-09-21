// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  predict: vi.fn(),
  status: vi.fn(),
  event: vi.fn(),
}));

vi.mock("../lib/api", () => ({ CyberShieldModel: api }));
vi.mock("../lib/linkcheck", () => ({
  CyberShieldLink: { check: (url: string) => url.endsWith(".xyz/")
    ? { level: "nguy hiểm", score: 10, reasons: ["fixture"] }
    : { level: "an toàn", score: 0, reasons: [] } },
}));

const safe = { label: 0 as const, name: "an toàn", confidence: 0.9, proba: [0.9, 0.1] as [number, number] };

async function start(html: string): Promise<void> {
  document.body.innerHTML = html;
  await import("./content");
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await vi.waitFor(() => expect(window.CyberShield).toBeDefined());
}

beforeEach(() => {
  window.CyberShield?.dừng();
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  api.predict.mockResolvedValue(safe);
  api.status.mockResolvedValue({ state: "ready-wasm", provider: "wasm" });
  api.event.mockResolvedValue({ ok: true });
});

describe("DOM scanner", () => {
  it("quét mỗi fingerprint ban đầu đúng một lần", async () => {
    await start("<p>Cùng một nội dung</p><p>Cùng   một nội dung</p><p>Nội dung khác</p>");
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(2));
    expect(api.predict).toHaveBeenCalledWith("Cùng một nội dung");
  });

  it("bỏ qua draft nhưng quét message sau khi render", async () => {
    await start("<input value='draft riêng tư'><textarea>draft khác</textarea><div contenteditable='true'>đang gõ bí mật</div><main></main>");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.predict).not.toHaveBeenCalled();
    const message = document.createElement("p");
    message.textContent = "Tin nhắn đã gửi";
    document.querySelector("main")!.appendChild(message);
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledWith("Tin nhắn đã gửi"));
  });

  it("quét node được append và text của node cũ thay đổi", async () => {
    await start("<main><p id='old'>Nội dung ban đầu</p></main>");
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(1));
    const added = document.createElement("p");
    added.textContent = "Nội dung thêm sau";
    document.querySelector("main")!.appendChild(added);
    document.querySelector("#old")!.textContent = "Nội dung đã đổi";
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(3));
  });

  it("kiểm tra lại đúng anchor khi href thay đổi", async () => {
    await start("<a id='link' href='https://example.com'>Liên kết fixture</a>");
    const link = document.querySelector("#link") as HTMLAnchorElement;
    expect(link.classList.contains("cs-link-danger")).toBe(false);
    link.href = "https://phishing.xyz";
    await vi.waitFor(() => expect(link.classList.contains("cs-link-danger")).toBe(true));
  });

  it("blur theo đúng label model trả về, không còn dead-zone ngưỡng riêng (QA-006/W6)", async () => {
    // Trước khi sửa QA-006/W6: content.ts tự đòi confidence >= 0.6 để blur,
    // trong khi model (model-runtime.ts) đã quyết định label=1 ở ngưỡng
    // thấp hơn nhiều (0.25) — mọi confidence trong khoảng giữa hai ngưỡng
    // đó bị coi là "độc hại" ở tầng model nhưng không bao giờ hiện cảnh báo.
    // Nay content.ts tin thẳng theo `label`, nên một confidence thấp như
    // 0.26 (ngay trên ngưỡng model, xa dưới ngưỡng blur cũ 0.6) vẫn phải blur.
    api.predict
      .mockResolvedValueOnce({ label: 1, name: "độc hại", confidence: 0.26, proba: [0.74, 0.26] })
      .mockResolvedValueOnce({ label: 0, name: "an toàn", confidence: 0.9, proba: [0.9, 0.1] });
    await start("<p id='hit'>Độc hại ngay trên ngưỡng model</p><p id='safe'>An toàn</p>");
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(document.querySelector("#hit")!.classList.contains("cs-blur")).toBe(true));
    expect(document.querySelector("#safe")!.classList.contains("cs-blur")).toBe(false);
    (document.querySelector(".cs-reveal") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.querySelector("#hit")!.classList.contains("cs-blur")).toBe(false);
    expect(api.predict).toHaveBeenCalledTimes(2);
  });

  it("bỏ response cũ khi text đổi trong lúc request đang chạy", async () => {
    let resolveFirst!: (value: typeof safe) => void;
    api.predict.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }));
    await start("<p id='target'>Nội dung cũ</p>");
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(1));
    document.querySelector("#target")!.textContent = "Nội dung mới";
    resolveFirst(safe);
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledWith("Nội dung mới"));
    expect(window.CyberShield.stats().scanned).toBe(1);
  });

  it.each(["model-loading", "busy"])("giữ lỗi %s trong hàng đợi và retry sau status ready", async (kind) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    api.predict.mockRejectedValueOnce(Object.assign(new Error(kind), { kind, retryable: true }))
      .mockResolvedValueOnce(safe);
    await start("<p>Nội dung chờ mô hình</p>");
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(1));
    expect(window.CyberShield.stats().scanned).toBe(0);
    await vi.waitFor(() => expect(api.status).toHaveBeenCalledTimes(1), { timeout: 1500 });
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(window.CyberShield.stats().scanned).toBe(1));
  });

  it("pause AI khi model-load vĩnh viễn nhưng vẫn đánh dấu link", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    api.predict.mockRejectedValue(Object.assign(new Error("model-load"), {
      kind: "model-load",
      retryable: false,
    }));
    await start("<p>Nội dung cần AI</p><a href='https://phishing.xyz'>Link nguy hiểm</a>");
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(1));

    const extra = document.createElement("p");
    extra.textContent = "Nội dung thêm sau lỗi";
    document.body.appendChild(extra);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(api.predict).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a")!.classList.contains("cs-link-danger")).toBe(true);
  });

  it("chỉ gửi event delta và không ghi snapshot từ content tab", async () => {
    const storageSet = vi.fn();
    vi.stubGlobal("chrome", { storage: { local: { set: storageSet } }, runtime: {} });
    await start("<p>Nội dung thống kê</p>");
    await vi.waitFor(() => expect(window.CyberShield.stats().scanned).toBe(1));
    await vi.waitFor(() => expect(api.event).toHaveBeenCalledWith({ type: "scanned", count: 1 }), {
      timeout: 2_000,
    });
    expect(storageSet).not.toHaveBeenCalled();
    expect(api.event.mock.calls.every(([event]) => !Object.prototype.hasOwnProperty.call(event, "scanned"))).toBe(true);
  });
});

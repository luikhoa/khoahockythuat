// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  predict: vi.fn(),
  health: vi.fn(),
  event: vi.fn(),
  load: vi.fn(),
  meta: null as null,
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
  api.predict.mockResolvedValue(safe);
  api.health.mockResolvedValue({ status: "ok" });
  api.event.mockResolvedValue({ ok: true });
  api.load.mockResolvedValue({ "phương_án": "fixture", macro_f1_cv: 1 });
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

  it("giữ threshold 60% và reveal không bị quét lại", async () => {
    api.predict
      .mockResolvedValueOnce({ label: 1, name: "độc hại", confidence: 0.59, proba: [0.41, 0.59] })
      .mockResolvedValueOnce({ label: 1, name: "độc hại", confidence: 0.6, proba: [0.4, 0.6] });
    await start("<p id='low'>Độc hại dưới ngưỡng</p><p id='hit'>Độc hại đúng ngưỡng</p>");
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(2));
    expect(document.querySelector("#low")!.classList.contains("cs-blur")).toBe(false);
    await vi.waitFor(() => expect(document.querySelector("#hit")!.classList.contains("cs-blur")).toBe(true));
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

  it("giữ request lỗi trong hàng đợi và chạy lại khi health online", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    api.predict.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(safe);
    await start("<p>Nội dung chờ backend</p>");
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(1));
    expect(window.CyberShield.stats().scanned).toBe(0);
    await vi.waitFor(() => expect(api.health).toHaveBeenCalledTimes(1), { timeout: 1500 });
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(window.CyberShield.stats().scanned).toBe(1));
  });
});

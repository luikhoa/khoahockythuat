// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  predict: vi.fn(),
  status: vi.fn(),
  event: vi.fn(),
}));

type ContentMessageListener = (
  message: { type?: string },
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean;

let contentMessageListener: ContentMessageListener | undefined;
const addContentMessageListener = vi.fn((listener: ContentMessageListener) => {
  contentMessageListener = listener;
});
const removeContentMessageListener = vi.fn((listener: ContentMessageListener) => {
  if (contentMessageListener === listener) contentMessageListener = undefined;
});

vi.mock("../lib/api", () => ({ CyberShieldModel: api }));
vi.mock("../lib/linkcheck", () => ({
  CyberShieldLink: { check: (url: string) => url.endsWith(".xyz/")
    ? { level: "nguy hiểm", score: 10, reasons: ["fixture"] }
    : { level: "an toàn", score: 0, reasons: [] } },
}));

const safe = { label: 0 as const, name: "an toàn", confidence: 0.9, proba: [0.9, 0.1] as [number, number] };
const belowUiThreshold = {
  label: 1 as const,
  name: "độc hại",
  confidence: 0.99,
  proba: [0.5001, 0.4999] as [number, number],
};
const atUiThreshold = {
  label: 1 as const,
  name: "độc hại",
  confidence: 0.01,
  proba: [0.5, 0.5] as [number, number],
};

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
  contentMessageListener = undefined;
  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: {
        addListener: addContentMessageListener,
        removeListener: removeContentMessageListener,
      },
    },
  });
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

  it("chỉ blur theo p_toxic từ 0.50, không theo label hoặc confidence", async () => {
    api.predict
      .mockResolvedValueOnce(belowUiThreshold)
      .mockResolvedValueOnce(atUiThreshold);
    await start("<p id='below'>Dưới ngưỡng UI</p><p id='at'>Ngay ngưỡng UI</p>");
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(document.querySelector("#at")!.classList.contains("cs-blur")).toBe(true));
    expect(document.querySelector("#below")!.classList.contains("cs-blur")).toBe(false);
    expect(document.querySelector(".cs-badge")).toBeNull();
  });

  it("click đầu chỉ reveal, click sau mới chạy hành động của website", async () => {
    api.predict.mockResolvedValue(atUiThreshold);
    await start("<main id='parent'><p><a id='link' href='#next'>Nội dung độc hại</a></p></main>");
    const link = document.querySelector("#link") as HTMLAnchorElement;
    await vi.waitFor(() => expect(link.classList.contains("cs-blur")).toBe(true));
    const websiteClick = vi.fn((event: Event) => event.preventDefault());
    link.addEventListener("click", websiteClick);

    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(websiteClick).not.toHaveBeenCalled();
    expect(link.classList.contains("cs-blur")).toBe(false);
    expect(link.dataset.csRevealed).toBe("true");
    expect((document.querySelector("#parent") as HTMLElement).style.position).toBe("");

    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(websiteClick).toHaveBeenCalledOnce();
  });

  it("chặn listener capture của website ở document trong click reveal đầu", async () => {
    const websiteCapture = vi.fn();
    document.addEventListener("click", websiteCapture, true);
    try {
      api.predict.mockResolvedValue(atUiThreshold);
      await start("<p id='target'>Nội dung độc hại</p>");
      const target = document.querySelector("#target") as HTMLElement;
      await vi.waitFor(() => expect(target.classList.contains("cs-blur")).toBe(true));

      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect(websiteCapture).not.toHaveBeenCalled();

      target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      expect(websiteCapture).toHaveBeenCalledOnce();
    } finally {
      document.removeEventListener("click", websiteCapture, true);
    }
  });

  it("không can thiệp class cs-blur do website sở hữu", async () => {
    await start("<button id='website' class='cs-blur'></button>");
    const websiteElement = document.querySelector("#website") as HTMLButtonElement;
    const websiteClick = vi.fn();
    websiteElement.addEventListener("click", websiteClick);

    websiteElement.click();

    expect(websiteClick).toHaveBeenCalledOnce();
    expect(websiteElement.classList.contains("cs-blur")).toBe(true);
    expect(window.CyberShield.stats().revealed).toBe(0);
  });

  it("Enter reveal đúng một lần và khôi phục thuộc tính accessibility gốc", async () => {
    api.predict.mockResolvedValue(atUiThreshold);
    await start("<p id='target' role='note' aria-label='Nhãn gốc'>Nội dung độc hại</p>");
    const target = document.querySelector("#target") as HTMLElement;
    await vi.waitFor(() => expect(target.classList.contains("cs-blur")).toBe(true));

    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));

    expect(target.classList.contains("cs-blur")).toBe(false);
    expect(target.dataset.csRevealed).toBe("true");
    expect(target.getAttribute("role")).toBe("note");
    expect(target.getAttribute("aria-label")).toBe("Nhãn gốc");
    expect(target.hasAttribute("tabindex")).toBe(false);
    expect(window.CyberShield.stats().revealed).toBe(1);
  });

  it("che lại phần tử đã mở còn trên trang mà không inference hoặc đổi counters", async () => {
    api.predict.mockResolvedValue(atUiThreshold);
    await start("<p id='first'>Nội dung độc hại thứ nhất</p><p id='second'>Nội dung độc hại thứ hai</p>");
    const first = document.querySelector("#first") as HTMLElement;
    const second = document.querySelector("#second") as HTMLElement;
    await vi.waitFor(() => expect(first.classList.contains("cs-blur")).toBe(true));
    await vi.waitFor(() => expect(second.classList.contains("cs-blur")).toBe(true));
    first.click();
    second.click();
    const callsBeforeReset = api.predict.mock.calls.length;
    const statsBeforeReset = window.CyberShield.stats();
    second.remove();

    const sendResponse = vi.fn();
    expect(contentMessageListener).toBeDefined();
    contentMessageListener?.({ type: "rehide-revealed" }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({ ok: true, count: 1 });
    expect(first.classList.contains("cs-blur")).toBe(true);
    expect(first.dataset.csRevealed).toBeUndefined();
    expect(api.predict).toHaveBeenCalledTimes(callsBeforeReset);
    expect(window.CyberShield.stats()).toEqual(statsBeforeReset);
  });

  it("che lại bằng prediction gắn với phần tử dù cache dùng chung đã eviction", async () => {
    api.predict.mockResolvedValue(atUiThreshold);
    await start("<p id='target'>Nội dung độc hại đã mở</p>");
    const target = document.querySelector("#target") as HTMLElement;
    await vi.waitFor(() => expect(target.classList.contains("cs-blur")).toBe(true));
    target.click();
    const callsBeforeReset = api.predict.mock.calls.length;
    const statsBeforeReset = window.CyberShield.stats();
    window.CyberShield.cache.clear();

    const sendResponse = vi.fn();
    contentMessageListener?.({ type: "rehide-revealed" }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({ ok: true, count: 1 });
    expect(target.classList.contains("cs-blur")).toBe(true);
    expect(api.predict).toHaveBeenCalledTimes(callsBeforeReset);
    expect(window.CyberShield.stats()).toEqual(statsBeforeReset);
  });

  it("không dùng prediction cũ để che lại sau khi text đã đổi", async () => {
    api.predict.mockResolvedValueOnce(atUiThreshold).mockResolvedValueOnce(safe);
    await start("<p id='target'>Nội dung độc hại cũ</p>");
    const target = document.querySelector("#target") as HTMLElement;
    await vi.waitFor(() => expect(target.classList.contains("cs-blur")).toBe(true));
    target.click();
    target.textContent = "Nội dung mới an toàn";

    const sendResponse = vi.fn();
    expect(contentMessageListener).toBeDefined();
    contentMessageListener?.({ type: "rehide-revealed" }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({ ok: true, count: 0 });
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledWith("Nội dung mới an toàn"));
    expect(target.classList.contains("cs-blur")).toBe(false);
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


describe("lookup intervention integration", () => {
  it("hard matches skip model and repeated scans do not duplicate intervention or counters", async () => {
    await start("<p id='hard'>tao sẽ địt mẹ mày</p><p id='context'>giết</p><p id='safe'>Xin chào bạn</p>");
    await vi.waitFor(() => expect(window.CyberShield.stats().scanned).toBe(3));
    const hard = document.querySelector("#hard") as HTMLElement;
    expect(hard.classList.contains("cs-blur")).toBe(true);
    expect(document.querySelector("#context")!.classList.contains("cs-blur")).toBe(false);
    expect(document.querySelector("#safe")!.classList.contains("cs-blur")).toBe(false);
    expect(api.predict.mock.calls.map(([text]) => text)).toEqual(["giết", "Xin chào bạn"]);
    const stats = { ...window.CyberShield.stats() };
    const { quét } = await import("./content");
    quét(); quét();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(window.CyberShield.stats()).toEqual(stats);
    expect(document.querySelectorAll(".cs-blur")).toHaveLength(1);
    expect(document.querySelectorAll(".cs-badge")).toHaveLength(0);
    hard.click();
    expect(hard.classList.contains("cs-blur")).toBe(false);
    expect(window.CyberShield.stats().revealed).toBe(1);
  });

  it("hard matches work while model is paused", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    api.predict.mockRejectedValue(Object.assign(new Error("model-load"), { retryable: false }));
    await start("<p>Nội dung cần AI</p>");
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(1));
    const hard = document.createElement("p");
    hard.textContent = "ĐỤ MÁ";
    document.body.appendChild(hard);
    await vi.waitFor(() => expect(hard.classList.contains("cs-blur")).toBe(true));
    expect(api.predict).toHaveBeenCalledTimes(1);
  });

  it("hard matches do not wait for pending model and stale results cannot override them", async () => {
    let resolve!: (value: typeof safe) => void;
    api.predict.mockImplementation(() => new Promise(done => { resolve = done; }));
    await start("<p id='target'>Nội dung chờ</p>");
    await vi.waitFor(() => expect(api.predict).toHaveBeenCalledTimes(1));
    const target = document.querySelector("#target") as HTMLElement;
    target.textContent = "địt mẹ";
    await vi.waitFor(() => expect(target.classList.contains("cs-blur")).toBe(true));
    resolve(safe);
    await new Promise(done => setTimeout(done, 20));
    expect(target.classList.contains("cs-blur")).toBe(true);
    expect(window.CyberShield.stats().scanned).toBe(1);
    expect(api.predict).toHaveBeenCalledTimes(1);
  });
});

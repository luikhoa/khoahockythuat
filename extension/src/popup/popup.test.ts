// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  status: vi.fn(),
  retryModel: vi.fn(),
  stats: vi.fn(),
  clearStats: vi.fn(),
  loadMetadata: vi.fn(),
}));

vi.mock("../lib/api", () => ({ CyberShieldModel: api }));

const tabs = {
  query: vi.fn(),
  sendMessage: vi.fn(),
};

function popupBody(): string {
  return `
    <h1>Tấm chắn đang bật</h1>
    <p id="trạng-thái"></p><p id="mô-hình"></p>
    <button id="thử-lại" hidden>Thử lại</button>
    <div id="thanh"><i></i><i></i><i></i></div>
    <span id="s-quét"></span><span id="s-che"></span><span id="s-link"></span><span id="s-mở"></span>
    <button id="che-lại">Che lại nội dung trên trang này</button>
    <p id="trạng-thái-che-lại" role="status" aria-live="polite"></p>
    <button id="xoá">Xoá thống kê</button>
  `;
}

const empty = { scanned: 0, toxic: 0, threat: 0, links: 0, revealed: 0 };
const metadata = {
  schemaVersion: 1,
  modelVersion: "phobert-offensive-1",
  labels: ["an toàn", "độc hại"],
  maxLength: 128,
  toxicThreshold: 0.4,
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  document.body.innerHTML = popupBody();
  api.stats.mockResolvedValue(empty);
  api.status.mockResolvedValue({ state: "loading" });
  api.retryModel.mockResolvedValue({ state: "ready-wasm", provider: "wasm" });
  api.clearStats.mockResolvedValue({ ok: true });
  api.loadMetadata.mockResolvedValue(metadata);
  tabs.query.mockResolvedValue([{ id: 42 }]);
  tabs.sendMessage.mockResolvedValue({ ok: true, count: 3 });
  vi.stubGlobal("chrome", { tabs });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function render(): Promise<void> {
  await import("./popup");
  await vi.waitFor(() => expect(api.stats).toHaveBeenCalled());
}

describe("popup model status", () => {
  it.each([
    [{ state: "loading" }, "Đang nạp"],
    [{ state: "ready-webgpu", provider: "webgpu" }, "WebGPU"],
    [{ state: "ready-wasm", provider: "wasm" }, "WASM"],
  ])("hiển thị %j", async (status, copy) => {
    api.status.mockResolvedValue(status);
    await render();
    await vi.waitFor(() => expect(document.getElementById("trạng-thái")!.textContent).toContain(copy));
  });

  it("hiện lỗi và nút retry khởi tạo lại model", async () => {
    api.status.mockResolvedValue({
      state: "error",
      error: { kind: "model-load", retryable: false, message: "checksum mismatch" },
    });
    await render();
    const button = document.getElementById("thử-lại") as HTMLButtonElement;
    expect(button.hidden).toBe(false);
    button.click();
    await vi.waitFor(() => expect(api.retryModel).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(document.getElementById("trạng-thái")!.textContent).toContain("WASM"));
  });

  it("xóa nguồn thống kê service worker rồi render lại", async () => {
    api.stats.mockResolvedValueOnce({ ...empty, scanned: 9 }).mockResolvedValueOnce(empty);
    await render();
    expect(document.getElementById("s-quét")!.textContent).toBe("9");

    (document.getElementById("xoá") as HTMLButtonElement).click();

    await vi.waitFor(() => expect(api.clearStats).toHaveBeenCalledWith("day"));
    await vi.waitFor(() => expect(document.getElementById("s-quét")!.textContent).toBe("0"));
    expect(tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("che lại nội dung đã mở trên tab hiện tại và báo số lượng", async () => {
    await render();
    const button = document.getElementById("che-lại") as HTMLButtonElement;

    button.click();

    expect(button.disabled).toBe(true);
    await vi.waitFor(() => expect(tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true }));
    await vi.waitFor(() => expect(tabs.sendMessage).toHaveBeenCalledWith(42, { type: "rehide-revealed" }));
    await vi.waitFor(() => expect(document.getElementById("trạng-thái-che-lại")!.textContent)
      .toBe("Đã che lại 3 nội dung"));
    expect(button.disabled).toBe(false);
  });

  it("báo rõ khi tab hiện tại không có nội dung cần che lại", async () => {
    tabs.sendMessage.mockResolvedValue({ ok: true, count: 0 });
    await render();

    (document.getElementById("che-lại") as HTMLButtonElement).click();

    await vi.waitFor(() => expect(document.getElementById("trạng-thái-che-lại")!.textContent)
      .toBe("Không có nội dung cần che lại"));
  });

  it.each([
    ["không có tab id", async () => tabs.query.mockResolvedValueOnce([{}])],
    ["content script không phản hồi", async () => tabs.sendMessage.mockRejectedValueOnce(new Error("No receiver"))],
  ])("không để lỗi %s thoát khỏi popup", async (_name, arrange) => {
    await arrange();
    await render();
    const button = document.getElementById("che-lại") as HTMLButtonElement;

    button.click();

    await vi.waitFor(() => expect(document.getElementById("trạng-thái-che-lại")!.textContent)
      .toBe("Trang này không hỗ trợ thao tác này"));
    expect(button.disabled).toBe(false);
  });

  it("hiển thị metadata PhoBERT đóng gói, không hiển thị metric cũ", async () => {
    await render();
    await vi.waitFor(() => expect(document.getElementById("mô-hình")!.textContent).toContain("phobert-offensive-1"));
    expect(document.body.textContent).not.toContain(["TF", "IDF"].join("-"));
    expect(document.body.textContent).not.toContain(["macro", "F1"].join("-"));
  });
});

// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  status: vi.fn(),
  retryModel: vi.fn(),
  stats: vi.fn(),
  clearStats: vi.fn(),
  loadMetadata: vi.fn(),
}));

vi.mock("../lib/api", () => ({ CyberShieldModel: api }));

function popupBody(): string {
  return `
    <h1>Tấm chắn đang bật</h1>
    <p id="trạng-thái"></p><p id="mô-hình"></p>
    <button id="thử-lại" hidden>Thử lại</button>
    <div id="thanh"><i></i><i></i><i></i></div>
    <span id="s-quét"></span><span id="s-che"></span><span id="s-link"></span><span id="s-mở"></span>
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
  });

  it("hiển thị metadata PhoBERT đóng gói, không hiển thị metric cũ", async () => {
    await render();
    await vi.waitFor(() => expect(document.getElementById("mô-hình")!.textContent).toContain("phobert-offensive-1"));
    expect(document.body.textContent).not.toContain(["TF", "IDF"].join("-"));
    expect(document.body.textContent).not.toContain(["macro", "F1"].join("-"));
  });
});

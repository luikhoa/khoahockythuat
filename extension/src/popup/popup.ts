import { CyberShieldModel } from "../lib/api";
import type { ModelStatus } from "../inference/protocol";
import type { ModelMetadata, StatsSnapshot } from "../lib/types";

const emptyStats: StatsSnapshot = { toxic: 0, threat: 0, links: 0, revealed: 0, scanned: 0 };

function renderStats(stats: StatsSnapshot): void {
  const scanned = Math.max(stats.scanned, 1);
  const blocked = stats.toxic + stats.threat;
  const safe = Math.max(scanned - blocked, 0);
  const bars = document.getElementById("thanh")!.children;
  (bars[0] as HTMLElement).style.width = `${(safe / scanned) * 100}%`;
  (bars[1] as HTMLElement).style.width = `${(stats.toxic / scanned) * 100}%`;
  (bars[2] as HTMLElement).style.width = `${(stats.threat / scanned) * 100}%`;
  document.getElementById("s-quét")!.textContent = stats.scanned.toLocaleString("vi-VN");
  document.getElementById("s-che")!.textContent = blocked.toLocaleString("vi-VN");
  document.getElementById("s-link")!.textContent = stats.links.toLocaleString("vi-VN");
  document.getElementById("s-mở")!.textContent = stats.revealed.toLocaleString("vi-VN");
}

function renderStatus(status: ModelStatus): void {
  const target = document.getElementById("trạng-thái")!;
  const retry = document.getElementById("thử-lại") as HTMLButtonElement;
  retry.hidden = status.state !== "error";
  switch (status.state) {
    case "loading":
      target.textContent = "Đang nạp mô hình cục bộ…";
      break;
    case "ready-webgpu":
      target.textContent = "AI cục bộ sẵn sàng · WebGPU";
      break;
    case "ready-wasm":
      target.textContent = "AI cục bộ sẵn sàng · WASM";
      break;
    case "error":
      target.textContent = `Không nạp được mô hình · ${status.error.message ?? status.error.kind}`;
      break;
  }
}

function renderMetadata(metadata: ModelMetadata): void {
  document.getElementById("mô-hình")!.textContent = `PhoBERT · ${metadata.modelVersion}`;
}

async function loadPopup(): Promise<void> {
  const [stats, status, metadata] = await Promise.allSettled([
    CyberShieldModel.stats("day"),
    CyberShieldModel.status(),
    CyberShieldModel.loadMetadata(),
  ]);
  renderStats(stats.status === "fulfilled" ? stats.value : emptyStats);
  renderStatus(status.status === "fulfilled"
    ? status.value
    : { state: "error", error: { kind: "inference", retryable: true, message: "Không đọc được trạng thái" } });
  if (metadata.status === "fulfilled") renderMetadata(metadata.value);
  else document.getElementById("mô-hình")!.textContent = "PhoBERT · chưa đọc được metadata";
}

document.getElementById("thử-lại")!.addEventListener("click", async () => {
  const button = document.getElementById("thử-lại") as HTMLButtonElement;
  button.disabled = true;
  renderStatus({ state: "loading" });
  try {
    renderStatus(await CyberShieldModel.retryModel());
  } catch (error) {
    renderStatus({
      state: "error",
      error: {
        kind: "model-load",
        retryable: false,
        message: error instanceof Error ? error.message : "Không thể thử lại",
      },
    });
  } finally {
    button.disabled = false;
  }
});

document.getElementById("xoá")!.addEventListener("click", async () => {
  await CyberShieldModel.clearStats("day");
  renderStats(await CyberShieldModel.stats("day"));
});

void loadPopup();

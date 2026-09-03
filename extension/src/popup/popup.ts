/**
 * popup.ts — Đọc thống kê từ GET /stats (backend); rơi về chrome.storage.local
 * cục bộ chỉ khi backend không phản hồi (offline, chưa chạy uvicorn, v.v.).
 */
import type { ModelMeta, StatsSnapshot } from "../lib/types";

const BACKEND = "http://127.0.0.1:8000";
const khoáHômNay = "cs_" + new Date().toISOString().slice(0, 10);
const rỗng: StatsSnapshot = { toxic: 0, threat: 0, links: 0, revealed: 0, scanned: 0 };

function vẽ(s: StatsSnapshot, meta: ModelMeta | null | undefined): void {
  const quét = Math.max(s.scanned, 1);
  const xúc = s.toxic, đe = s.threat;
  const an = Math.max(quét - xúc - đe, 0);

  const t = document.getElementById("thanh")!.children;
  (t[0] as HTMLElement).style.width = (an / quét) * 100 + "%";
  (t[1] as HTMLElement).style.width = (xúc / quét) * 100 + "%";
  (t[2] as HTMLElement).style.width = (đe / quét) * 100 + "%";

  document.getElementById("s-quét")!.textContent = s.scanned.toLocaleString("vi-VN");
  document.getElementById("s-che")!.textContent = (xúc + đe).toLocaleString("vi-VN");
  document.getElementById("s-link")!.textContent = s.links.toLocaleString("vi-VN");
  document.getElementById("s-mở")!.textContent = s.revealed.toLocaleString("vi-VN");

  document.getElementById("mô-hình")!.textContent = meta
    ? `${meta["phương_án"]} · macro-F1 = ${meta.macro_f1_cv}`
    : "Chưa quét trang nào trong hôm nay.";
}

function đọcCụcBộ(callback: (s: StatsSnapshot, meta?: ModelMeta) => void): void {
  chrome.storage.local.get([khoáHômNay, "cs_meta"], (d) => {
    callback((d[khoáHômNay] as StatsSnapshot | undefined) || rỗng, d.cs_meta as ModelMeta | undefined);
  });
}

async function tải(): Promise<void> {
  chrome.storage.local.get(["cs_meta"], async (d) => {
    try {
      const res = await fetch(`${BACKEND}/stats?range=day`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = (await res.json()) as StatsSnapshot;
      vẽ(s, d.cs_meta as ModelMeta | undefined);
    } catch {
      đọcCụcBộ(vẽ);
    }
  });
}

tải();

document.getElementById("xoá")!.addEventListener("click", () => {
  // Chỉ xoá bản lưu cục bộ (dự phòng) — backend chưa có API để reset bộ đếm.
  chrome.storage.local.remove(khoáHômNay, () => vẽ(rỗng, null));
});

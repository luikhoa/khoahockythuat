/**
 * content.ts — Chạy trên mọi trang web.
 *
 * Ba bài toán hiệu năng phải giải, nếu không extension sẽ làm treo trang:
 *   1. Không quét lại toàn trang liên tục  -> MutationObserver + debounce 250ms
 *   2. Không phân loại lại câu đã gặp      -> cache theo nội dung đã chuẩn hoá
 *   3. Không chặn luồng vẽ giao diện       -> xử lý theo lô trong requestIdleCallback
 */
import { CyberShieldModel } from "../lib/api";
import { CyberShieldLink } from "../lib/linkcheck";
import type { EventType, Prediction, StatsSnapshot } from "../lib/types";

const NGƯỠNG = 0.6; // độ tin cậy tối thiểu mới can thiệp
const ĐỘ_DÀI_TỐI_THIỂU = 2; // bỏ qua chuỗi quá ngắn ("ok", "hihi")
const BỎ_QUA = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "SVG"]);
const BACKEND = "http://127.0.0.1:8000";
// ánh xạ field trong `stats` (local) -> loại sự kiện mà POST /events chấp nhận
const LOẠI_SỰ_KIỆN: Record<keyof StatsSnapshot, EventType> = {
  scanned: "scanned",
  toxic: "toxic",
  threat: "threat",
  links: "link",
  revealed: "revealed",
};

const cache = new Map<string, Prediction>();
const stats: StatsSnapshot = { toxic: 0, threat: 0, links: 0, revealed: 0, scanned: 0 };
const đãGửi: StatsSnapshot = { toxic: 0, threat: 0, links: 0, revealed: 0, scanned: 0 };
let sẵnSàng = false;

// ------------------------------------------------------------ thống kê
function lưuThốngKê(): void {
  if (typeof chrome === "undefined" || !chrome.storage) return;
  const ngày = new Date().toISOString().slice(0, 10);
  chrome.storage.local.set({ ["cs_" + ngày]: stats, cs_meta: CyberShieldModel.meta });
  gửiSựKiện();
}

// Gửi phần tăng thêm (delta) kể từ lần gửi trước lên backend, theo cùng
// nhịp debounce với chrome.storage.local — không gọi mạng theo từng câu.
function gửiSựKiện(): void {
  (Object.keys(LOẠI_SỰ_KIỆN) as (keyof StatsSnapshot)[]).forEach((field) => {
    const delta = stats[field] - đãGửi[field];
    if (delta <= 0) return;
    const giáTrịHiệnTại = stats[field];
    fetch(`${BACKEND}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: LOẠI_SỰ_KIỆN[field], count: delta }),
    })
      .then((res) => { if (res.ok) đãGửi[field] = giáTrịHiệnTại; })
      .catch(() => {}); // backend lỗi -> giữ nguyên đãGửi[field], delta sẽ được gộp và thử lại ở lần flush sau
  });
}

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let id: ReturnType<typeof setTimeout>;
  return (...a: A) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...a), ms);
  };
}

const lưuTrễ = debounce(lưuThốngKê, 1500);
const quétTrễ = debounce(() => quét(), 250);

// ------------------------------------------------------------ phân loại
async function phânLoại(text: string): Promise<Prediction | null> {
  const key = text;
  if (key.length < ĐỘ_DÀI_TỐI_THIỂU) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  let r: Prediction;
  try {
    r = await CyberShieldModel.predict(text);
  } catch (err) {
    console.warn("[CyberShield] Backend không phản hồi, bỏ qua đoạn này:", err);
    return null;
  }
  cache.set(key, r);
  if (cache.size > 4000) {
    const đầu = cache.keys().next().value;
    if (đầu !== undefined) cache.delete(đầu);
  }
  return r;
}

// ------------------------------------------------------- can thiệp DOM
function bọcNộiDung(el: HTMLElement, kết: Prediction): void {
  if (el.dataset.csDone) return;
  el.dataset.csDone = "1";

  const mức = kết.label === 2 ? "threat" : "toxic";
  el.classList.add("cs-blur", "cs-" + mức);

  const nhãn = document.createElement("div");
  nhãn.className = "cs-badge cs-" + mức;
  nhãn.innerHTML =
    `<span class="cs-badge-text">Nội dung có thể ${kết.label === 2 ? "mang tính đe doạ" : "gây tổn thương"}` +
    ` · ${Math.round(kết.confidence * 100)}%</span>` +
    `<button class="cs-reveal" type="button">Vẫn xem</button>`;

  nhãn.querySelector(".cs-reveal")!.addEventListener("click", (e) => {
    e.stopPropagation(); e.preventDefault();
    el.classList.remove("cs-blur");
    nhãn.remove();
    stats.revealed++; lưuTrễ();
  });

  const bọc = el.parentElement;
  if (bọc && getComputedStyle(bọc).position === "static") bọc.style.position = "relative";
  (bọc || el).appendChild(nhãn);

  if (kết.label === 2) stats.threat++; else stats.toxic++;
  lưuTrễ();
}

function đánhDấuLink(a: HTMLAnchorElement): void {
  if (a.dataset.csDone) return;
  a.dataset.csDone = "1";
  const kq = CyberShieldLink.check(a.href);
  if (kq.level === "an toàn") return;

  a.classList.add("cs-link", "cs-link-" + (kq.level === "nguy hiểm" ? "danger" : "warn"));
  a.title = `CyberShield — liên kết ${kq.level}:\n• ${kq.reasons.join("\n• ")}`;

  a.addEventListener("click", (e) => {
    const ok = confirm(
      `Liên kết này ${kq.level.toUpperCase()}.\n\n` +
      `Đích đến: ${a.hostname}\n\nDấu hiệu phát hiện:\n• ${kq.reasons.join("\n• ")}\n\n` +
      `Bấm OK nếu bạn chắc chắn muốn mở.`
    );
    if (!ok) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  stats.links++; lưuTrễ();
}

// ------------------------------------------------------------- duyệt DOM
function thuThậpKhối(gốc: Node): HTMLElement[] {
  const ra: HTMLElement[] = [];
  const walker = document.createTreeWalker(gốc, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const el = node as HTMLElement;
      if (BỎ_QUA.has(el.tagName)) return NodeFilter.FILTER_REJECT;
      if (el.dataset && el.dataset.csDone) return NodeFilter.FILTER_REJECT;
      // chỉ lấy phần tử "lá văn bản": có chữ, và không có con nào cũng có chữ
      const text = el.textContent!.trim();
      if (text.length < ĐỘ_DÀI_TỐI_THIỂU || text.length > 1200) return NodeFilter.FILTER_SKIP;
      for (const c of Array.from(el.children)) {
        if (c.textContent!.trim().length >= ĐỘ_DÀI_TỐI_THIỂU) return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) ra.push(n as HTMLElement);
  return ra;
}

function quét(gốc: HTMLElement = document.body): void {
  if (!sẵnSàng || !gốc || gốc.nodeType !== 1) return;

  const khối = thuThậpKhối(gốc);
  const links = gốc.querySelectorAll ? gốc.querySelectorAll<HTMLAnchorElement>("a[href]") : [];

  let i = 0;
  const rảnh: (cb: IdleRequestCallback) => number =
    window.requestIdleCallback || ((f) => window.setTimeout(() => f({ didTimeout: false, timeRemaining: () => 8 }), 0));

  function lô(deadline: IdleDeadline): void {
    (async () => {
      while (i < khối.length && deadline.timeRemaining() > 2) {
        const el = khối[i++];
        if (el.dataset.csDone) continue;
        const kết = await phânLoại(el.textContent ?? "");
        stats.scanned++;
        if (kết && kết.label !== 0 && kết.confidence >= NGƯỠNG) bọcNộiDung(el, kết);
        else el.dataset.csDone = "1";
      }
      if (i < khối.length) rảnh(lô);
      else lưuTrễ();
    })();
  }
  rảnh(lô);
  links.forEach(đánhDấuLink);
}

// ------------------------------------------------------------- khởi động
async function khởiĐộng(): Promise<void> {
  const url = typeof chrome !== "undefined" && chrome.runtime
    ? chrome.runtime.getURL("model.json")
    : "../extension/model.json"; // để chạy được cả trong demo/demo.html (xem thư mục demo/)
  const meta = await CyberShieldModel.load(url);
  sẵnSàng = true;
  console.log(`[CyberShield] Đã nạp thông tin mô hình "${meta["phương_án"]}" — macro-F1 = ${meta.macro_f1_cv}. Phân loại chạy qua backend.`);

  quét(document.body);

  new MutationObserver((ds) => {
    for (const d of ds) if (d.addedNodes.length) { quétTrễ(); return; }
  }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", khởiĐộng);
else khởiĐộng();

declare global {
  interface Window {
    CyberShield: {
      quét: typeof quét;
      stats: () => StatsSnapshot;
      cache: Map<string, Prediction>;
    };
  }
}

window.CyberShield = { quét, stats: () => stats, cache };

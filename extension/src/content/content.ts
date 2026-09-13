/** Quét nội dung đã hiển thị, phân loại qua service worker và theo dõi DOM động. */
import { CyberShieldModel } from "../lib/api";
import { CyberShieldLink } from "../lib/linkcheck";
import type { EventType, Prediction, StatsSnapshot } from "../lib/types";

const NGƯỠNG = 0.6;
const ĐỘ_DÀI_TỐI_THIỂU = 2;
const ĐỘ_DÀI_TỐI_ĐA = 1200;
const BỎ_QUA = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "SVG"]);
const NHỊP_THỬ_LẠI = [1_000, 5_000, 15_000, 30_000];
const LABELS = ["an toàn", "xúc phạm"];

const LOẠI_SỰ_KIỆN: Record<keyof StatsSnapshot, EventType> = {
  scanned: "scanned", toxic: "toxic", threat: "threat", links: "link", revealed: "revealed",
};
const cache = new Map<string, Prediction>();
const đangGọi = new Map<string, Promise<Prediction>>();
const textĐãXửLý = new WeakMap<HTMLElement, string>();
const linkĐãXửLý = new WeakMap<HTMLAnchorElement, string>();
const badgeTheoElement = new WeakMap<HTMLElement, HTMLElement>();
const linkHandler = new WeakMap<HTMLAnchorElement, EventListener>();
const hàngĐợi = new Set<HTMLElement>();
const stats: StatsSnapshot = { toxic: 0, threat: 0, links: 0, revealed: 0, scanned: 0 };
const đãGửi: StatsSnapshot = { toxic: 0, threat: 0, links: 0, revealed: 0, scanned: 0 };
let đangXửLý = false;
let hẹnThửLại: ReturnType<typeof setTimeout> | undefined;
let lầnThửLại = 0;
let chuỗiGửiSựKiện = Promise.resolve();
let observer: MutationObserver | undefined;
let đãKhởiĐộng = false;

export function fingerprint(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function bịLoại(el: HTMLElement): boolean {
  if (BỎ_QUA.has(el.tagName) || el.closest("[data-cs-ui]")) return true;
  if (el.closest("input, textarea, [contenteditable]:not([contenteditable='false'])")) return true;
  if (el.closest("[hidden], [aria-hidden='true']")) return true;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return true;
  }
  return false;
}

function làKhốiVănBản(el: HTMLElement): boolean {
  if (bịLoại(el)) return false;
  const text = fingerprint(el.textContent ?? "");
  if (text.length < ĐỘ_DÀI_TỐI_THIỂU || text.length > ĐỘ_DÀI_TỐI_ĐA) return false;
  return !Array.from(el.children).some((child) => fingerprint(child.textContent ?? "").length >= ĐỘ_DÀI_TỐI_THIỂU);
}

export function thuThậpKhối(gốc: Node): HTMLElement[] {
  const kếtQuả: HTMLElement[] = [];
  if (gốc instanceof HTMLElement && làKhốiVănBản(gốc)) kếtQuả.push(gốc);
  const walker = document.createTreeWalker(gốc, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const el = node as HTMLElement;
      if (BỎ_QUA.has(el.tagName) || el.matches("[data-cs-ui], [hidden], [aria-hidden='true']")) return NodeFilter.FILTER_REJECT;
      return làKhốiVănBản(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  let node: Node | null;
  while ((node = walker.nextNode())) kếtQuả.push(node as HTMLElement);
  return kếtQuả;
}

function predictionHợpLệ(value: Prediction): boolean {
  return (value.label === 0 || value.label === 1) && Number.isFinite(value.confidence)
    && value.confidence >= 0 && value.confidence <= 1 && Array.isArray(value.proba)
    && value.proba.length === 2 && value.proba.every((p) => Number.isFinite(p) && p >= 0 && p <= 1);
}

async function phânLoại(text: string): Promise<Prediction> {
  const đãCache = cache.get(text);
  if (đãCache) return đãCache;
  const hiệnCó = đangGọi.get(text);
  if (hiệnCó) return hiệnCó;
  const promise = CyberShieldModel.predict(text).then((result) => {
    if (!predictionHợpLệ(result)) throw new Error("invalid-response");
    cache.set(text, result);
    if (cache.size > 4000) {
      const đầu = cache.keys().next().value;
      if (đầu !== undefined) cache.delete(đầu);
    }
    return result;
  }).finally(() => đangGọi.delete(text));
  đangGọi.set(text, promise);
  return promise;
}

function gửiSựKiện(): void {
  chuỗiGửiSựKiện = chuỗiGửiSựKiện.then(async () => {
    for (const field of Object.keys(LOẠI_SỰ_KIỆN) as (keyof StatsSnapshot)[]) {
      const delta = stats[field] - đãGửi[field];
      if (delta <= 0) continue;
      let cònLại = delta;
      while (cònLại > 0) {
        const count = Math.min(cònLại, 10_000);
        await CyberShieldModel.event({ type: LOẠI_SỰ_KIỆN[field], count });
        đãGửi[field] += count;
        cònLại -= count;
      }
    }
  }).catch(() => undefined);
}

function lưuThốngKê(): void {
  if (typeof chrome !== "undefined" && chrome.storage) {
    const ngày = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" });
    chrome.storage.local.set({ ["cs_" + ngày]: stats, cs_meta: CyberShieldModel.meta });
  }
  gửiSựKiện();
}

function debounce(fn: () => void, ms: number): () => void {
  let id: ReturnType<typeof setTimeout>;
  return () => { clearTimeout(id); id = setTimeout(fn, ms); };
}
const lưuTrễ = debounce(lưuThốngKê, 1500);

function bỏCanThiệp(el: HTMLElement): void {
  el.classList.remove("cs-blur", "cs-toxic");
  badgeTheoElement.get(el)?.remove();
  badgeTheoElement.delete(el);
}

function bọcNộiDung(el: HTMLElement, kết: Prediction): void {
  bỏCanThiệp(el);
  el.classList.add("cs-blur", "cs-toxic");
  const confidencePct = (kết.confidence * 100).toFixed(1);
  const chiTiếtProba = ` (${kết.proba.map((p, i) => `${LABELS[i] ?? "khác"} ${(p * 100).toFixed(1)}%`).join(" · ")})`;
  const nhãn = document.createElement("div");
  nhãn.dataset.csUi = "badge";
  nhãn.className = "cs-badge cs-toxic";
  const môTả = document.createElement("span");
  môTả.className = "cs-badge-text";
  môTả.textContent = `Nội dung có thể gây tổn thương · độ tin cậy ${confidencePct}%${chiTiếtProba}`;
  const nút = document.createElement("button");
  nút.className = "cs-reveal";
  nút.type = "button";
  nút.textContent = "Vẫn xem";
  nút.addEventListener("click", (event) => {
    event.stopPropagation(); event.preventDefault(); bỏCanThiệp(el); stats.revealed++; lưuTrễ();
  });
  nhãn.append(môTả, nút);
  const bọc = el.parentElement;
  if (bọc && getComputedStyle(bọc).position === "static") bọc.style.position = "relative";
  (bọc ?? el).appendChild(nhãn);
  badgeTheoElement.set(el, nhãn);
  stats.toxic++;
  lưuTrễ();
}

function đánhDấuLink(a: HTMLAnchorElement): void {
  if (bịLoại(a)) return;
  const url = a.href;
  if (linkĐãXửLý.get(a) === url) return;
  const cũ = linkHandler.get(a);
  if (cũ) a.removeEventListener("click", cũ, true);
  a.classList.remove("cs-link", "cs-link-warn", "cs-link-danger");
  a.removeAttribute("title");
  linkHandler.delete(a);
  const kếtQuả = CyberShieldLink.check(url);
  linkĐãXửLý.set(a, url);
  if (kếtQuả.level === "an toàn") return;
  a.classList.add("cs-link", "cs-link-" + (kếtQuả.level === "nguy hiểm" ? "danger" : "warn"));
  a.title = `CyberShield — liên kết ${kếtQuả.level}:\n• ${kếtQuả.reasons.join("\n• ")}`;
  const handler: EventListener = (event) => {
    const ok = confirm(`Liên kết này ${kếtQuả.level.toUpperCase()}.\n\nĐích đến: ${a.hostname}\n\nDấu hiệu phát hiện:\n• ${kếtQuả.reasons.join("\n• ")}\n\nBấm OK nếu bạn chắc chắn muốn mở.`);
    if (!ok) { event.preventDefault(); event.stopPropagation(); }
  };
  a.addEventListener("click", handler, true);
  linkHandler.set(a, handler);
  stats.links++;
  lưuTrễ();
}

function lênLịchThửLại(): void {
  if (hẹnThửLại !== undefined) return;
  const delay = NHỊP_THỬ_LẠI[Math.min(lầnThửLại, NHỊP_THỬ_LẠI.length - 1)];
  hẹnThửLại = setTimeout(async () => {
    hẹnThửLại = undefined;
    try { await CyberShieldModel.health(); lầnThửLại = 0; xửLýHàngĐợi(); }
    catch { lầnThửLại++; lênLịchThửLại(); }
  }, delay);
}

async function chạyHàngĐợi(): Promise<void> {
  if (đangXửLý) return;
  đangXửLý = true;
  try {
    while (hàngĐợi.size > 0) {
      const el = hàngĐợi.values().next().value as HTMLElement;
      hàngĐợi.delete(el);
      if (!el.isConnected || !làKhốiVănBản(el)) continue;
      const key = fingerprint(el.textContent ?? "");
      const trước = textĐãXửLý.get(el);
      if (trước === key) continue;
      if (trước !== undefined) bỏCanThiệp(el);
      let kết: Prediction;
      try { kết = await phânLoại(key); }
      catch (error) {
        hàngĐợi.add(el);
        console.warn("[CyberShield] Backend chưa sẵn sàng; sẽ thử lại.", error);
        lênLịchThửLại();
        return;
      }
      if (!el.isConnected || !làKhốiVănBản(el) || fingerprint(el.textContent ?? "") !== key) {
        if (el.isConnected) hàngĐợi.add(el);
        continue;
      }
      textĐãXửLý.set(el, key);
      stats.scanned++;
      if (kết.label !== 0 && kết.confidence >= NGƯỠNG) bọcNộiDung(el, kết);
      lưuTrễ();
    }
  } finally { đangXửLý = false; }
}

function xửLýHàngĐợi(): void { queueMicrotask(() => void chạyHàngĐợi()); }

export function quét(gốc: Node = document.body): void {
  if (!gốc || gốc.nodeType !== Node.ELEMENT_NODE) return;
  for (const el of thuThậpKhối(gốc)) hàngĐợi.add(el);
  if (gốc instanceof HTMLAnchorElement && gốc.matches("a[href]")) đánhDấuLink(gốc);
  if (gốc instanceof Element) gốc.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(đánhDấuLink);
  xửLýHàngĐợi();
}

function quanSát(body: HTMLElement): void {
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof HTMLAnchorElement) { đánhDấuLink(record.target); continue; }
      if (record.type === "characterData") {
        const parent = record.target.parentElement;
        if (parent && !parent.closest("[data-cs-ui]")) quét(parent);
        continue;
      }
      for (const node of Array.from(record.addedNodes)) {
        const root = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        if (root && (!(root instanceof Element) || !root.closest("[data-cs-ui]"))) quét(root);
      }
    }
  });
  observer.observe(body, { childList: true, characterData: true, attributes: true, attributeFilter: ["href"], subtree: true });
}

async function khởiĐộng(): Promise<void> {
  if (!document.body || đãKhởiĐộng) return;
  đãKhởiĐộng = true;
  quanSát(document.body);
  quét(document.body);
  const url = typeof chrome !== "undefined" && chrome.runtime?.id ? chrome.runtime.getURL("model.json") : "../extension/model.json";
  try {
    const meta = await CyberShieldModel.load(url);
    if (typeof chrome !== "undefined" && chrome.storage) chrome.storage.local.set({ cs_meta: meta });
    console.log(`[CyberShield] Metadata: ${meta["phương_án"]} · macro-F1 ${meta.macro_f1_cv}`);
  } catch (error) { console.warn("[CyberShield] Không tải được metadata; việc quét vẫn tiếp tục.", error); }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void khởiĐộng(), { once: true });
else void khởiĐộng();

declare global {
  interface Window { CyberShield: { quét: typeof quét; stats: () => StatsSnapshot; cache: Map<string, Prediction>; dừng: () => void }; }
}
window.CyberShield = {
  quét,
  stats: () => ({ ...stats }),
  cache,
  dừng: () => {
    observer?.disconnect();
    if (hẹnThửLại !== undefined) clearTimeout(hẹnThửLại);
    hàngĐợi.clear();
  },
};

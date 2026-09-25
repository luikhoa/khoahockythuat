/** Quét nội dung đã hiển thị, phân loại qua service worker và theo dõi DOM động. */
import { matchLookup } from "../lookup/matcher";
import { CyberShieldModel } from "../lib/api";
import { CyberShieldLink } from "../lib/linkcheck";
import type { ContentControlMessage, EventType, Prediction, RehideRevealedResponse, StatsSnapshot } from "../lib/types";

const ĐỘ_DÀI_TỐI_THIỂU = 2;
const ĐỘ_DÀI_TỐI_ĐA = 1200;
const NGƯỠNG_CHE_P_TOXIC = 0.5;
const BỎ_QUA = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "SVG"]);
const NHỊP_THỬ_LẠI = [1_000, 5_000, 15_000, 30_000];

const LOẠI_SỰ_KIỆN: Record<keyof StatsSnapshot, EventType> = {
    scanned: "scanned",
    toxic: "toxic",
    threat: "threat",
    links: "link",
    revealed: "revealed",
};
const cache = new Map<string, Prediction>();
const đangGọi = new Map<string, Promise<Prediction>>();
const textĐãXửLý = new WeakMap<HTMLElement, string>();
const predictionTheoElement = new WeakMap<HTMLElement, { fingerprint: string; prediction: Prediction }>();
const linkĐãXửLý = new WeakMap<HTMLAnchorElement, string>();
const linkHandler = new WeakMap<HTMLAnchorElement, EventListener>();
const hàngĐợi = new Set<HTMLElement>();
const stats: StatsSnapshot = { toxic: 0, threat: 0, links: 0, revealed: 0, scanned: 0 };
const đãGửi: StatsSnapshot = { toxic: 0, threat: 0, links: 0, revealed: 0, scanned: 0 };
let đangXửLý = false;
let hẹnThửLại: ReturnType<typeof setTimeout> | undefined;
let hẹnGửiThốngKê: ReturnType<typeof setTimeout> | undefined;
let lầnThửLại = 0;
let modelTạmDừng = false;
let chuỗiGửiSựKiện = Promise.resolve();
let observer: MutationObserver | undefined;
let đãKhởiĐộng = false;
let đãĐăngKýMởNộiDung = false;
let đãĐăngKýĐiềuKhiển = false;

interface ThuộcTínhGốc {
    tabindex: string | null;
    role: string | null;
    ariaLabel: string | null;
}

const thuộcTínhGốc = new WeakMap<HTMLElement, ThuộcTínhGốc>();

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
    return !Array.from(el.children).some(child => fingerprint(child.textContent ?? "").length >= ĐỘ_DÀI_TỐI_THIỂU);
}

export function thuThậpKhối(gốc: Node): HTMLElement[] {
    const kếtQuả: HTMLElement[] = [];
    if (gốc instanceof HTMLElement && làKhốiVănBản(gốc)) kếtQuả.push(gốc);
    const walker = document.createTreeWalker(gốc, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
            const el = node as HTMLElement;
            if (BỎ_QUA.has(el.tagName) || el.matches("[data-cs-ui], [hidden], [aria-hidden='true']"))
                return NodeFilter.FILTER_REJECT;
            return làKhốiVănBản(el) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        },
    });
    let node: Node | null;
    while ((node = walker.nextNode())) kếtQuả.push(node as HTMLElement);
    return kếtQuả;
}

function predictionHợpLệ(value: Prediction): boolean {
    return (
        (value.label === 0 || value.label === 1) &&
        Number.isFinite(value.confidence) &&
        value.confidence >= 0 &&
        value.confidence <= 1 &&
        Array.isArray(value.proba) &&
        value.proba.length === 2 &&
        value.proba.every(p => Number.isFinite(p) && p >= 0 && p <= 1)
    );
}

function nênChe(kết: Prediction): boolean {
    return kết.source === "lookup" || kết.proba[1] >= NGƯỠNG_CHE_P_TOXIC;
}

async function phânLoại(text: string): Promise<Prediction> {
    const đãCache = cache.get(text);
    if (đãCache) return đãCache;
    const hiệnCó = đangGọi.get(text);
    if (hiệnCó) return hiệnCó;
    const promise = CyberShieldModel.predict(text)
        .then(result => {
            if (!predictionHợpLệ(result)) throw new Error("invalid-response");
            cache.set(text, result);
            if (cache.size > 4000) {
                const đầu = cache.keys().next().value;
                if (đầu !== undefined) cache.delete(đầu);
            }
            return result;
        })
        .finally(() => đangGọi.delete(text));
    đangGọi.set(text, promise);
    return promise;
}

function gửiSựKiện(): void {
    chuỗiGửiSựKiện = chuỗiGửiSựKiện
        .then(async () => {
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
        })
        .catch(() => undefined);
}

function lưuThốngKê(): void {
    gửiSựKiện();
}

function lưuTrễ(): void {
    if (hẹnGửiThốngKê !== undefined) clearTimeout(hẹnGửiThốngKê);
    hẹnGửiThốngKê = setTimeout(() => {
        hẹnGửiThốngKê = undefined;
        lưuThốngKê();
    }, 1_500);
}

function đặtLạiThuộcTính(el: HTMLElement, name: string, value: string | null): void {
    if (value === null) el.removeAttribute(name);
    else el.setAttribute(name, value);
}

function khôiPhụcHiểnThị(el: HTMLElement): void {
    el.classList.remove("cs-blur", "cs-toxic");
    const gốc = thuộcTínhGốc.get(el);
    if (!gốc) return;
    đặtLạiThuộcTính(el, "tabindex", gốc.tabindex);
    đặtLạiThuộcTính(el, "role", gốc.role);
    đặtLạiThuộcTính(el, "aria-label", gốc.ariaLabel);
    thuộcTínhGốc.delete(el);
}

function bỏCanThiệp(el: HTMLElement): void {
    khôiPhụcHiểnThị(el);
    delete el.dataset.csRevealed;
    predictionTheoElement.delete(el);
}

function ápDụngBlur(el: HTMLElement): void {
    if (!thuộcTínhGốc.has(el)) {
        thuộcTínhGốc.set(el, {
            tabindex: el.getAttribute("tabindex"),
            role: el.getAttribute("role"),
            ariaLabel: el.getAttribute("aria-label"),
        });
    }
    el.classList.add("cs-blur");
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Nội dung đã được CyberShield làm mờ");
    delete el.dataset.csRevealed;
}

function mởNộiDung(el: HTMLElement): void {
    if (!el.classList.contains("cs-blur")) return;
    khôiPhụcHiểnThị(el);
    el.dataset.csRevealed = "true";
    stats.revealed++;
    lưuTrễ();
}

function vùngBlurTừEvent(target: EventTarget | null): HTMLElement | null {
    const el = target instanceof Element ? target.closest<HTMLElement>(".cs-blur") : null;
    return el && thuộcTínhGốc.has(el) ? el : null;
}

function xửLýClickMở(event: MouseEvent): void {
    const el = vùngBlurTừEvent(event.target);
    if (!el) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    mởNộiDung(el);
}

function xửLýPhímMở(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== " ") return;
    const el = vùngBlurTừEvent(event.target);
    if (!el) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    mởNộiDung(el);
}

export function cheLạiNộiDungĐãMở(): number {
    let count = 0;
    document.querySelectorAll<HTMLElement>("[data-cs-revealed='true']").forEach(el => {
        const key = fingerprint(el.textContent ?? "");
        const đãÁpDụng = predictionTheoElement.get(el);
        if (
            el.isConnected &&
            textĐãXửLý.get(el) === key &&
            đãÁpDụng?.fingerprint === key &&
            nênChe(đãÁpDụng.prediction)
        ) {
            ápDụngBlur(el);
            count++;
            return;
        }
        delete el.dataset.csRevealed;
        textĐãXửLý.delete(el);
        predictionTheoElement.delete(el);
        if (el.isConnected) hàngĐợi.add(el);
    });
    if (hàngĐợi.size > 0) xửLýHàngĐợi();
    return count;
}

function nhậnĐiềuKhiển(
    message: ContentControlMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: RehideRevealedResponse) => void,
): boolean {
    if (message?.type !== "rehide-revealed") return false;
    sendResponse({ ok: true, count: cheLạiNộiDungĐãMở() });
    return false;
}

function đăngKýĐiềuKhiển(): void {
    if (đãĐăngKýĐiềuKhiển || typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    chrome.runtime.onMessage.addListener(nhậnĐiềuKhiển);
    đãĐăngKýĐiềuKhiển = true;
}

function gỡĐiềuKhiển(): void {
    if (!đãĐăngKýĐiềuKhiển || typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    chrome.runtime.onMessage.removeListener(nhậnĐiềuKhiển);
    đãĐăngKýĐiềuKhiển = false;
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
    const handler: EventListener = event => {
        const ok = confirm(
            `Liên kết này ${kếtQuả.level.toUpperCase()}.\n\nĐích đến: ${a.hostname}\n\nDấu hiệu phát hiện:\n• ${kếtQuả.reasons.join("\n• ")}\n\nBấm OK nếu bạn chắc chắn muốn mở.`,
        );
        if (!ok) {
            event.preventDefault();
            event.stopPropagation();
        }
    };
    a.addEventListener("click", handler, true);
    linkHandler.set(a, handler);
    stats.links++;
    lưuTrễ();
}

function lênLịchThửLại(retryable: boolean): void {
    if (hẹnThửLại !== undefined) return;
    const delay = retryable
        ? NHỊP_THỬ_LẠI[Math.min(lầnThửLại, NHỊP_THỬ_LẠI.length - 1)]
        : NHỊP_THỬ_LẠI[NHỊP_THỬ_LẠI.length - 1];
    hẹnThửLại = setTimeout(async () => {
        hẹnThửLại = undefined;
        try {
            const status = await CyberShieldModel.status();
            if (status.state === "ready-webgpu" || status.state === "ready-wasm") {
                lầnThửLại = 0;
                modelTạmDừng = false;
                xửLýHàngĐợi();
                return;
            }
            lầnThửLại++;
            lênLịchThửLại(status.state !== "error" || status.error.retryable);
        } catch {
            lầnThửLại++;
            lênLịchThửLại(true);
        }
    }, delay);
}

async function chạyHàngĐợi(): Promise<void> {
    if (đangXửLý || modelTạmDừng) return;
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
            try {
                kết = await phânLoại(key);
            } catch (error) {
                hàngĐợi.add(el);
                const retryable =
                    typeof error === "object" &&
                    error !== null &&
                    "retryable" in error &&
                    (error as { retryable?: unknown }).retryable === true;
                modelTạmDừng = true;
                console.warn("[CyberShield] Mô hình cục bộ chưa sẵn sàng.", error);
                lênLịchThửLại(retryable);
                return;
            }
            if (!el.isConnected || !làKhốiVănBản(el) || fingerprint(el.textContent ?? "") !== key) {
                if (el.isConnected) hàngĐợi.add(el);
                continue;
            }
            applyPrediction(el, key, kết);
        }
    } finally {
        đangXửLý = false;
    }
}

function xửLýHàngĐợi(): void {
    queueMicrotask(() => void chạyHàngĐợi());
}

function applyPrediction(el: HTMLElement, key: string, prediction: Prediction): void {
    textĐãXửLý.set(el, key);
    predictionTheoElement.set(el, { fingerprint: key, prediction });
    stats.scanned++;
    if (nênChe(prediction)) {
        ápDụngBlur(el);
        stats.toxic++;
    }
    lưuTrễ();
}

export function quét(gốc: Node = document.body): void {
    if (!gốc || gốc.nodeType !== Node.ELEMENT_NODE) return;
    for (const el of thuThậpKhối(gốc)) {
        const key = fingerprint(el.textContent ?? "");
        if (textĐãXửLý.get(el) === key) continue;
        const hardMatch = matchLookup(key);
        if (hardMatch) {
            hàngĐợi.delete(el);
            if (textĐãXửLý.has(el)) bỏCanThiệp(el);
            applyPrediction(el, key, hardMatch);
        } else {
            hàngĐợi.add(el);
        }
    }
    if (gốc instanceof HTMLAnchorElement && gốc.matches("a[href]")) đánhDấuLink(gốc);
    if (gốc instanceof Element) gốc.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(đánhDấuLink);
    xửLýHàngĐợi();
}

function quanSát(body: HTMLElement): void {
    observer = new MutationObserver(records => {
        for (const record of records) {
            if (record.type === "attributes" && record.target instanceof HTMLAnchorElement) {
                đánhDấuLink(record.target);
                continue;
            }
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
    observer.observe(body, {
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["href"],
        subtree: true,
    });
}

async function khởiĐộng(): Promise<void> {
    if (!document.body || đãKhởiĐộng) return;
    đãKhởiĐộng = true;
    đăngKýĐiềuKhiển();
    quanSát(document.body);
    quét(document.body);
}

function đăngKýMởNộiDung(): void {
    if (đãĐăngKýMởNộiDung) return;
    window.addEventListener("click", xửLýClickMở, true);
    window.addEventListener("keydown", xửLýPhímMở, true);
    đãĐăngKýMởNộiDung = true;
}

đăngKýMởNộiDung();
if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () => void khởiĐộng(), { once: true });
else void khởiĐộng();

declare global {
    interface Window {
        CyberShield: {
            quét: typeof quét;
            stats: () => StatsSnapshot;
            cache: Map<string, Prediction>;
            dừng: () => void;
        };
    }
}
window.CyberShield = {
    quét,
    stats: () => ({ ...stats }),
    cache,
    dừng: () => {
        observer?.disconnect();
        window.removeEventListener("click", xửLýClickMở, true);
        window.removeEventListener("keydown", xửLýPhímMở, true);
        đãĐăngKýMởNộiDung = false;
        gỡĐiềuKhiển();
        if (hẹnThửLại !== undefined) clearTimeout(hẹnThửLại);
        if (hẹnGửiThốngKê !== undefined) clearTimeout(hẹnGửiThốngKê);
        hàngĐợi.clear();
    },
};

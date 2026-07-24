/**
 * content.js — Chạy trên mọi trang web.
 *
 * Ba bài toán hiệu năng phải giải, nếu không extension sẽ làm treo trang:
 *   1. Không quét lại toàn trang liên tục  -> MutationObserver + debounce 250ms
 *   2. Không phân loại lại câu đã gặp      -> cache theo nội dung đã chuẩn hoá
 *   3. Không chặn luồng vẽ giao diện       -> xử lý theo lô trong requestIdleCallback
 */

(() => {
  const NGƯỠNG = 0.60;              // độ tin cậy tối thiểu mới can thiệp
  const ĐỘ_DÀI_TỐI_THIỂU = 8;       // bỏ qua chuỗi quá ngắn ("ok", "hihi")
  const BỎ_QUA = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "SVG"]);

  const cache = new Map();
  let stats = { toxic: 0, threat: 0, links: 0, revealed: 0, scanned: 0 };
  let sẵnSàng = false;

  // ------------------------------------------------------------ thống kê
  function lưuThốngKê() {
    if (typeof chrome === "undefined" || !chrome.storage) return;
    const ngày = new Date().toISOString().slice(0, 10);
    chrome.storage.local.set({ ["cs_" + ngày]: stats, cs_meta: CyberShieldModel.meta });
  }
  const lưuTrễ = debounce(lưuThốngKê, 1500);

  function debounce(fn, ms) {
    let id;
    return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); };
  }

  // ------------------------------------------------------------ phân loại
  function phânLoại(text) {
    const key = CyberShieldModel.normalize(text);
    if (key.length < ĐỘ_DÀI_TỐI_THIỂU) return null;
    if (cache.has(key)) return cache.get(key);
    const r = CyberShieldModel.predict(text);
    cache.set(key, r);
    if (cache.size > 4000) cache.delete(cache.keys().next().value);
    return r;
  }

  // ------------------------------------------------------- can thiệp DOM
  function bọcNộiDung(el, kết) {
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

    nhãn.querySelector(".cs-reveal").addEventListener("click", (e) => {
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

  function đánhDấuLink(a) {
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
  function thuThậpKhối(gốc) {
    const ra = [];
    const walker = document.createTreeWalker(gốc, NodeFilter.SHOW_ELEMENT, {
      acceptNode(el) {
        if (BỎ_QUA.has(el.tagName)) return NodeFilter.FILTER_REJECT;
        if (el.dataset && el.dataset.csDone) return NodeFilter.FILTER_REJECT;
        if (el.isContentEditable) return NodeFilter.FILTER_REJECT;
        // chỉ lấy phần tử "lá văn bản": có chữ, và không có con nào cũng có chữ
        const text = el.textContent.trim();
        if (text.length < ĐỘ_DÀI_TỐI_THIỂU || text.length > 1200) return NodeFilter.FILTER_SKIP;
        for (const c of el.children) if (c.textContent.trim().length >= ĐỘ_DÀI_TỐI_THIỂU) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) ra.push(n);
    return ra;
  }

  function quét(gốc = document.body) {
    if (!sẵnSàng || !gốc || gốc.nodeType !== 1) return;

    const khối = thuThậpKhối(gốc);
    const links = gốc.querySelectorAll ? gốc.querySelectorAll("a[href]") : [];

    let i = 0;
    const rảnh = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 0));

    function lô(deadline) {
      while (i < khối.length && deadline.timeRemaining() > 2) {
        const el = khối[i++];
        if (el.dataset.csDone) continue;
        const kết = phânLoại(el.textContent);
        stats.scanned++;
        if (kết && kết.label !== 0 && kết.confidence >= NGƯỠNG) bọcNộiDung(el, kết);
        else el.dataset.csDone = "1";
      }
      if (i < khối.length) rảnh(lô);
      else lưuTrễ();
    }
    rảnh(lô);
    links.forEach(đánhDấuLink);
  }

  const quétTrễ = debounce(() => quét(document.body), 250);

  // ------------------------------------------------------------- khởi động
  async function khởiĐộng() {
    const url = (typeof chrome !== "undefined" && chrome.runtime)
      ? chrome.runtime.getURL("model.json")
      : "model.json";                       // để chạy được cả trong demo.html
    const meta = await CyberShieldModel.load(url);
    sẵnSàng = true;
    console.log(`[CyberShield] Đã nạp mô hình "${meta["phương_án"]}" — macro-F1 = ${meta.macro_f1_cv}. Xử lý hoàn toàn tại máy.`);

    quét(document.body);

    new MutationObserver((ds) => {
      for (const d of ds) if (d.addedNodes.length) { quétTrễ(); return; }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", khởiĐộng);
  else khởiĐộng();

  window.CyberShield = { quét, stats: () => stats, cache };
})();

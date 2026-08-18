/** popup.js — Chỉ đọc thống kê lưu cục bộ trong máy. Không có yêu cầu mạng nào. */

const khoáHômNay = "cs_" + new Date().toISOString().slice(0, 10);

function vẽ(s, meta) {
  const quét = Math.max(s.scanned, 1);
  const xúc = s.toxic, đe = s.threat;
  const an = Math.max(quét - xúc - đe, 0);

  const t = document.getElementById("thanh").children;
  t[0].style.width = (an / quét) * 100 + "%";
  t[1].style.width = (xúc / quét) * 100 + "%";
  t[2].style.width = (đe / quét) * 100 + "%";

  document.getElementById("s-quét").textContent = s.scanned.toLocaleString("vi-VN");
  document.getElementById("s-che").textContent = (xúc + đe).toLocaleString("vi-VN");
  document.getElementById("s-link").textContent = s.links.toLocaleString("vi-VN");
  document.getElementById("s-mở").textContent = s.revealed.toLocaleString("vi-VN");

  document.getElementById("mô-hình").textContent = meta
    ? `${meta["phương_án"]} · macro-F1 = ${meta.macro_f1_cv}`
    : "Chưa quét trang nào trong hôm nay.";
}

const rỗng = { toxic: 0, threat: 0, links: 0, revealed: 0, scanned: 0 };

chrome.storage.local.get([khoáHômNay, "cs_meta"], (d) => {
  vẽ(d[khoáHômNay] || rỗng, d.cs_meta);
});

document.getElementById("xoá").addEventListener("click", () => {
  chrome.storage.local.remove(khoáHômNay, () => vẽ(rỗng, null));
});

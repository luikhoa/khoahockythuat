/**
 * linkcheck.js — Kiểm tra liên kết đáng ngờ.
 *
 * Nói rõ để không phóng đại: phần này KHÔNG dùng AI. Nó là một bộ quy tắc
 * (heuristic) dựa trên các dấu hiệu lừa đảo đã được ghi nhận. Mỗi dấu hiệu
 * cộng một số điểm; tổng điểm >= 3 thì cảnh báo. Cách này minh bạch, giải
 * thích được cho người dùng, và không cần dữ liệu huấn luyện.
 */

const CyberShieldLink = (() => {
  const TLD_RỦI_RO = ["tk", "ml", "ga", "cf", "gq", "top", "xyz", "click", "link", "zip", "mov", "rest", "cam"];
  const RÚT_GỌN = ["bit.ly", "tinyurl.com", "shorturl.at", "cutt.ly", "is.gd", "t.co", "rb.gy", "rebrand.ly"];

  // Thương hiệu hay bị giả mạo -> tên miền chính thức
  const THƯƠNG_HIỆU = {
    facebook: ["facebook.com", "fb.com", "messenger.com"],
    zalo: ["zalo.me", "zalo.vn"],
    garena: ["garena.vn", "garena.com"],
    google: ["google.com", "google.com.vn", "youtube.com"],
    shopee: ["shopee.vn"],
    momo: ["momo.vn"],
    tiktok: ["tiktok.com"],
    vietcombank: ["vietcombank.com.vn"],
    roblox: ["roblox.com"],
  };

  const TỪ_MỒI = ["nhanqua", "nhan-qua", "trungthuong", "trung-thuong", "freefire", "kimcuong",
    "kim-cuong", "napthe", "nap-the", "hack", "vip", "mienphi", "mien-phi", "quatang",
    "xacminh", "xac-minh", "verify", "login", "dangnhap", "dang-nhap", "khoiphuc", "otp"];

  // Hậu tố hai cấp: nếu không xử lý, vietcombank.com.vn sẽ bị coi là "com.vn"
  // và bị báo giả mạo oan.
  const HẬU_TỐ_ĐÔI = new Set(["com.vn", "net.vn", "org.vn", "edu.vn", "gov.vn", "info.vn",
    "biz.vn", "co.uk", "com.au", "co.jp", "com.cn", "com.br"]);

  function tênMiềnChính(host) {
    const p = host.split(".");
    if (p.length <= 2) return host;
    const đôi = p.slice(-2).join(".");
    return HẬU_TỐ_ĐÔI.has(đôi) ? p.slice(-3).join(".") : đôi;
  }

  /** @returns {{score:number, level:"an toàn"|"nghi ngờ"|"nguy hiểm", reasons:string[]}} */
  function check(rawUrl) {
    const reasons = [];
    let score = 0, u;
    try {
      u = new URL(rawUrl, location.href);
    } catch {
      return { score: 0, level: "an toàn", reasons: [] };
    }
    if (!/^https?:$/.test(u.protocol)) return { score: 0, level: "an toàn", reasons: [] };

    const host = u.hostname.toLowerCase();
    const path = (u.pathname + u.search).toLowerCase();
    const base = tênMiềnChính(host);

    if (u.protocol === "http:") { score += 1; reasons.push("Không mã hoá (http, không phải https)"); }

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      score += 3; reasons.push("Địa chỉ là dãy số IP thay vì tên miền");
    }
    if (host.startsWith("xn--") || host.includes(".xn--")) {
      score += 3; reasons.push("Tên miền dùng ký tự nhìn giống chữ thường (đồng hình)");
    }
    const tld = host.split(".").pop();
    if (TLD_RỦI_RO.includes(tld)) {
      score += 2; reasons.push(`Đuôi tên miền .${tld} thường bị dùng cho trang lừa đảo`);
    }
    if (RÚT_GỌN.includes(base)) {
      score += 2; reasons.push("Link rút gọn — không thấy được đích thật sự");
    }
    if (host.split(".").length >= 5) {
      score += 1; reasons.push("Quá nhiều tên miền phụ nối nhau");
    }
    if ((host.match(/-/g) || []).length >= 3) {
      score += 1; reasons.push("Tên miền có nhiều dấu gạch ngang bất thường");
    }

    for (const [brand, official] of Object.entries(THƯƠNG_HIỆU)) {
      if ((host.includes(brand) || path.includes(brand)) && !official.includes(base)) {
        score += 3;
        reasons.push(`Nhắc đến "${brand}" nhưng tên miền thật là ${base}`);
        break;
      }
    }

    const mồi = TỪ_MỒI.filter((k) => host.includes(k) || path.includes(k));
    if (mồi.length) {
      score += Math.min(2, mồi.length);
      reasons.push(`Chứa từ khoá dụ dỗ: ${mồi.slice(0, 3).join(", ")}`);
    }
    if (/@/.test(u.href.split("?")[0].replace(/^https?:\/\//, "").split("/")[0])) {
      score += 3; reasons.push("Có ký tự @ trong địa chỉ — che giấu tên miền thật");
    }

    const level = score >= 5 ? "nguy hiểm" : score >= 3 ? "nghi ngờ" : "an toàn";
    return { score, level, reasons };
  }

  return { check };
})();

if (typeof module !== "undefined") module.exports = CyberShieldLink;

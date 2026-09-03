/**
 * classifier.js — Cầu nối giữa content script và backend AI.
 *
 * predict() gửi text tới backend (POST http://127.0.0.1:8000/predict, xem
 * backend/predictor.py) để phân loại; việc suy luận không còn chạy trong
 * trình duyệt.
 *
 * model.json vẫn được tải để lấy thông tin mô tả mô hình (phiên bản,
 * macro-F1 lúc huấn luyện) hiển thị trong popup — không dùng để suy luận.
 */

const CyberShieldModel = (() => {
  let M = null;

  return {
    async load(url) {
      M = await (await fetch(url)).json();
      return M.meta;
    },

    get meta() { return M ? M.meta : null; },

    /** @returns {{label:number, name:string, confidence:number, proba:number[]}} */
    async predict(raw) {
      if (!M) throw new Error("Chưa nạp model.json");
      
      const response = await fetch('http://127.0.0.1:8000/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: raw })
      });

      if (!response.ok) {
        throw new Error(`Backend returned an error: ${response.status}`);
      }

      const result = await response.json();
      return result;
    }
  };
})();

if (typeof module !== "undefined") module.exports = CyberShieldModel;

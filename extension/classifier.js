/**
 * classifier.js — Chạy lại y hệt pipeline scikit-learn, nhưng bằng JavaScript.
 *
 * Vì sao không gọi API về server?
 *   Nếu gửi text về server thì mọi bình luận, tin nhắn học sinh nhìn thấy đều
 *   rời khỏi máy các em. Logistic Regression chỉ là phép nhân–cộng vector, nên
 *   ta xuất tham số ra model.json và tính ngay tại chỗ. Không có dữ liệu nào
 *   rời khỏi trình duyệt, và không cần server để chấm thi.
 *
 * Ba bước phải khớp TUYỆT ĐỐI với train.py:
 *   normalize()  ==  hàm normalize() trong train.py
 *   charNgrams() ==  TfidfVectorizer(analyzer='char', ngram_range=(2,5))
 *   tfidf + softmax == LogisticRegression.predict_proba()
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

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

  const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s" };

  function normalize(text) {
    let t = String(text).normalize("NFC").toLowerCase();
    t = t.replace(/[013457@$]/g, (c) => LEET[c]);
    t = t.replace(/[.*_\-~^|/\\+]/g, "");   // n.g.u -> ngu, ng*u -> ngu
    t = t.replace(/(.)\1{2,}/g, "$1$1");    // nguuuuu -> nguu
    t = t.replace(/\s+/g, " ").trim();
    return t;
  }

  function charNgrams(text, minN, maxN) {
    const counts = new Map();
    const L = text.length;
    const top = Math.min(maxN, L);
    for (let n = minN; n <= top; n++) {
      for (let i = 0; i + n <= L; i++) {
        const g = text.slice(i, i + n);
        counts.set(g, (counts.get(g) || 0) + 1);
      }
    }
    return counts;
  }

  function wordNgrams(text, minN, maxN) {
    const words = text.match(/\b\w\w+\b/gu) || [];
    const counts = new Map();
    for (let n = minN; n <= maxN; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const g = words.slice(i, i + n).join(" ");
        counts.set(g, (counts.get(g) || 0) + 1);
      }
    }
    return counts;
  }

  /** Vector TF-IDF đã chuẩn hoá L2, trả về dạng thưa: [chỉ số, giá trị][] */
  function vectorize(raw) {
    const text = normalize(raw);
    const [minN, maxN] = M.meta.ngram;
    const counts = M.meta.analyzer === "char"
      ? charNgrams(text, minN, maxN)
      : wordNgrams(text, minN, maxN);

    const pairs = [];
    let sumSq = 0;
    for (const [gram, tf] of counts) {
      const entry = M.vocab[gram];
      if (!entry) continue;                 // n-gram ngoài từ điển -> bỏ qua
      const v = tf * entry[1];              // tf * idf
      pairs.push([entry[0], v]);
      sumSq += v * v;
    }
    const norm = Math.sqrt(sumSq);
    if (norm > 0) for (const p of pairs) p[1] /= norm;
    return pairs;
  }

  function softmax(scores) {
    const m = Math.max(...scores);
    const e = scores.map((s) => Math.exp(s - m));
    const total = e.reduce((a, b) => a + b, 0);
    return e.map((v) => v / total);
  }

  return {
    async load(url) {
      M = await (await fetch(url)).json();
      return M.meta;
    },

    get meta() { return M ? M.meta : null; },

    /** @returns {{label:number, name:string, confidence:number, proba:number[]}} */
    predict(raw) {
      if (!M) throw new Error("Chưa nạp model.json");
      const x = vectorize(raw);
      const scores = M.intercept.map((b, c) => {
        const row = M.coef[c];
        let s = b;
        for (const [i, v] of x) s += row[i] * v;
        return s;
      });
      const proba = softmax(scores);
      let best = 0;
      for (let i = 1; i < proba.length; i++) if (proba[i] > proba[best]) best = i;
      return { label: best, name: M.meta["nhãn"][best], confidence: proba[best], proba };
    },

    normalize,
  };
})();

if (typeof module !== "undefined") module.exports = CyberShieldModel;

# -*- coding: utf-8 -*-
"""
train.py — Huấn luyện, đánh giá và xuất mô hình sang JSON cho extension.

Chạy:  python3 model/train.py

Việc script này làm, theo đúng thứ tự cần trình bày trong báo cáo:
  1. So sánh 3 phương án: baseline từ khoá / TF-IDF n-gram TỪ / TF-IDF n-gram KÝ TỰ
  2. Đánh giá bằng Stratified 5-fold cross-validation (precision, recall, F1 theo lớp)
  3. In ma trận nhầm lẫn của mô hình tốt nhất
  4. Xuất tham số ra extension/model.json để JavaScript tự suy luận (không cần server)
"""
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.model_selection import StratifiedGroupKFold, cross_val_predict
from sklearn.pipeline import make_pipeline

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "dataset.csv"
OUT = ROOT / "extension" / "model.json"
LABELS = ["an toàn", "xúc phạm", "đe doạ"]

# ---------------------------------------------------------------------------
# 1. Tiền xử lý — PHẢI trùng khớp 100% với hàm normalize() trong content.js
# ---------------------------------------------------------------------------
LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s"})


def normalize(text: str) -> str:
    t = unicodedata.normalize("NFC", str(text)).lower()
    t = t.translate(LEET)
    t = re.sub(r"[.*_\-~^|/\\+]", "", t)      # bỏ ký tự chèn để né bộ lọc: n.g.u -> ngu
    t = re.sub(r"(.)\1{2,}", r"\1\1", t)      # nguuuuu -> nguu
    t = re.sub(r"\s+", " ", t).strip()
    return t


# ---------------------------------------------------------------------------
# 2. Baseline: danh sách từ khoá cấm (đại diện cho bộ lọc truyền thống)
# ---------------------------------------------------------------------------
BLACKLIST = ["ngu", "óc chó", "im mồm", "câm mồm", "cút", "rác rưởi", "vô dụng",
             "đánh", "biết tay", "liệu hồn", "bóc phốt", "tẩy chay", "xử mày"]


def baseline_predict(texts):
    out = []
    for t in texts:
        n = normalize(t)
        if any(k in n for k in ["đánh", "biết tay", "liệu hồn", "bóc phốt", "tẩy chay", "xử mày"]):
            out.append(2)
        elif any(k in n for k in BLACKLIST):
            out.append(1)
        else:
            out.append(0)
    return np.array(out)


# ---------------------------------------------------------------------------
def build(analyzer, ngram):
    vec = TfidfVectorizer(analyzer=analyzer, ngram_range=ngram, min_df=2,
                          max_features=6000, preprocessor=normalize, lowercase=False)
    clf = LogisticRegression(max_iter=2000, C=5.0, class_weight="balanced")
    return make_pipeline(vec, clf)


def main():
    df = pd.read_csv(DATA)
    X, y = df["text"].astype(str).values, df["label"].values
    groups = df["group"].values
    # Chia fold theo GROUP: mọi biến thể của cùng một câu gốc nằm trọn trong
    # một fold. Nếu chia ngẫu nhiên thường, mô hình sẽ "học thuộc" câu gốc ở
    # tập train rồi gặp lại biến thể của nó ở tập test → điểm ảo.
    cv = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)

    print(f"Dữ liệu: {len(X)} câu — phân bố lớp: {np.bincount(y).tolist()}\n")
    print("=" * 66)
    print("SO SÁNH CÁC PHƯƠNG ÁN (macro-F1, Stratified 5-fold)")
    print("=" * 66)

    results = {}

    yb = baseline_predict(X)
    results["Baseline từ khoá"] = (f1_score(y, yb, average="macro"), None, yb)

    for name, analyzer, ngram in [
        ("TF-IDF n-gram TỪ (1-2)", "word", (1, 2)),
        ("TF-IDF n-gram KÝ TỰ (2-5)", "char", (2, 5)),
    ]:
        pipe = build(analyzer, ngram)
        pred = cross_val_predict(pipe, X, y, cv=cv, groups=groups)
        results[name] = (f1_score(y, pred, average="macro"), pipe, pred)

    for name, (score, _, _) in results.items():
        print(f"  {name:<28} macro-F1 = {score:.3f}")

    best_name = max((k for k in results if results[k][1]), key=lambda k: results[k][0])
    print(f"\n→ Chọn: {best_name}\n")

    _, best_pipe, best_pred = results[best_name]
    print("=" * 66)
    print("BÁO CÁO CHI TIẾT (dự đoán ngoài mẫu, chia fold theo câu gốc)")
    print("=" * 66)
    print(classification_report(y, best_pred, target_names=LABELS, digits=3, zero_division=0))

    print("Ma trận nhầm lẫn (hàng = thực tế, cột = dự đoán):")
    cm = confusion_matrix(y, best_pred)
    print(f"{'':<12}" + "".join(f"{l:>12}" for l in LABELS))
    for i, row in enumerate(cm):
        print(f"{LABELS[i]:<12}" + "".join(f"{v:>12}" for v in row))

    # --- Huấn luyện lại trên toàn bộ dữ liệu rồi xuất -----------------------
    best_pipe.fit(X, y)
    vec = best_pipe.named_steps["tfidfvectorizer"]
    clf = best_pipe.named_steps["logisticregression"]

    vocab = {t: int(i) for t, i in vec.vocabulary_.items()}
    inv = [None] * len(vocab)
    for t, i in vocab.items():
        inv[i] = t

    model = {
        "meta": {
            "phiên_bản": "1.0",
            "phương_án": best_name,
            "macro_f1_cv": round(float(results[best_name][0]), 4),
            "nhãn": LABELS,
            "ngram": list(vec.ngram_range),
            "analyzer": vec.analyzer,
        },
        "vocab": {inv[i]: [i, round(float(vec.idf_[i]), 5)] for i in range(len(inv))},
        "coef": [[round(float(v), 5) for v in row] for row in clf.coef_],
        "intercept": [round(float(v), 5) for v in clf.intercept_],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(model, ensure_ascii=False), encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print(f"\nĐã xuất {OUT.relative_to(ROOT)} — {len(vocab)} đặc trưng, {kb:.0f} KB")

    # --- Kiểm chứng: Python và JS phải cho cùng kết quả ---------------------
    demo = ["mai ra cổng trường tao đánh cho một trận",
            "m ngu như bò ấy",
            "ê thằng điên này quên vở nữa rồi hahaha",
            "ai có đáp án bài 5 ko cho mk xin vs"]
    print("\nDự đoán thử (dùng để đối chiếu với bản JavaScript):")
    proba = best_pipe.predict_proba(demo)
    for t, p in zip(demo, proba):
        print(f"  [{LABELS[int(np.argmax(p))]:<9} {p.max():.3f}]  {t}")


if __name__ == "__main__":
    main()

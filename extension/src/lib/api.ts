/**
 * api.ts — Cầu nối giữa content script và backend AI.
 *
 * predict() gửi text tới backend (POST http://127.0.0.1:8000/predict, xem
 * backend/predictor.py) để phân loại; việc suy luận không còn chạy trong
 * trình duyệt.
 *
 * model.json vẫn được tải để lấy thông tin mô tả mô hình (phiên bản,
 * macro-F1 lúc huấn luyện) hiển thị trong popup — không dùng để suy luận.
 */
import type { ModelMeta, Prediction } from "./types";

const BACKEND_URL = "http://127.0.0.1:8000";

interface ModelFile {
  meta: ModelMeta;
  // vocab/coef/intercept vẫn có trong model.json nhưng không còn dùng để suy
  // luận trong trình duyệt — không cần khai báo kiểu chi tiết ở đây.
  [key: string]: unknown;
}

let M: ModelFile | null = null;

async function load(url: string): Promise<ModelMeta> {
  const res = await fetch(url);
  M = (await res.json()) as ModelFile;
  return M.meta;
}

async function predict(raw: string): Promise<Prediction> {
  if (!M) throw new Error("Chưa nạp model.json");

  const response = await fetch(`${BACKEND_URL}/predict`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: raw }),
  });

  if (!response.ok) {
    throw new Error(`Backend returned an error: ${response.status}`);
  }

  return (await response.json()) as Prediction;
}

export const CyberShieldModel = {
  load,
  predict,
  get meta(): ModelMeta | null {
    return M ? M.meta : null;
  },
};

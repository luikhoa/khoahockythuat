/**
 * types.ts — Hợp đồng kiểu dữ liệu dùng chung giữa content script, popup và
 * backend. Phải khớp với các Pydantic model trong backend/server.py.
 */

export type Label = 0 | 1;

export interface Prediction {
  label: Label;
  name: string;
  confidence: number;
  proba: [number, number];
}

export interface ModelMeta {
  "phiên_bản": string;
  "phương_án": string;
  macro_f1_cv: number;
  "nhãn": [string, string];
  ngram: [number, number];
  analyzer: "char" | "word";
}

export interface StatsSnapshot {
  toxic: number;
  threat: number;
  links: number;
  revealed: number;
  scanned: number;
}

/** Khớp EventRequest.type trong backend/server.py (POST /events). */
export type EventType = "scanned" | "toxic" | "threat" | "link" | "revealed";

export type LinkLevel = "an toàn" | "nghi ngờ" | "nguy hiểm";

export interface LinkCheckResult {
  score: number;
  level: LinkLevel;
  reasons: string[];
}

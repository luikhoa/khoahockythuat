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

export interface ModelMetadata {
  schemaVersion: 1;
  modelVersion: string;
  exportedAt?: string;
  labels: [string, string];
  maxLength: number;
  toxicThreshold: number;
  files?: Record<string, string>;
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

export interface EventPayload {
  type: EventType;
  count: number;
  ts?: string;
}

export type ClearStatsRange = "day" | "all";

export type ExtensionMessage =
  | { type: "predict"; requestId?: string; content: string }
  | { type: "model-status"; requestId?: string }
  | { type: "retry-model"; requestId?: string }
  | { type: "stats"; range: "day" | "week" }
  | { type: "event"; event: EventPayload }
  | { type: "clear-stats"; range: ClearStatsRange };

export interface OffscreenMessage {
  target: "offscreen";
  requestId: string;
  type: "predict" | "model-status" | "retry-model";
  content?: string;
}

export type ExtensionResponse<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        kind: "model-loading" | "model-load" | "inference" | "busy" | "invalid-response";
        retryable: boolean;
        message?: string;
      };
    };

export type LinkLevel = "an toàn" | "nghi ngờ" | "nguy hiểm";

export interface LinkCheckResult {
  score: number;
  level: LinkLevel;
  reasons: string[];
}

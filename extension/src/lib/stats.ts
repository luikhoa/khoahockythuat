import type { ClearStatsRange, EventType, StatsSnapshot } from "./types";

const STORAGE_PREFIX = "cs_stats_";
const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";
const EVENT_FIELDS: Record<EventType, keyof StatsSnapshot> = {
  scanned: "scanned",
  toxic: "toxic",
  threat: "threat",
  link: "links",
  revealed: "revealed",
};

interface EventInput {
  type: string;
  count: number;
  ts?: string;
}

let storageOperations: Promise<void> = Promise.resolve();

export function incrementEvent(event: EventInput, now = new Date()): Promise<void> {
  return serialize(async () => {
    const type = validateEvent(event);
    const eventDate = parseEventDate(event.ts, now);
    const key = storageKey(eventDate);
    const stored = await chrome.storage.local.get(key);
    const bucket = parseSnapshot(stored[key]);
    const field = EVENT_FIELDS[type];
    bucket[field] += event.count;
    await chrome.storage.local.set({ [key]: bucket });
  });
}

export function getStats(range: "day" | "week", now = new Date()): Promise<StatsSnapshot> {
  return serialize(async () => {
    const days = range === "week" ? recentDayKeys(now, 7) : [vietnamDay(now)];
    const keys = days.map((day) => `${STORAGE_PREFIX}${day}`);
    const stored = await chrome.storage.local.get(keys);
    return keys.reduce((total, key) => addSnapshots(total, parseSnapshot(stored[key])), emptySnapshot());
  });
}

export function clearStats(range: ClearStatsRange, now = new Date()): Promise<void> {
  return serialize(async () => {
    if (range === "day") {
      await chrome.storage.local.remove(storageKey(now));
      return;
    }
    const stored = await chrome.storage.local.get(null);
    const keys = Object.keys(stored).filter((key) => key.startsWith(STORAGE_PREFIX));
    if (keys.length > 0) await chrome.storage.local.remove(keys);
  });
}

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageOperations.then(operation, operation);
  storageOperations = result.then(() => undefined, () => undefined);
  return result;
}

function validateEvent(event: EventInput): EventType {
  if (!Object.prototype.hasOwnProperty.call(EVENT_FIELDS, event.type)) {
    throw new Error(`Invalid event type: ${event.type}`);
  }
  if (!Number.isInteger(event.count) || event.count < 1 || event.count > 10_000) {
    throw new Error("Event count must be an integer from 1 to 10000");
  }
  return event.type as EventType;
}

function parseEventDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function storageKey(date: Date): string {
  return `${STORAGE_PREFIX}${vietnamDay(date)}`;
}

function vietnamDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: VIETNAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function recentDayKeys(now: Date, count: number): string[] {
  const [year, month, day] = vietnamDay(now).split("-").map(Number);
  const anchor = Date.UTC(year, month - 1, day);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(anchor - (count - index - 1) * 86_400_000);
    return date.toISOString().slice(0, 10);
  });
}

function emptySnapshot(): StatsSnapshot {
  return { scanned: 0, toxic: 0, threat: 0, links: 0, revealed: 0 };
}

function parseSnapshot(value: unknown): StatsSnapshot {
  if (!value || typeof value !== "object") return emptySnapshot();
  const record = value as Record<string, unknown>;
  const snapshot = emptySnapshot();
  for (const field of Object.keys(snapshot) as Array<keyof StatsSnapshot>) {
    const count = record[field];
    snapshot[field] = typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : 0;
  }
  return snapshot;
}

function addSnapshots(left: StatsSnapshot, right: StatsSnapshot): StatsSnapshot {
  return {
    scanned: left.scanned + right.scanned,
    toxic: left.toxic + right.toxic,
    threat: left.threat + right.threat,
    links: left.links + right.links,
    revealed: left.revealed + right.revealed,
  };
}

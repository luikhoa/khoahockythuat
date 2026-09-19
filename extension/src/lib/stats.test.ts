import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();

beforeEach(() => {
  vi.resetModules();
  store.clear();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (keys?: string | string[] | null) => {
          await Promise.resolve();
          if (keys == null) return Object.fromEntries(store);
          const names = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(names.filter((key) => store.has(key)).map((key) => [key, store.get(key)]));
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          await Promise.resolve();
          for (const [key, value] of Object.entries(items)) store.set(key, structuredClone(value));
        }),
        remove: vi.fn(async (keys: string | string[]) => {
          for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
        }),
      },
    },
  });
});

describe("local statistics", () => {
  it("tuần tự hóa delta từ hai tab và giữ count theo chunk", async () => {
    const { getStats, incrementEvent } = await import("./stats");
    const now = new Date("2026-09-19T05:00:00Z");

    await Promise.all([
      incrementEvent({ type: "scanned", count: 10_000 }, now),
      incrementEvent({ type: "scanned", count: 37 }, now),
    ]);

    await expect(getStats("day", now)).resolves.toEqual({
      scanned: 10_037,
      toxic: 0,
      threat: 0,
      links: 0,
      revealed: 0,
    });
  });

  it("tách bucket đúng lúc nửa đêm Việt Nam", async () => {
    const { getStats, incrementEvent } = await import("./stats");
    const beforeMidnight = new Date("2026-09-19T16:59:59Z");
    const afterMidnight = new Date("2026-09-19T17:00:01Z");

    await incrementEvent({ type: "toxic", count: 2 }, beforeMidnight);
    await incrementEvent({ type: "toxic", count: 3 }, afterMidnight);

    await expect(getStats("day", beforeMidnight)).resolves.toMatchObject({ toxic: 2 });
    await expect(getStats("day", afterMidnight)).resolves.toMatchObject({ toxic: 3 });
  });

  it("cộng đúng bảy ngày gần nhất", async () => {
    const { getStats, incrementEvent } = await import("./stats");
    await incrementEvent({ type: "link", count: 99 }, new Date("2026-09-12T17:00:00Z"));
    await incrementEvent({ type: "link", count: 2 }, new Date("2026-09-13T17:00:00Z"));
    await incrementEvent({ type: "revealed", count: 4 }, new Date("2026-09-19T05:00:00Z"));
    await incrementEvent({ type: "link", count: 3 }, new Date("2026-09-19T17:00:00Z"));

    await expect(getStats("week", new Date("2026-09-20T05:00:00Z"))).resolves.toEqual({
      scanned: 0,
      toxic: 0,
      threat: 0,
      links: 5,
      revealed: 4,
    });
  });

  it("xóa riêng hôm nay hoặc toàn bộ bucket CyberShield", async () => {
    const { clearStats, getStats, incrementEvent } = await import("./stats");
    const yesterday = new Date("2026-09-18T05:00:00Z");
    const today = new Date("2026-09-19T05:00:00Z");
    await incrementEvent({ type: "threat", count: 2 }, yesterday);
    await incrementEvent({ type: "threat", count: 3 }, today);
    store.set("unrelated", { keep: true });

    await clearStats("day", today);
    await expect(getStats("week", today)).resolves.toMatchObject({ threat: 2 });
    await clearStats("all", today);

    await expect(getStats("week", today)).resolves.toMatchObject({ threat: 0 });
    expect(store.get("unrelated")).toEqual({ keep: true });
  });

  it.each([
    { type: "unknown", count: 1 },
    { type: "toString", count: 1 },
    { type: "scanned", count: 0 },
    { type: "scanned", count: 10_001 },
    { type: "scanned", count: 1.5 },
  ])("từ chối event sai schema: $type/$count", async (event) => {
    const { incrementEvent } = await import("./stats");
    await expect(incrementEvent(event, new Date("2026-09-19T05:00:00Z"))).rejects.toThrow();
  });
});

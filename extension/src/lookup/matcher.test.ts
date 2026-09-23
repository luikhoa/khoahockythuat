import { describe, expect, it, vi } from "vitest";
import { createMatcher, lookupSchema, matchLookup, normalizeLookup } from "./matcher";

describe("offline safety lookup", () => {
  it.each(["địt", "địt mẹ", "ĐỤ MÁ", "(cặc!)", "tao sẽ địt mẹ mày", "địt mẹ".normalize("NFD"), "đ\u200bịt", "địt...   mẹ", "n.g.u", "n...g...u", "n g u", "ng.u", "f*ck", "c.a.c", "l.ồ.n"])("hard matches %s", text => {
    expect(matchLookup(text)?.source).toBe("lookup");
  });
  it("preserves Vietnamese accents and normalizes invisibles and whitespace", () => {
    expect(normalizeLookup("  ĐU\u0323\u200b  MÁ ")).toBe("đụ má");
  });
  it.each(lookupSchema.context_sensitive.map(entry => entry.value))("leaves context term %s to model", text => {
    expect(matchLookup(text)).toBeUndefined();
  });
  it.each(["class", "scunthorpe", "skilled", "abcdefuckxyz", "admire", "cacophony", "cuộc sống", "xn.g.uy", "n.g.uyen", "ngu", "shitty"])("avoids substring match %s", text => {
    expect(matchLookup(text)).toBeUndefined();
  });
  it("loads every entry offline and records diagnostics", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    try {
      const match = createMatcher(lookupSchema);
      for (const group of ["hard_words", "hard_phrases", "obfuscation_variants"] as const) {
        for (const entry of lookupSchema[group]) expect(match(entry.value)?.source).toBe("lookup");
      }
      expect(match("tao giết mày")).toMatchObject({ matchedEntry: "tao giết mày", category: "violence" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });
  it.each([null, {}, { ...lookupSchema, version: "2" }, { ...lookupSchema, hard_words: [null] },
    { ...lookupSchema, hard_words: [{ value: "two words", category: "test" }] },
    { ...lookupSchema, context_sensitive: [...lookupSchema.context_sensitive, lookupSchema.hard_words[0]] },
  ])("rejects invalid schema clearly", schema => {
    expect(() => createMatcher(schema)).toThrow("Invalid lookup schema:");
  });
});

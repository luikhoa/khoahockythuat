import lexicon from "./lexicon.json";
import type { Prediction } from "../lib/types";

const groups = ["hard_words", "hard_phrases", "context_sensitive", "obfuscation_variants"] as const;
type Group = typeof groups[number];
interface Entry { value: string; category: string }
export type LookupSchema = { version: "1.0" } & Record<Group, Entry[]>;

// Preserve accents and letter identity; remove invisible format characters only.
export function normalizeLookup(text: string): string {
  return text.replace(/\p{Cf}/gu, "").normalize("NFC").toLowerCase().replace(/\s+/gu, " ").trim();
}

export function validateSchema(value: unknown): LookupSchema {
  const fail = (message: string): never => { throw new Error(`Invalid lookup schema: ${message}`); };
  if (!value || typeof value !== "object") return fail("expected object");
  const schema = value as Record<string, unknown>;
  if (schema.version !== "1.0") return fail("unsupported version");
  const seen = new Set<string>();
  for (const group of groups) {
    if (!Array.isArray(schema[group])) return fail(`missing array ${group}`);
    for (const entry of schema[group]) {
      if (!entry || typeof entry.value !== "string" || !normalizeLookup(entry.value)
        || typeof entry.category !== "string" || !entry.category.trim()) return fail(`invalid entry in ${group}`);
      const normalized = normalizeLookup(entry.value);
      if (!/^[\p{L}\p{M}\p{N}_].*[\p{L}\p{M}\p{N}_]$/u.test(normalized)
        && !/^[\p{L}\p{M}\p{N}_]$/u.test(normalized)) return fail(`invalid boundaries ${normalized}`);
      if (seen.has(normalized)) return fail(`duplicate entry ${normalized}`);
      seen.add(normalized);
      if (group === "hard_words" && !/^[\p{L}\p{M}\p{N}_]+$/u.test(normalized)) return fail(`invalid word ${normalized}`);
      if (group === "hard_phrases" && !/^[\p{L}\p{M}\p{N}_]+(?: [\p{L}\p{M}\p{N}_]+)+$/u.test(normalized)) return fail(`invalid phrase ${normalized}`);
    }
  }
  return value as LookupSchema;
}

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const boundary = "[\\p{L}\\p{M}\\p{N}_]";
const separator = "[^\\p{L}\\p{M}\\p{N}_]+";

export function createMatcher(rawSchema: unknown): (text: string) => Prediction | undefined {
  const schema = validateSchema(rawSchema);
  // Longest entries first makes diagnostics prefer specific phrases.
  const rules = (["hard_phrases", "obfuscation_variants", "hard_words"] as const)
    .flatMap(group => schema[group].map(entry => ({ entry, group })))
    .sort((a, b) => b.entry.value.length - a.entry.value.length)
    .map(({ entry, group }) => {
      const value = normalizeLookup(entry.value);
      // Variants require their explicit internal separators: never collapse n.g.u into ngu.
      const pattern = group === "obfuscation_variants"
        ? (value.match(/[\p{L}\p{M}\p{N}_]+|[^\p{L}\p{M}\p{N}_]+/gu) ?? [])
          .map(part => /^[\p{L}\p{M}\p{N}_]/u.test(part) ? escapeRegex(part) : `(?:${escapeRegex(part)})+`).join("")
        : value.split(" ").map(escapeRegex).join(separator);
      return { entry, regex: new RegExp(`(?:^|${separator})${pattern}(?!${boundary})`, "u") };
    });
  return text => {
    const normalized = normalizeLookup(text);
    for (const { entry, regex } of rules) {
      if (regex.test(normalized)) return {
        label: 1, name: "độc hại", confidence: 1, proba: [0, 1],
        source: "lookup", matchedEntry: entry.value, category: entry.category,
      };
    }
    return undefined;
  };
}

export const lookupSchema = validateSchema(lexicon);
export const matchLookup = createMatcher(lookupSchema);

# Deterministic lookup safety layer

The lexicon is manually curated, provisional, and not linguistically exhaustive.
It intentionally prioritizes recall. Quoted, educational, reclaimed, and benign
uses of hard entries still intervene; context does not override hard rules.

## Architecture and precedence

Visible eligible DOM text → existing `fingerprint` (trim/collapse whitespace) →
lookup normalization and matching → hard result uses existing whole-block
blur/reveal/stats path; otherwise the unchanged cached model client → background
service worker → offscreen document → worker → tokenizer → ONNX Runtime Web
(WebGPU, with WASM fallback) → existing probability decision.

The integration is in `quét` in `extension/src/content/content.ts`, immediately
after fingerprinting, before adding misses to the inference queue. Hard rules
work even when the model queue is paused or waiting for a response. Repeated DOM
scans use the existing per-element fingerprint, and the same `applyPrediction`
function handles both sources. No additional warning UI is created. A hard match
blurs the entire eligible DOM text block, not just the matched word. Existing
scanner exclusions and 2–1200 character bounds still apply; this is not a new
sentence segmenter and does not join text across separate DOM blocks.

Hard matches make zero prediction requests. Model status requests or inference
already in flight may still initialize/run the model. Direct model API calls
remain model-only; this safety policy applies to DOM scanning, including the
standalone demo. Model misses retain original text, cache keys, and probabilities.
Production thresholds remain unchanged: model label 0.30, content blur 0.50.

Lookup predictions have `source: "lookup"`, `matchedEntry`, and `category`.
Their `[0, 1]` compatibility score is a deterministic decision, not a measured
model probability; UI also explicitly recognizes lookup source. Existing model
predictions are unchanged (source absent). Metadata stays internal.

## Editable schema and policy

`extension/src/lookup/lexicon.json` is bundled by esbuild into the content script;
no runtime file fetch, server, or network is needed. Version `1.0` has four arrays
of `{ "value": "...", "category": "..." }` entries:

| Group | Count | Behavior |
| --- | ---: | --- |
| hard_words | 36 | Whole word |
| hard_phrases | 123 | Consecutive words with separator boundaries |
| context_sensitive | 21 | Stored only; never a hard rule |
| obfuscation_variants | 42 | Explicit spelling and separator pattern |

There are 222 unique entries from 250 submitted occurrences. All 28 duplicates
were merged: địt, đụ, đcm, dcm, đkm, dkm, dm, clm, clmm, vcl, vkl, vl, bùi, loz,
l0n, l0z, âm hộ, tinh hoàn, chim, cu, ngu vl, ngu vcl, đần, cave, thẩm du, giết,
chém, shit.

Context-sensitive membership wins over A–H for identical entries: đần, giết,
chém, chim, cu, bùi, cave, shit, thẩm du, tinh hoàn, âm hộ are stored only in
context_sensitive. All 21 context entries pass through to AI; this is not a safe
allowlist. More specific hard phrases still apply (e.g. `tao giết mày`, `bú cu`,
`vãi shit`). Exact H variants belong to obfuscation_variants rather than being
duplicated in hard groups, including `ngu vl` and `ngu vcl`. Explicit `n.g.u`,
`n g u`, and `ng.u` are hard even though plain `ngu` is context-sensitive.

To add/remove a rule, edit the JSON array, keeping each normalized value unique
across all groups. Move an entry to context_sensitive to disable its hard rule.
Use hard_words for one token, hard_phrases for multiple tokens, and variants for
explicit evasions. Include a nonempty category. Run typecheck, unit tests,
model-less or full build, and benchmark after editing. A schema version change
requires updating the validator. Unsupported versions, missing arrays, malformed
entries, invalid word/phrase structure, and cross-group duplicates throw a clear
`Invalid lookup schema:` error at module loading; they are not silently ignored.

## Matching semantics

Lookup-only normalization removes Unicode format characters (including zero-width
characters), composes Unicode NFC, lowercases, and collapses whitespace. Accents
are preserved; no global accent stripping, transliteration, or character-repeat
collapse is performed. Model input normalization is not changed.

Rules are precompiled Unicode regular expressions with boundaries defined by
letters, combining marks, numbers, and underscore. A short token cannot match
inside a longer such token. Phrase gaps accept one or more non-token characters,
including repeated punctuation or spaces (`địt... mẹ`). Phrase gaps can therefore
cross punctuation that would otherwise mark sentence boundaries.

Variants preserve their explicit internal punctuation or spaces, accepting
repetition of that separator (`n...g...u`, `c..a..c`). Whitespace is normalized
before matching. A dotted variant does not silently become its plain form;
`n.g.u` does not make plain `ngu` hard. Mixed separator substitutions and arbitrary
unlisted evasions are not exhaustively recognized. Longest entries are checked
first for deterministic, specific diagnostics; array order breaks ties.

## Risks and limitations

Hard `lol`, `cac`, `mf`, `biến`, `xiên`, `ai hỏi`, and animal/abuse phrases may
match benign acronyms, names, jokes, math, food, questions, or literal descriptions.
This is accepted policy, as are quotation and educational false positives.
Context-sensitive terms may still blur based on AI. Unknown slang, homoglyphs,
accentless spellings not listed, arbitrary inserted separators, cross-element
phrases, excluded page regions, and oversized blocks may evade lookup.

Remaining policy questions for future revisions: whether to narrow ambiguous
hard entries, whether explicit evasions of context-sensitive terms should stay
hard, and when/how to activate context-sensitive rules. None blocks version 1.0;
the supplied hard lists and context precedence determine current behavior.

## Verification and benchmark

Run from `extension/`: `npm run typecheck`, `npm test`,
`CS_SKIP_MODEL=1 npm run build` (when no model is present), and
`node scripts/benchmark-lookup.mjs`. The benchmark compiles the real matcher,
warms 10,000 calls, and times 60,000 calls on 12 synthetic texts (hard hits,
context terms, misses, and a 1,200-character miss). It reports mean/p95 latency and
hard-match count. It excludes compilation, DOM traversal, and model time; its
hit ratio is not a real-world model savings estimate.

Measured on 2026-09-23, Node v24.14.1, macOS arm64: 60,000 calls after
10,000 warmups; mean **0.03328 ms**, p95 **0.20679 ms**. The synthetic corpus
produced 30,000 hard hits (50%); these take the no-model scanner branch. Actual
zero-call behavior is separately asserted by integration tests, not measured as
model throughput by this microbenchmark.

Validation: TypeScript passed; **119 tests across 8 Vitest files passed**;
model-less esbuild passed; **1 Chromium bundled-content smoke test passed** with
network blocked, covering hard/obfuscated blur and reveal. The existing full
ONNX E2E smoke test was not run because this checkout has no `extension/model/`.
No model was generated or modified. A stale UI threshold test was corrected from
0.60 to the existing production boundary of 0.50; production thresholds were
not edited.

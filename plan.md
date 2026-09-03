# CyberShield — Refactoring Plan

Scope: extension frontend (JS → TS), backend/API architecture, dashboard. AI implementation (`backend/predictor.py`) is out of scope — treated as a fixed external boundary. No Tailwind/PostCSS/build-CSS tooling — popup/dashboard keep hand-authored CSS.

## 1. Current architecture assessment

### How it works today
- **Extension** (`extension/`): `content.js` walks the DOM for "leaf" text nodes, calls `CyberShieldModel.predict()` (`classifier.js`) for each, and blurs + badges anything with `label !== 0 && confidence >= 0.60`. `linkcheck.js` independently scores outbound links with a hand-written heuristic (no AI, no network). Stats (`scanned/toxic/threat/links/revealed`) are accumulated in memory and written to `chrome.storage.local` under a day key (`cs_YYYY-MM-DD`). `popup.html`/`popup.js` reads that single day key and renders a bar + 4 numbers — this *is* the dashboard today.
- **Backend** (`backend/`): a two-file FastAPI app. `server.py` is a thin CORS+validation wrapper around `predictor.predict()`. `predictor.py` (owned by the AI dev) is currently a placeholder that returns a canned "đe doạ" result for the literal string `"helloworld"` and "an toàn" otherwise. No persistence, no other routes.
- **Data flow**: DOM text → `POST /predict` → label/confidence → blur decision (client) → stats written to `chrome.storage.local` → popup reads local storage. Nothing is persisted server-side; the backend is stateless.

### Problems found
1. **Privacy copy is stale.** `classifier.js`'s doc comment and `popup.html`'s "Không có chữ nào rời khỏi máy bạn." both describe the old local-inference design. `CyberShieldModel.predict()` no longer runs a local model — it POSTs the raw DOM text to `http://127.0.0.1:8000/predict`. The client→local-backend architecture is the accepted design (not a pending product decision); the leftover copy/comments just need correcting to match it, and `model.json`'s TF-IDF vocab is now fetched only for its `meta` field (model version/macro-F1 shown in the popup), not for inference.
2. **No backend persistence at all.** Every number the "dashboard" shows is computed and stored purely client-side, per browser profile, per day, with no rollup logic. The project brief wants "how many items blocked this week" — there is no weekly aggregation anywhere, and nothing durable survives `chrome.storage.local` being cleared or a different device being used.
3. **No resilience around the network call.** `phânLoại()` in `content.js` awaits `CyberShieldModel.predict()` with no try/catch; a backend outage or CORS/network failure throws inside the `requestIdleCallback` loop and silently stops scanning for the rest of the page load.
4. **Backend URL is hardcoded** (`http://127.0.0.1:8000/predict` in `classifier.js`, mirrored in `manifest.json` `host_permissions`) — there is no config seam for a non-localhost deployment.
5. **No build step / no types.** Everything is hand-written global-scope JS loaded directly by `manifest.json`'s `content_scripts`. Fine at this size, but there's no shared contract between the `Prediction` shape FastAPI/Pydantic emits and what `content.js` assumes — a field rename in `predictor.py` would fail silently at runtime.
6. **No tests anywhere** in the repo (frontend or backend).
7. **Popup mixes structure, ~140 lines of hand-rolled CSS, and behavior in one file** — workable now, will not scale once an options page / weekly dashboard is added.

## 2. Target architecture

### Responsibilities
| Concern | Owner today | Owner going forward |
|---|---|---|
| DOM text extraction, blur/badge UI, reveal button | frontend | **frontend** (unchanged — inherently client-side) |
| Link heuristic scoring | frontend | **frontend** (unchanged — no AI, no PII, no reason to move) |
| Per-text-classification cache (in-memory `Map`) | frontend | **frontend** (unchanged — pure perf optimization) |
| Calling the AI classifier | frontend → backend → AI | **unchanged shape**, just made resilient (timeout/health-check) |
| Threshold for "is this bad enough to blur" (`NGƯỠNG = 0.60`) | frontend constant | **frontend for now**; becomes backend-configurable once a settings feature exists (future) |
| Stats counting | frontend, local-only | **backend becomes source of truth**; frontend keeps a local cache for instant popup paint / offline use |
| Dashboard aggregation (today/week) | frontend (today only, no week logic) | **backend** (`GET /stats`) — frontend should not reimplement date-bucketing |
| AI inference | `predictor.py` | **unchanged — do not touch** |

### Project structure
```
extension/
  src/
    content/        content.js logic (DOM scan, blur, badges) — content.ts
    lib/
      api.ts         backend base URL + typed fetch wrappers (predict, events, stats, health)
      linkcheck.ts    unchanged logic, typed
      storage.ts      chrome.storage.local read/write + local fallback stats
      types.ts        Prediction, StatsSnapshot, etc. — the shared contract
    popup/
      popup.ts
      popup.html
      styles.css       plain CSS, moved as-is out of popup.html's inline <style>
  content.css          stays hand-authored, NOT Tailwind (see §2 CSS below)
  manifest.json
  dist/                build output referenced by manifest.json (gitignored)
backend/
  server.py            routes only (predict, events, stats, health)
  predictor.py          untouched — AI boundary
  storage.py            new: tiny SQLite read/write helpers for events/stats
  requirements.txt
```
No new frontend framework (no React/Vue) — the DOM-manipulation style `content.js` already uses is appropriate for a content script and isn't worth replacing at this size.

### TypeScript migration approach
Convert file-by-file, preserving runtime behavior exactly (same debounce timings, same thresholds), in dependency order (leaves first):
1. `linkcheck.js` → `linkcheck.ts` (pure function, no `chrome.*`, lowest risk, easiest to typecheck)
2. `classifier.js` → `lib/api.ts` (introduce the `Prediction` type here; this is also where the backend-URL config and error handling land)
3. `content.js` → `content.ts`
4. `popup.js` → `popup.ts`

Add `tsconfig.json` with `strict: true` from the start (small codebase — retrofitting strictness later is more expensive than starting with it). Use `esbuild` (or Vite's chrome-extension-friendly config) to bundle each content-script entry and the popup into `dist/`, since MV3's CSP forbids remote/eval'd code — everything must be pre-bundled and self-hosted.

### CSS approach
No Tailwind/PostCSS anywhere in this project. Both CSS surfaces stay hand-authored:
- `content.css` — the styling injected into arbitrary third-party pages (blur, badge, reveal button) — keeps the existing `.cs-` prefix.
- `popup.html`'s current inline `<style>` block is extracted verbatim into `popup/styles.css` as part of the file-structure refactor (§ project structure above), with no rewrite of the rules themselves.

### API boundary
- `POST /predict` keeps its exact current request/response shape — it's the AI dev's contract and `content.js` already depends on it in production. Do not change it.
- New endpoints are additive under the same flat namespace (no need for `/v1` prefixing yet at this scale — revisit if/when a breaking change to `/predict` is ever needed).
- Response/request models stay Pydantic-defined in `server.py`; the TS side hand-mirrors them in `lib/types.ts` (codegen/OpenAPI-sync tooling is unnecessary at 2 backend files).

### Data flow after refactor
**Moderation:** DOM text → `POST /predict` (unchanged) → blur decision (unchanged, client-side) → on blur/reveal, `content.ts` also calls `lib/api.ts` to fire a debounced batched event to the backend.

**Stats/dashboard:** batched events → `POST /events` → backend increments SQLite counters → popup calls `GET /stats?range=day|week` on open, rendering from that; `chrome.storage.local` is kept only as a same-render-frame fallback if the backend is unreachable (so the popup never shows a blank state offline).

## 3. API changes

**Unchanged:**
- `POST /predict` — no changes. AI boundary.

**New:**
- `POST /events` — body: `{type: "scanned"|"toxic"|"threat"|"link"|"revealed", ts?: string}` (no text/content, no PII — just a counter increment, matching what's already tracked client-side today). Backend increments a persisted counter bucketed by day. Called by the frontend on the same debounce cadence `content.js` already uses for `chrome.storage.local` today (no new chattiness).
- `GET /stats?range=day|week` — returns the same shape the popup currently computes by hand: `{scanned, toxic, threat, links, revealed}`, aggregated server-side over the requested range. This is what actually satisfies "dashboard showing stats for this week," which nothing today computes.
- `GET /health` — trivial `{status: "ok"}`. Used by the frontend to detect backend unavailability up front and degrade gracefully (fall back to local-only stats, skip classification calls) instead of throwing mid-scan.

**Persistence:** a single SQLite file via `sqlite3`/SQLAlchemy-core in a new `backend/storage.py`. This is the smallest durable store that satisfies "record blocked-content statistics" and "dashboard statistics" — a full database service is not justified at this scale.

## 4. Refactoring steps

**Step 1 — Correctness/privacy fixes (no restructuring, do first, low risk):**
- Wrap `CyberShieldModel.predict()` calls in `content.js` with error handling so a network failure doesn't kill the scan loop.
- Add a startup `GET /health` check (once implemented) or a try/catch fallback so scanning degrades gracefully when the backend is down.
- Fix the stale "no data leaves your machine" copy/comments in `classifier.js`, `popup.html`, and `manifest.json`'s description to match the actual client→local-backend architecture — no privacy guarantee claimed either way, just accurate, neutral descriptions of what the code does.
- Keep the `model.json` fetch (its `meta` — model version, macro-F1 — is shown in the popup), but stop implying anywhere in comments/copy that it's used for local inference.

**Step 2 — Backend persistence & stats API** (depends on nothing in Step 3/4; can land independently):
- Add `backend/storage.py` (SQLite) + `POST /events` + `GET /stats` to `server.py`. Do not touch `predictor.py`.
- Wire `content.js`'s existing debounced stats writer to also POST events to the backend.
- Update `popup.js` to fetch `GET /stats` first, falling back to the existing `chrome.storage.local` read only on failure.

**Step 3 — Tooling foundation for TS** (independent of Step 2, can run in parallel):
- Add `package.json`, `tsconfig.json` (`strict: true`), bundler config (`esbuild`/Vite) for `extension/`.
- Convert files in the order given in §2 (linkcheck → api/classifier → content → popup), verifying against `demo/demo.html` and `demo/feed_demo.html` after each conversion that behavior is unchanged.
- Extract `popup.html`'s inline `<style>` into `popup/styles.css` verbatim (plain CSS, no framework), per § CSS approach.

**Step 4 — Structural reorg** (do after Steps 2 & 3 land, since it touches the same files):
- Move files into `extension/src/...`, update `manifest.json` to point at `dist/` build output, update `web_accessible_resources` if `model.json` is dropped, update README build/run instructions.

**Step 5 (later, optional)** — expand popup into a proper options/dashboard page once weekly stats are live end-to-end.

## 5. Risks / compatibility concerns

- **MV3 CSP**: no remote or eval'd script is allowed in the extension context — the TS bundler output must be fully self-contained and self-hosted.
- **`manifest.json` `host_permissions`** is hardcoded to `http://127.0.0.1:8000/*`. Any change to the backend host/scheme (e.g. a real deployment) requires updating this alongside the CORS config and the frontend's base-URL config together, or requests silently fail. Centralize the base URL in one place (`lib/api.ts`) so this is a one-line change.
- **`chrome.storage.local` migration**: once `GET /stats` becomes the primary source, don't discard a user's already-accumulated local counts on upgrade — read-fallback should remain in place rather than being ripped out immediately.
- **Content-script network calls run on every page** (`matches: ["<all_urls>"]`) — the new `/events` calls must stay on the existing debounce cadence, not add new per-item network traffic.
- **TypeScript conversion risk**: convert with type annotations only on the first pass per file; do not refactor logic/structure in the same commit as the JS→TS conversion, so any regression is attributable to one change at a time.
- No existing test suite to catch regressions — manual verification via `demo/demo.html` / `demo/feed_demo.html` (as the README already documents) is the available safety net; consider adding at least a couple of unit tests for `linkcheck.ts`'s pure scoring logic during its conversion, since it's the easiest module to test in isolation.

## 6. Future considerations (not needed for this MVP)

- A separate parent/school-facing dashboard web app consuming `GET /stats` across devices — the current backend design (SQLite + simple counters) leaves room for this without redesign.
- A settings/config endpoint (adjustable blur threshold, allow/deny lists) surfaced via an options page — `NGƯỠNG = 0.60` staying a frontend constant is fine until this exists.
- Auth/rate-limiting on the backend once it's reachable beyond localhost.
- Swapping SQLite for a networked database only if/when concurrent write volume or multi-instance backend deployment actually requires it — not justified now.
- Structured logging/metrics once there's more than one backend instance to observe.
- On the AI-integration boundary specifically (without touching `predictor.py` itself): the backend could add a request-level cache (hash of normalized text → cached `Prediction`) in `server.py` ahead of the call into `predictor.predict()`, to reduce load on the external AI service — this lives entirely on the `server.py` side of the documented boundary.

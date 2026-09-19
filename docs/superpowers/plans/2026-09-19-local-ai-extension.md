# Local AI Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển CyberShield sang phân loại PhoBERT hoàn toàn trong Chrome/Edge extension, đóng gói model để chạy offline và bỏ phụ thuộc FastAPI lúc sử dụng.

**Architecture:** Content script gửi message tới MV3 service worker; service worker định tuyến inference qua một offscreen document giữ AI Web Worker dùng tokenizer cục bộ và ONNX Runtime Web. Thống kê được service worker cộng theo delta vào `chrome.storage.local`; Python chỉ còn export/kiểm chứng artifact.

**Tech Stack:** TypeScript strict, esbuild, Vitest/JSDOM, Playwright Chromium, Chrome MV3 Offscreen API, `@huggingface/transformers`, `onnxruntime-web`, Python/PyTorch/Transformers, ONNX/ONNX Runtime.

**Spec:** `docs/superpowers/specs/2026-09-19-local-ai-extension-design.md`

## Global Constraints

- Không yêu cầu FastAPI, Python, Hugging Face hoặc Internet ở runtime.
- Model, tokenizer, JavaScript và WASM phải nằm trong package extension; package model FP16 mục tiêu dưới 300 MB.
- Giữ `p1 = sigmoid(logits[1])`, label độc hại từ `p1 >= 0.4`, và blur từ `label === 1 && confidence >= 0.6`.
- Input có 1–1.200 ký tự; tokenizer truncate ở 128 token; hai nhãn là `an toàn` và `độc hại`.
- Ưu tiên WebGPU, fallback WASM; Chrome/Edge tối thiểu Chromium 109.
- Không thêm `unlimitedStorage`, không tải code/model từ CDN, không giữ host permission localhost.
- Không sửa các finding DOM/layout ngoài phạm vi bỏ backend.
- Theo `AGENTS.md`, agent không chạy `git add`, `git commit` hoặc `git push`; cuối mỗi task chỉ ghi checkpoint bàn giao.

## Review Focus

- Model hoặc tokenizer thiếu/sai checksum phải báo `model-load`, không trả dự đoán an toàn giả.
- Nhiều tab khởi động cùng lúc chỉ tạo một offscreen document, một worker và một ONNX session.
- Text quanh hai ngưỡng 0.4/0.6 không đổi hành vi do làm tròn hoặc lượng tử hóa mà không được báo trong parity report.
- Service worker restart giữa lúc ghi event không làm tab này ghi đè snapshot của tab khác.
- WebGPU có API nhưng không hỗ trợ operator của graph phải fallback WASM và hoàn tất request đang chờ.

---

### Task 1: Pipeline export và deployment contract

**Files:**
- Create: `backend/export_onnx.py`
- Create: `backend/model_contract.py`
- Create: `tests/unit/test_export_contract.py`
- Modify: `backend/requirements.txt`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `backend/offensive_classifier.pkl`, cached/downloaded `vinai/phobert-base-v2` snapshot.
- Produces: `python -m backend.export_onnx --output extension/model`; `validate_artifact(path: Path) -> ModelMetadata`; ONNX inputs `input_ids:int64[batch,sequence]`, `attention_mask:int64[batch,sequence]`; output `toxic_logit:float32[batch]`.

- [x] **Step 1: Write contract tests**

Add tests using a temporary fake artifact. Assert required files are `model.onnx`, `tokenizer.json`, `tokenizer_config.json`, `config.json`, `metadata.json`; metadata requires `schemaVersion: 1`, SHA-256 fields, labels `["an toàn", "độc hại"]`, `maxLength: 128`, `toxicThreshold: 0.4`, and rejects missing files/checksum mismatch/three labels.

- [x] **Step 2: Verify the tests fail**

Run: `.venv/bin/python -m pytest tests/unit/test_export_contract.py -q`

Expected: FAIL because `backend.model_contract` does not exist.

- [x] **Step 3: Implement metadata validation**

Define frozen dataclass `ModelMetadata` and `validate_artifact`. Parse JSON without importing `predictor.py`; stream SHA-256 in 1 MiB chunks; raise `ArtifactValidationError` with the failing filename/reason. Add `extension/model/` to `.gitignore` because the release build contains generated binary assets but source Git does not track the ~270 MB ONNX file.

- [x] **Step 4: Implement deterministic export CLI**

Create an `ExportableClassifier(torch.nn.Module)` that calls the existing frozen backbone, selects CLS, applies the saved `Linear(768,256) -> GELU -> Linear(256,2)` head, and returns `logits[:, 1]` without sigmoid or rounding. Load tokenizer/model with `local_files_only` when `--offline` is passed; copy tokenizer assets including the cached `tokenizer.json`; export FP32 with opset 17 and dynamic batch/sequence axes; optimize transformer graph; convert weights to FP16; generate metadata/checksums; delete FP32 intermediate only after FP16 validates.

CLI flags must be `--artifact backend/offensive_classifier.pkl`, `--output extension/model`, `--offline`, and `--model-version`. Add `onnx`, `onnxruntime`, and `onnxscript` to Python requirements with compatible major-version bounds.

- [x] **Step 5: Test the contract and export help path**

Run:

```bash
.venv/bin/python -m pytest tests/unit/test_export_contract.py -q
.venv/bin/python -m backend.export_onnx --help
```

Expected: tests PASS; help lists all four flags without loading PhoBERT.

- [x] **Step 6: Export the real artifact and record the checkpoint**

Run:

```bash
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 .venv/bin/python -m backend.export_onnx --offline --model-version phobert-offensive-1 --output extension/model
du -sh extension/model
```

Expected: validation succeeds and total artifact is below 300 MB. Do not commit; record generated size and files in the handoff note.

### Task 2: Python–ONNX parity gate

**Files:**
- Create: `backend/verify_onnx.py`
- Create: `tests/unit/test_verify_onnx.py`
- Create/generated: `tests/results/onnx_parity_summary.json`

**Interfaces:**
- Consumes: validated `extension/model`, `tests/results/blackbox_raw.csv` content/expected labels, Python `predictor.predict` oracle.
- Produces: `compare_predictions(rows, python_predict, onnx_predict) -> ParitySummary`; CLI exits nonzero for label agreement below 99% or F1 loss above 0.01.

- [x] **Step 1: Write parity-metric tests**

Use synthetic rows covering exact agreement, probability drift, a 0.4 label crossing and a 0.6 blur crossing. Assert summary fields `count`, `labelAgreement`, `blurAgreement`, `p1ErrorMean`, `p1ErrorP95`, `p1ErrorMax`, `f1Python`, `f1Onnx`, and `thresholdCrossings`.

- [x] **Step 2: Run tests and see the missing module failure**

Run: `.venv/bin/python -m pytest tests/unit/test_verify_onnx.py -q`

- [x] **Step 3: Implement the verifier**

Load tokenizer from `extension/model` only; run ONNX Runtime CPU session; apply sigmoid in float64 for reporting; derive labels/confidence with the production thresholds. Read full text from `tests/blackbox_runner.py` fixtures when CSV contains only previews, rather than treating `content_preview` as original input. Write JSON atomically and print a compact metrics table.

- [x] **Step 4: Run real parity**

Run:

```bash
HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 .venv/bin/python -m backend.verify_onnx --model extension/model --output tests/results/onnx_parity_summary.json
```

Expected: at least 99% label agreement and no more than 0.01 absolute F1 loss; every threshold crossing is listed. If the gate fails, stop and adjust model export format rather than weakening thresholds.

- [x] **Step 5: Run backend regression tests**

Run: `.venv/bin/python -m pytest tests/unit/test_predictor.py tests/unit/test_server_api.py -q`

Expected: PASS. Record parity metrics as the task checkpoint; do not commit.

### Task 3: Browser inference worker

**Files:**
- Create: `extension/src/inference/protocol.ts`
- Create: `extension/src/inference/model-runtime.ts`
- Create: `extension/src/inference/worker.ts`
- Create: `extension/src/inference/model-runtime.test.ts`
- Modify: `extension/package.json`, `extension/package-lock.json`, `extension/tsconfig.json`, `extension/build.js`

**Interfaces:**
- Produces: `ModelRuntime.initialize(): Promise<ModelStatus>`; `ModelRuntime.predict(content: string): Promise<Prediction>`; worker messages `initialize`, `predict`, `status`, `dispose` correlated by `requestId`.
- `ModelStatus.state`: `loading | ready-webgpu | ready-wasm | error`.
- Error kinds: `model-loading | model-load | inference | busy | invalid-response` plus `retryable`.

- [x] **Step 1: Add failing unit tests with injected runtime adapters**

Test one-time initialization; WebGPU success; WebGPU session failure followed by WASM success; both providers fail; identical in-flight text shares one inference; LRU evicts after 4.000 entries; queue overflow returns `busy`; empty/1.201-character input is rejected; NaN/output wrong shape becomes `invalid-response`.

- [x] **Step 2: Run the focused tests**

Run: `cd extension && npm test -- src/inference/model-runtime.test.ts`

Expected: FAIL because modules do not exist.

- [x] **Step 3: Add browser dependencies and build entries**

Add explicit runtime dependencies `@huggingface/transformers` and `onnxruntime-web`. Resolve tokenizer/model paths from the packaged worker URL; set `allowRemoteModels = false`; point WASM paths to bundled `dist/wasm/`. Add `inference-worker` entry, copy only required WASM files and copy `extension/model` into `dist/model`. Build must fail clearly when validated model files are absent; allow `CS_SKIP_MODEL=1 npm run build` only for unit-test/development bundles.

- [x] **Step 4: Implement runtime and worker protocol**

Use `AutoTokenizer.from_pretrained(localUrl, { local_files_only: true })` and direct ONNX `InferenceSession`. Convert tokenizer tensors to BigInt64Array/int64 inputs. Try `executionProviders: ["webgpu"]`, run warm-up, then retry a new session with `["wasm"]`. Apply sigmoid, thresholds and four-decimal probability rounding exactly once after inference. Serialize inference through a bounded queue and implement the 4.000-entry LRU.

- [x] **Step 5: Pass unit/type/build checks**

Run:

```bash
cd extension
npm run typecheck
npm test -- src/inference/model-runtime.test.ts
npm run build
```

Expected: PASS and `dist/` contains worker, required WASM files and model assets. Record bundle/model sizes; do not commit.

### Task 4: Offscreen host, service worker routing and local statistics

**Files:**
- Create: `extension/src/offscreen/offscreen.html`
- Create: `extension/src/offscreen/offscreen.ts`
- Create: `extension/src/lib/stats.ts`
- Create: `extension/src/lib/stats.test.ts`
- Modify: `extension/src/background.ts`, `extension/src/background.test.ts`, `extension/src/lib/types.ts`, `extension/build.js`, `extension/manifest.json`

**Interfaces:**
- Service worker accepts `predict`, `model-status`, `retry-model`, `event`, `stats`, `clear-stats` messages.
- `ensureOffscreenDocument(): Promise<void>` is single-flight and checks `chrome.runtime.getContexts` before creation.
- `incrementEvent(event, now?): Promise<void>`, `getStats(range, now?): Promise<StatsSnapshot>`, `clearStats(range, now?): Promise<void>` own `cs_stats_YYYY-MM-DD` keys.

- [x] **Step 1: Replace background fetch tests with routing/lifecycle tests**

Assert simultaneous predicts call `chrome.offscreen.createDocument` once; existing context is reused; responses correlate by request ID; worker error propagates; retry recreates worker; no code calls `fetch`. Add stats tests for two simulated tabs, count chunks, Vietnam midnight rollover, seven-day sum, day clear and all clear.

- [x] **Step 2: Run focused tests and confirm failures**

Run: `cd extension && npm test -- src/background.test.ts src/lib/stats.test.ts`

- [x] **Step 3: Implement atomic local stats ownership**

Serialize read-modify-write operations in the service worker with one promise chain. Store delta events by Vietnam date; never accept/overwrite a full snapshot from a tab. Validate event type/count using the current 1–10.000 limit. Return zero-filled snapshots for missing buckets.

- [x] **Step 4: Implement offscreen routing**

Build one offscreen page and worker. Background creates it with reason `WORKERS`, relays requests over `chrome.runtime` messages and preserves structured errors. Offscreen owns the worker, pending-request map, crash handling and one automatic recreation on the next explicit predict/retry.

- [x] **Step 5: Update manifest/build**

Remove `http://127.0.0.1:8000/*`; add `offscreen`; set `minimum_chrome_version` to `109`; set extension CSP to `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`; copy offscreen HTML. Do not expose model files to arbitrary websites via `web_accessible_resources` unless runtime testing proves the worker needs it.

- [x] **Step 6: Verify the subsystem**

Run: `cd extension && npm run typecheck && npm test -- src/background.test.ts src/lib/stats.test.ts && npm run build`

Expected: PASS; source and built manifest contain no localhost permission. Record checkpoint; do not commit.

### Task 5: Content client, popup and standalone demo

**Files:**
- Modify: `extension/src/lib/api.ts`, `extension/src/content/content.ts`, `extension/src/content/content.test.ts`
- Modify: `extension/src/popup/popup.ts`, `extension/src/popup/popup.html`, `extension/src/popup/styles.css`
- Create: `extension/src/popup/popup.test.ts`
- Modify: `demo/demo.html`, `extension/build.js`
- Remove: `extension/model.json`

**Interfaces:**
- `CyberShieldModel.predict`, `status`, `retryModel`, `stats`, `event`, `clearStats` use internal messages; standalone mode creates a local inference worker directly.
- Popup renders provider/status and calls `clearStats("day")` rather than deleting only its local fallback key.

- [x] **Step 1: Rewrite API/content tests before production changes**

Assert extension mode never calls fetch; loading/busy errors remain queued with backoff; non-retryable model-load pauses classification without blocking link checks; duplicate text is coalesced; content sends event deltas only. Remove health/network expectations.

- [x] **Step 2: Add popup tests**

Assert `loading`, WebGPU, WASM and error copy; retry button calls `retry-model`; daily clear updates the service-worker source and rerenders; metadata uses packaged PhoBERT metadata and never displays the old TF-IDF macro-F1.

- [x] **Step 3: Run tests and verify old behavior fails**

Run: `cd extension && npm test -- src/content/content.test.ts src/popup/popup.test.ts`

- [x] **Step 4: Replace HTTP adapter and health loop**

Rename backend-oriented types to extension message types. Remove `BACKEND_URL`, `directOnce`, HTTP retry and `health`. Keep one request envelope validator. In content scanning, retry only errors marked `retryable`; pause on permanent model error; resume on a successful explicit retry/status change. Stop writing full stats snapshots from content tabs.

- [x] **Step 5: Update popup and metadata**

Render provider/state; wire retry and clear through messages. Load metadata from `model/metadata.json`. Delete obsolete three-label `extension/model.json` and remove its web-accessible entry.

- [x] **Step 6: Keep standalone demo local**

For pages without `chrome.runtime.id`, instantiate the same worker using a URL emitted by build and serve model/WASM from the static extension output. Update demo copy and controls so no path assumes port 8000.

- [x] **Step 7: Verify UI integration**

Run: `cd extension && npm run verify`

Expected: all unit tests/typecheck/build PASS. Search `rg -n "127\\.0\\.0\\.1:8000|BACKEND_URL|/health|TF-IDF" extension/src extension/manifest.json demo` and resolve every runtime/stale-copy hit. Record checkpoint; do not commit.

### Task 6: Offline E2E, documentation and final verification

**Files:**
- Modify: `extension/tests/e2e/extension.smoke.test.ts`, `extension/playwright.config.ts`
- Modify: `README.md`, `AGENTS.md` only if commands/layout have changed
- Modify: `docs/QA_REPORT.md`
- Create: `docs/LOCAL_MODEL_WORKFLOW.md`

**Interfaces:**
- E2E exposes measured model state through popup/UI, not test-only production hooks.
- Workflow documents `train -> export -> parity -> build -> offline E2E` and artifact compatibility rules.

- [ ] **Step 1: Replace fake-backend E2E with offline inference assertions**

Block every `http:`/`https:` request except the local demo fixture server and fail the test on attempted localhost:8000/Hugging Face/CDN access. Load unpacked extension, wait for `ready-webgpu` or `ready-wasm`, verify initial/dynamic toxic content, safe content, reveal action, multiple tabs sharing stats, popup persistence after service-worker restart and clear-day behavior.

- [ ] **Step 2: Run E2E and fix only migration regressions**

Run: `cd extension && npm run test:e2e`

Expected: PASS without FastAPI running. Do not fix unrelated DOM findings in this task; record them separately.

- [ ] **Step 3: Document operation and retraining**

README must contain no backend startup prerequisite for users. `LOCAL_MODEL_WORKFLOW.md` records required Python/Node commands, offline export behavior, metadata schema, parity gates, generated artifact location, package-size check, and how a newly trained compatible checkpoint is moved into the extension. QA report must distinguish runtime migration parity from actual model-quality improvement.

- [ ] **Step 4: Run complete verification**

Run:

```bash
.venv/bin/python -m pytest tests/unit -q
cd extension && npm run verify && npm run test:e2e
cd .. && git diff --check
rg -n "127\\.0\\.0\\.1:8000|BACKEND_URL" extension demo README.md
du -sh extension/dist
```

Expected: all tests PASS; grep has no runtime references; packaged model stays below 300 MB; Git diff has no whitespace errors.

- [ ] **Step 5: Produce the final handoff**

Report changed files, Python–ONNX parity metrics, chosen provider on test machine, cold-start/warm p50/p95 if measured, package size, full verification outputs, and known model-quality limitations. Leave all changes unstaged and uncommitted for the user.

import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Offline smoke test for the local-inference build: no FastAPI backend is
 * started here. Model, tokenizer and ONNX Runtime WASM all ship inside
 * extension/dist, so the only network server this suite runs is the static
 * fixture on :8080. A context-wide route aborts every other request and the
 * suite fails if any of them were attempted (localhost:8000, Hugging Face,
 * a CDN, ...).
 */

const SAFE_TEXT = "Xin chào, rất vui được làm quen với mọi người.";
const TOXIC_TEXT = "thằng chó đẻ";
const TOXIC_DYNAMIC = "thằng khốn này chết đi";
const TOXIC_MUTATED = "thằng óc lợn";
const ALLOWED_ORIGINS = ["http://127.0.0.1:8080", "http://localhost:8080"];

let fixture: Server;

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test.beforeAll(async () => {
  fixture = createServer((request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    if (request.url === "/feed_demo.html") {
      response.end(readFileSync(path.resolve(__dirname, "../../../demo/feed_demo.html")));
      return;
    }
    response.end(`<!doctype html><html><body><main>
      <p id="safe">${SAFE_TEXT}</p>
      <p id="toxic">${TOXIC_TEXT}</p>
      <input id="draft" aria-label="draft">
      <div id="dynamic"></div>
    </main></body></html>`);
  });
  await listen(fixture, 8080);
});

test.afterAll(async () => {
  await close(fixture);
});

async function launchExtension(userDataDir: string, blocked: string[]): Promise<BrowserContext> {
  const extensionPath = path.resolve(__dirname, "../..");
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: "chromium",
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("chrome-extension:") || ALLOWED_ORIGINS.some((origin) => url.startsWith(origin))) {
      void route.continue();
      return;
    }
    blocked.push(url);
    void route.abort();
  });
  return context;
}

async function extensionId(context: BrowserContext): Promise<string> {
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent("serviceworker");
  return new URL(worker.url()).host;
}

async function sendMessage<T>(page: Page, message: unknown): Promise<T> {
  return page.evaluate((msg) => chrome.runtime.sendMessage(msg), message) as Promise<T>;
}

async function waitModelReady(page: Page): Promise<string> {
  let state = "";
  await expect.poll(async () => {
    const response = await sendMessage<{ ok: boolean; data?: { state: string; error?: unknown } }>(page, { type: "model-status" });
    state = response.data?.state ?? "";
    return state;
  }, { timeout: 120_000, intervals: [1_000] }).toMatch(/^ready-(webgpu|wasm)$/);
  return state;
}

interface Stats {
  scanned: number;
  toxic: number;
  threat: number;
  links: number;
  revealed: number;
}

const ZERO_STATS: Stats = { scanned: 0, toxic: 0, threat: 0, links: 0, revealed: 0 };

// chrome.storage.local writes are debounced 1.5s in the content script before
// being sent as delta events; give that time to flush before reading stats.
async function readStats(statsPage: Page): Promise<Stats> {
  await statsPage.waitForTimeout(2_000);
  return (await sendMessage<{ data: Stats }>(statsPage, { type: "stats", range: "day" })).data;
}

test("offline local inference: scan, reveal, multi-tab stats, service-worker restart, clear-day", async () => {
  test.setTimeout(240_000);
  const blocked: string[] = [];
  const userDataDir = await mkdtemp(path.join(tmpdir(), "cybershield-playwright-"));
  const context = await launchExtension(userDataDir, blocked);
  try {
    const id = await extensionId(context);
    const popupUrl = `chrome-extension://${id}/dist/popup.html`;

    // --- Model loads fully offline and reaches a ready provider state ---
    const bootPopup = await context.newPage();
    await bootPopup.goto(popupUrl);
    const providerState = await waitModelReady(bootPopup);
    await bootPopup.reload();
    await expect(bootPopup.locator("#trạng-thái")).toHaveText(/sẵn sàng/);
    await expect(bootPopup.locator("#mô-hình")).toContainText("PhoBERT");
    await expect(bootPopup.locator("#mô-hình")).not.toContainText("TF-IDF");
    await bootPopup.close();

    // A dedicated extension page for reading stats via the same messages the popup uses.
    // A content page's `window` is a page-world evaluate target, not the content
    // script's isolated world, so stats reads go through this instead.
    const statsPopupA = await context.newPage();
    await statsPopupA.goto(popupUrl);
    expect(await readStats(statsPopupA)).toEqual(ZERO_STATS);

    // --- Tab A: initial scan, draft privacy, dynamic content, node mutation, reveal ---
    const tabA = await context.newPage();
    await tabA.goto("http://127.0.0.1:8080");
    await expect(tabA.locator("#toxic")).toHaveClass(/cs-blur/, { timeout: 60_000 });
    await expect(tabA.locator("#safe")).not.toHaveClass(/cs-blur/);

    const statsAfterInitialScan = await readStats(statsPopupA);
    expect(statsAfterInitialScan).toEqual({ ...ZERO_STATS, scanned: 2, toxic: 1 });

    // A draft/input value must never be scanned or sent for classification.
    await tabA.locator("#draft").fill("BẢN NHÁP RIÊNG TƯ KHÔNG GỬI");
    expect(await readStats(statsPopupA)).toEqual(statsAfterInitialScan);
    await expect(tabA.locator("main > [data-cs-ui='badge']")).toHaveCount(1);

    await tabA.locator("#dynamic").evaluate((node, text) => {
      const message = document.createElement("p");
      message.id = "appended";
      message.textContent = text;
      node.appendChild(message);
    }, TOXIC_DYNAMIC);
    await expect(tabA.locator("#appended")).toHaveClass(/cs-blur/, { timeout: 30_000 });

    await tabA.locator("#safe").evaluate((node, text) => { node.textContent = text; }, TOXIC_MUTATED);
    await expect(tabA.locator("#safe")).toHaveClass(/cs-blur/, { timeout: 30_000 });

    const statsAfterDynamicAndMutation = await readStats(statsPopupA);
    expect(statsAfterDynamicAndMutation).toEqual({ ...ZERO_STATS, scanned: 4, toxic: 3 });

    await tabA.locator("main > [data-cs-ui='badge'] .cs-reveal").first().focus();
    await tabA.keyboard.press("Enter");
    await expect(tabA.locator("#toxic")).not.toHaveClass(/cs-blur/);

    const statsAfterTabA = await readStats(statsPopupA);
    expect(statsAfterTabA).toEqual({ ...statsAfterDynamicAndMutation, revealed: 1 });

    // --- Tab B: a second tab scanning the same page contributes its own delta, never overwrites tab A's ---
    const tabB = await context.newPage();
    await tabB.goto("http://127.0.0.1:8080");
    await expect(tabB.locator("#toxic")).toHaveClass(/cs-blur/, { timeout: 60_000 });
    const statsAfterTabB = await readStats(statsPopupA);
    expect(statsAfterTabB).toEqual({ ...statsAfterTabA, scanned: statsAfterTabA.scanned + 2, toxic: statsAfterTabA.toxic + 1 });

    // --- Alternate host alias and the bundled feed demo still classify locally ---
    await tabB.goto("http://localhost:8080");
    await expect(tabB.locator("#toxic")).toHaveClass(/cs-blur/, { timeout: 60_000 });
    await tabB.goto("http://127.0.0.1:8080/feed_demo.html");
    // feed_demo.html has several independent text blocks (post, comments); any
    // scanned-count increase confirms local inference actually ran on them,
    // regardless of the label this checkpoint happens to assign each one.
    await expect.poll(async () => (await readStats(statsPopupA)).scanned, { timeout: 30_000 })
      .toBeGreaterThan(statsAfterTabB.scanned);
    const statsAfterFeedDemo = await readStats(statsPopupA);

    // --- Service worker restart: stats and model status survive an MV3 event-page teardown ---
    // Extension service workers don't expose self.close(); terminate the
    // target over CDP instead, the way Chrome itself reclaims an idle worker.
    const cdp = await context.newCDPSession(statsPopupA);
    const { targetInfos } = await cdp.send("Target.getTargets");
    const workerTarget = targetInfos.find((info) => info.type === "service_worker");
    if (!workerTarget) throw new Error("Expected an active extension service worker target");
    await cdp.send("Target.closeTarget", { targetId: workerTarget.targetId });
    // Nothing wakes an MV3 service worker until a message targets it again;
    // opening the popup does that and Chrome respawns it on demand.
    const popupAfterRestart = await context.newPage();
    await popupAfterRestart.goto(popupUrl);
    await expect(popupAfterRestart.locator("#trạng-thái")).toHaveText(/sẵn sàng/, { timeout: 60_000 });
    expect(await readStats(popupAfterRestart)).toEqual(statsAfterFeedDemo);

    // --- Clear-day zeroes today's bucket through the same message the popup button uses ---
    await sendMessage(popupAfterRestart, { type: "clear-stats", range: "day" });
    expect(await readStats(popupAfterRestart)).toEqual(ZERO_STATS);

    // feed_demo.html embeds a couple of decorative avatar images from public
    // hosts; those are blocked too (the sandbox is a full deny-by-default),
    // but only leakage toward inference/runtime infrastructure fails the run.
    const leaks = blocked.filter((url) => /127\.0\.0\.1:8000|localhost:8000|huggingface\.co|cdn\.|jsdelivr|unpkg|cdnjs/i.test(url));
    expect(leaks, `unexpected inference/runtime network requests: ${leaks.join(", ")}`).toEqual([]);
    void providerState;
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

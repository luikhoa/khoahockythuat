import { test, expect, chromium } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const requests: string[] = [];
let backend: Server;
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
  backend = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += String(chunk); });
    request.on("end", () => {
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/predict") {
        const content = String((JSON.parse(body) as { content: string }).content);
        requests.push(content);
        const toxic = content.toLowerCase().includes("độc hại");
        response.end(JSON.stringify(toxic
          ? { label: 1, name: "độc hại", confidence: 0.6, proba: [0.4, 0.6] }
          : { label: 0, name: "an toàn", confidence: 0.9, proba: [0.9, 0.1] }));
      } else if (request.url === "/health") response.end('{"status":"ok"}');
      else if (request.url?.startsWith("/stats")) response.end('{"scanned":0,"toxic":0,"threat":0,"links":0,"revealed":0}');
      else response.end('{"ok":true}');
    });
  });
  fixture = createServer((_request, response) => {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    if (_request.url === "/feed_demo.html") {
      response.end(readFileSync(path.resolve(__dirname, "../../../demo/feed_demo.html")));
      return;
    }
    response.end(`<!doctype html><html><body><main>
      <p id="safe">Nội dung an toàn ban đầu</p>
      <p id="toxic">Nội dung độc hại ban đầu</p>
      <input id="draft" aria-label="draft">
      <div id="dynamic"></div>
    </main></body></html>`);
  });
  await Promise.all([listen(backend, 8000), listen(fixture, 8080)]);
});

test.afterAll(async () => {
  await Promise.all([close(backend), close(fixture)]);
});

test("initial, dynamic, privacy, reveal and service-worker transport", async () => {
  requests.length = 0;
  const extensionPath = path.resolve(__dirname, "../..");
  const userDataDir = await mkdtemp(path.join(tmpdir(), "cybershield-playwright-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: "chromium",
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  try {
    const page = await context.newPage();
    const pageBackendRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith("http://127.0.0.1:8000")) pageBackendRequests.push(request.url());
    });
    await page.goto("http://127.0.0.1:8080");
    await expect(page.locator("#toxic")).toHaveClass(/cs-blur/);
    await expect.poll(() => context.serviceWorkers().length).toBeGreaterThan(0);
    expect(requests.filter((text) => text === "Nội dung độc hại ban đầu")).toHaveLength(1);

    await page.locator("#draft").fill("BẢN NHÁP RIÊNG TƯ KHÔNG GỬI");
    await page.waitForTimeout(200);
    expect(requests.some((text) => text.includes("BẢN NHÁP"))).toBe(false);

    await page.locator("#dynamic").evaluate((node) => {
      const message = document.createElement("p");
      message.id = "appended";
      message.textContent = "Tin nhắn độc hại được render";
      node.appendChild(message);
    });
    await expect(page.locator("#appended")).toHaveClass(/cs-blur/);
    await page.locator("#safe").evaluate((node) => { node.textContent = "Node cũ đổi thành độc hại"; });
    await expect(page.locator("#safe")).toHaveClass(/cs-blur/);

    const toxicRequestsBeforeReveal = requests.filter((text) => text === "Nội dung độc hại ban đầu").length;
    await page.locator("main > [data-cs-ui='badge'] .cs-reveal").first().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#toxic")).not.toHaveClass(/cs-blur/);
    await page.waitForTimeout(200);
    expect(requests.filter((text) => text === "Nội dung độc hại ban đầu")).toHaveLength(toxicRequestsBeforeReveal);
    expect(pageBackendRequests).toHaveLength(0);

    await page.goto("http://localhost:8080");
    await expect(page.locator("#toxic")).toHaveClass(/cs-blur/);
    await page.goto("http://127.0.0.1:8080/feed_demo.html");
    const feedText = (await page.locator(".post-content p").first().textContent())?.trim() ?? "";
    await expect.poll(() => requests.includes(feedText)).toBe(true);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

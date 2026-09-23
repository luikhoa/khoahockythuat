import { test, expect, chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Exercises the actual bundled content script without requiring model artifacts.
test("offline bundled lookup blurs and reveals without inference", async () => {
  const profile = await mkdtemp(path.join(tmpdir(), "cs-lookup-"));
  const browser = await chromium.launchPersistentContext(profile, { headless: true, channel: "chromium" });
  try {
    const page = await browser.newPage();
    const external: string[] = [];
    await page.route("**/*", route => { external.push(route.request().url()); return route.abort(); });
    await page.setContent("<p id='hard'>ĐỤ MÁ</p><p id='variant'>n...g...u</p>");
    await page.addScriptTag({ path: path.resolve("dist/content.js") });
    await expect(page.locator("#hard")).toHaveClass(/cs-blur/);
    await expect(page.locator("#variant")).toHaveClass(/cs-blur/);
    await page.locator("#hard").click();
    await expect(page.locator("#hard")).not.toHaveClass(/cs-blur/);
    expect(external).toEqual([]);
  } finally {
    await browser.close();
    await rm(profile, { recursive: true, force: true });
  }
});

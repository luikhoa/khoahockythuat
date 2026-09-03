// build.js — Đóng gói các entry point content script + popup bằng esbuild,
// và sao chép popup.html/styles.css (không qua build, chỉ copy nguyên) vào
// dist/ để cùng nằm cạnh popup.js đã build.
// Không cần Tailwind/PostCSS — CSS trong dự án này luôn viết tay (xem plan.md).
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const OUT_DIR = path.join(__dirname, "dist");

esbuild
  .build({
    entryPoints: {
      content: "src/content/content.ts",
      popup: "src/popup/popup.ts",
    },
    bundle: true,
    outdir: "dist",
    format: "iife",
    target: "es2020",
    sourcemap: true,
    logLevel: "info",
  })
  .then(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.copyFileSync(path.join(__dirname, "src/popup/popup.html"), path.join(OUT_DIR, "popup.html"));
    fs.copyFileSync(path.join(__dirname, "src/popup/styles.css"), path.join(OUT_DIR, "styles.css"));
    console.log("  dist/popup.html      (copied)");
    console.log("  dist/styles.css      (copied)");
  })
  .catch(() => process.exit(1));

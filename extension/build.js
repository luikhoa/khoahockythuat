// build.js — Đóng gói các entry point content script + popup + background bằng esbuild,
// và sao chép popup.html/styles.css (không qua build, chỉ copy nguyên) vào
// dist/ để cùng nằm cạnh popup.js đã build.
// Không cần Tailwind/PostCSS — CSS trong dự án này luôn viết tay (xem plan.md).
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const OUT_DIR = path.join(__dirname, "dist");

esbuild
  .build({
    entryPoints: {
      content: "src/content/content.ts",
      popup: "src/popup/popup.ts",
      background: "src/background.ts",
      "inference-worker": "src/inference/worker.ts",
      offscreen: "src/offscreen/offscreen.ts",
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
    fs.copyFileSync(path.join(__dirname, "src/offscreen/offscreen.html"), path.join(OUT_DIR, "offscreen.html"));
    copyInferenceAssets();
    console.log("  dist/popup.html      (copied)");
    console.log("  dist/styles.css      (copied)");
    console.log("  dist/offscreen.html  (copied)");
  })
  .catch(() => process.exit(1));

function copyInferenceAssets() {
  const modelDir = path.join(__dirname, "model");
  const outputModelDir = path.join(OUT_DIR, "model");
  fs.rmSync(outputModelDir, { recursive: true, force: true });
  if (process.env.CS_SKIP_MODEL !== "1") {
    validateModelArtifact(modelDir);
    fs.cpSync(modelDir, outputModelDir, { recursive: true });
    console.log("  dist/model           (validated and copied)");
  }

  const ortDist = path.join(__dirname, "node_modules/onnxruntime-web/dist");
  const wasmDir = path.join(OUT_DIR, "wasm");
  const wasmFiles = [
    "ort-wasm-simd-threaded.mjs",
    "ort-wasm-simd-threaded.wasm",
    "ort-wasm-simd-threaded.jsep.mjs",
    "ort-wasm-simd-threaded.jsep.wasm",
  ];
  fs.rmSync(wasmDir, { recursive: true, force: true });
  fs.mkdirSync(wasmDir, { recursive: true });
  for (const filename of wasmFiles) {
    fs.copyFileSync(path.join(ortDist, filename), path.join(wasmDir, filename));
  }
  console.log("  dist/wasm            (copied WebGPU/WASM runtime files)");
}

function validateModelArtifact(modelDir) {
  const metadataPath = path.join(modelDir, "metadata.json");
  if (!fs.existsSync(metadataPath)) {
    throw new Error(
      "Missing extension/model/metadata.json. Export the model or use CS_SKIP_MODEL=1 for a development-only build.",
    );
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const required = ["model.onnx", "tokenizer.json", "tokenizer_config.json", "config.json"];
  for (const filename of required) {
    const filePath = path.join(modelDir, filename);
    if (!fs.existsSync(filePath)) throw new Error(`Missing extension/model/${filename}`);
    const expected = metadata.files?.[filename];
    if (typeof expected !== "string") throw new Error(`Missing checksum for ${filename}`);
    const actual = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
    if (actual !== expected) throw new Error(`Checksum mismatch for extension/model/${filename}`);
  }
}

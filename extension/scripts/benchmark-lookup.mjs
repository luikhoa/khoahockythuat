import { build } from "esbuild";
import { performance } from "node:perf_hooks";

const bundle = await build({ entryPoints: ["src/lookup/matcher.ts"], bundle: true, write: false, platform: "node", format: "esm" });
const { matchLookup, lookupSchema } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const corpus = ["địt", "tao sẽ địt mẹ mày", "ĐỤ MÁ!", "n...g...u", "f*ck", "tao giết mày", "giết", "chim", "Xin chào bạn", "class cacophony admire", "Bài học tiếng Việt hôm nay rất thú vị.", "a".repeat(1200)];
for (let i = 0; i < 10000; i++) matchLookup(corpus[i % corpus.length]);
const latencies = [];
let hits = 0;
for (let i = 0; i < 60000; i++) {
  const text = corpus[i % corpus.length];
  const start = performance.now();
  const match = matchLookup(text);
  latencies.push(performance.now() - start);
  if (match) hits++;
}
const mean = latencies.reduce((sum, ms) => sum + ms, 0) / latencies.length;
latencies.sort((a, b) => a - b);
console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch,
  counts: Object.fromEntries(Object.entries(lookupSchema).filter(([, value]) => Array.isArray(value)).map(([key, value]) => [key, value.length])),
  samples: latencies.length, warmup: 10000, corpusSize: corpus.length, meanMs: mean,
  p95Ms: latencies[Math.floor(latencies.length * 0.95)], hardMatches: hits,
  expectedModelCallsAvoidedInScanner: hits,
  note: "Synthetic mixed corpus, lookup only, not model throughput or representative prevalence."
}, null, 2));

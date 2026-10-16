import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { createCanvas } from "@napi-rs/canvas";

import type { RankProfileCardInput } from "../rank-profile/rankProfile.types.js";
import { RankSvgAssetCache } from "../rank-profile/experiments/rankSvgAssetCache.js";
import { RenderWorkerPool } from "../rank-profile/RenderWorkerPool.js";

const OUT_DIR = join(process.cwd(), "tmp", "rank-svg-experiment");

// Deterministic representative payload with Platinum emblem as current rank
export const benchmarkPayload: RankProfileCardInput = {
  identity: {
    displayName: "Platinum Hero",
    subtitle: "Focus session champion",
  },
  summary: { achievements: 48, goals: 25, milestones: 12 },
  activity: { days: [180, 240, 150, 320, 210, 290, 110] },
  leaderboard: {
    rank: 42,
    percentile: 5,
    nearbyRanks: [75, 88, 100, 82, 60],
    currentIndex: 2,
  },
  hours: {
    monthlyMinutes: 24500,
    weeklyMinutes: 5800,
    dailyMinutes: 520,
    allTimeMinutes: 145000,
  },
  rankTransition: {
    current: { name: "Platinum", icon: "platinum" }, // 60px header emblem, 48px transition emblem
    next: { name: "Diamond", icon: "diamond" },       // 48px transition next emblem (PNG fallback)
    progress: 0.65,
  },
  timeBreakdown: {
    camMinutes: 5800,
    nonCamMinutes: 1800,
    overallMinutes: 7600,
    camPercent: 76.3,
    nonCamPercent: 23.7,
  },
  badgeContext: {
    achievements: 48,
    goals: 25,
    milestones: 12,
    isHallOfFame: true,
    isWinner: true,
  },
};

interface TimingStats {
  count: number;
  totalMs: number;
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

function calculateTimingStats(durations: number[]): TimingStats {
  const sorted = [...durations].sort((a, b) => a - b);
  const count = sorted.length;
  const totalMs = sorted.reduce((sum, v) => sum + v, 0);
  const avgMs = totalMs / count;
  const medianMs = sorted[Math.floor(count / 2)];
  const p95Ms = sorted[Math.floor(count * 0.95)];
  const minMs = sorted[0];
  const maxMs = sorted[count - 1];

  return {
    count,
    totalMs: Number(totalMs.toFixed(2)),
    avgMs: Number(avgMs.toFixed(2)),
    medianMs: Number(medianMs.toFixed(2)),
    p95Ms: Number(p95Ms.toFixed(2)),
    minMs: Number(minMs.toFixed(2)),
    maxMs: Number(maxMs.toFixed(2)),
  };
}

async function runBenchmark() {
  const WORKER_COUNT = Number(
    process.env.BENCHMARK_WORKER_THREADS ??
      process.env.RENDER_WORKER_THREADS ??
      1,
  );

  console.log("================================================================================");
  console.log(`   BENCHMARK: CONFIG A (Scale 2 + SVG) vs CONFIG B (Scale 1 + SVG) [${WORKER_COUNT} THREADS]`);
  console.log("================================================================================\n");

  await mkdir(OUT_DIR, { recursive: true });

  const svgCache = new RankSvgAssetCache();
  const svgExists = svgCache.hasSvgAsset("platinum");

  console.log(`Checking SVG asset:`);
  console.log(`  Path: ${svgCache.getSvgPath("platinum")}`);
  console.log(`  Found genuine SVG: ${svgExists ? "YES (Verified)" : "NO (Missing!)"}`);

  if (!svgExists) {
    console.error(
      "\n[ERROR] Genuine Platinum SVG asset not found at src/assets/ranks/platinum.svg",
    );
    process.exit(1);
  }

  // Pre-rasterize and warm up SVG cache so SVG conversion DOES NOT run during the timed renders
  console.log("\n[1/4] Pre-rasterizing & warming SVG asset cache...");
  const tWarmStart = performance.now();
  // Warm up for Scale 1 (multiplier 2: 120px and 96px) and Scale 2 (multiplier 4: 240px and 192px)
  await svgCache.warmUp("platinum", [60, 48], 2);
  await svgCache.warmUp("platinum", [60, 48], 4);
  const warmUpDurationMs = performance.now() - tWarmStart;
  const initialCacheStats = svgCache.getStats();

  console.log(`  Cache warm-up finished in: ${warmUpDurationMs.toFixed(2)} ms`);
  console.log(`  Pre-cached items: ${initialCacheStats.cachedItems.join(", ")}`);

  console.log(
    `\nInitializing RenderWorkerPool with ${WORKER_COUNT} concurrent worker threads...`,
  );
  const pool = new RenderWorkerPool(WORKER_COUNT);

  // Warm-up renders across worker threads
  console.log(`\n[2/4] Running warm-up renders across ${WORKER_COUNT} worker threads...`);
  const warmUpPromises: Promise<unknown>[] = [];
  for (let i = 0; i < WORKER_COUNT * 2; i++) {
    warmUpPromises.push(pool.render(benchmarkPayload, { config: "A" }));
    warmUpPromises.push(pool.render(benchmarkPayload, { config: "B" }));
  }
  await Promise.all(warmUpPromises);
  console.log("  Warm-up completed.");

  // Timed workload: 100 identical images for each configuration
  const TOTAL_RENDERS = 100;
  console.log(
    `\n[3/4] Running 100 renders per configuration across ${WORKER_COUNT} worker threads...`,
  );

  const durationsA: number[] = [];
  const durationsB: number[] = [];

  let sampleBufferA: Buffer | null = null;
  let sampleBufferB: Buffer | null = null;
  let peakRssBytes = process.memoryUsage().rss;

  // Render Configuration A (Scale 2 + SVG)
  console.log(
    `  Rendering Configuration A (Scale 2 + SVG, 100 images, concurrency: ${WORKER_COUNT})...`,
  );
  const tWallStartA = performance.now();
  const cpuStartA = process.cpuUsage();

  const promisesA = Array.from({ length: TOTAL_RENDERS }, async () => {
    const t0 = performance.now();
    const res = await pool.render(benchmarkPayload, { config: "A" });
    const d = performance.now() - t0;
    durationsA.push(d);
    if (!sampleBufferA) sampleBufferA = Buffer.from(res.buffer);
    const rss = process.memoryUsage().rss;
    if (rss > peakRssBytes) peakRssBytes = rss;
    return res;
  });

  await Promise.all(promisesA);
  const wallElapsedA = performance.now() - tWallStartA;
  const cpuElapsedA = process.cpuUsage(cpuStartA);
  const cpuMsA = (cpuElapsedA.user + cpuElapsedA.system) / 1000;
  const throughputA = Number((TOTAL_RENDERS / (wallElapsedA / 1000)).toFixed(1));
  console.log(
    `    Finished Config A in ${wallElapsedA.toFixed(1)} ms (${throughputA} renders/sec across ${WORKER_COUNT} threads)`,
  );

  // Render Configuration B (Scale 1 + SVG at 2x)
  console.log(
    `  Rendering Configuration B (Scale 1 + SVG at 2x, 100 images, concurrency: ${WORKER_COUNT})...`,
  );
  const tWallStartB = performance.now();
  const cpuStartB = process.cpuUsage();

  const promisesB = Array.from({ length: TOTAL_RENDERS }, async () => {
    const t0 = performance.now();
    const res = await pool.render(benchmarkPayload, { config: "B" });
    const d = performance.now() - t0;
    durationsB.push(d);
    if (!sampleBufferB) sampleBufferB = Buffer.from(res.buffer);
    const rss = process.memoryUsage().rss;
    if (rss > peakRssBytes) peakRssBytes = rss;
    return res;
  });

  await Promise.all(promisesB);
  const wallElapsedB = performance.now() - tWallStartB;
  const cpuElapsedB = process.cpuUsage(cpuStartB);
  const cpuMsB = (cpuElapsedB.user + cpuElapsedB.system) / 1000;
  const throughputB = Number((TOTAL_RENDERS / (wallElapsedB / 1000)).toFixed(1));
  console.log(
    `    Finished Config B in ${wallElapsedB.toFixed(1)} ms (${throughputB} renders/sec across ${WORKER_COUNT} threads)`,
  );

  await pool.close();

  const statsA = calculateTimingStats(durationsA);
  const statsB = calculateTimingStats(durationsB);
  const cacheStats = svgCache.getStats();

  const sizeA = sampleBufferA!.length;
  const sizeB = sampleBufferB!.length;

  console.log("\n[4/4] Generating visual comparison artifacts...");

  const pathA = join(OUT_DIR, "config-a-scale2-svg.png");
  const pathB = join(OUT_DIR, "config-b-scale1-svg.png");
  const pathANormalized = join(OUT_DIR, "config-a-normalized.png");
  const pathComparison = join(OUT_DIR, "comparison-a-vs-b.png");
  const pathHeaderCrop = join(OUT_DIR, "crop-header-a-vs-b.png");
  const pathTransitionCrop = join(OUT_DIR, "crop-transition-a-vs-b.png");
  const pathDiffMap = join(OUT_DIR, "diff-map-a-vs-b.png");
  const pathJson = join(OUT_DIR, "benchmark-results.json");

  // Save native images
  await writeFile(pathA, sampleBufferA!);
  await writeFile(pathB, sampleBufferB!);

  // Normalize Config A (2400x1520) down to 1200x760 for direct comparison
  const normalizedBufferA = await sharp(sampleBufferA!)
    .resize(1200, 760, { fit: "fill" })
    .png()
    .toBuffer();
  await writeFile(pathANormalized, normalizedBufferA);

  // 1. Side-by-side 2-panel comparison
  const bannerCanvas = createCanvas(2400, 60);
  const bCtx = bannerCanvas.getContext("2d");
  bCtx.fillStyle = "#1E1A2B";
  bCtx.fillRect(0, 0, 2400, 60);
  bCtx.fillStyle = "#FFFFFF";
  bCtx.font = "bold 20px sans-serif";
  bCtx.fillText("CONFIGURATION A: Scale 2 Canvas + Cached SVG (2400x1520 -> 1200x760)", 40, 38);
  bCtx.fillText("CONFIGURATION B: Scale 1 Canvas + Cached 2x SVG (Native 1200x760)", 1240, 38);

  await sharp({
    create: {
      width: 2400,
      height: 820,
      channels: 4,
      background: { r: 30, g: 26, b: 43, alpha: 1 },
    },
  })
    .composite([
      { input: bannerCanvas.toBuffer("image/png"), left: 0, top: 0 },
      { input: normalizedBufferA, left: 0, top: 60 },
      { input: sampleBufferB!, left: 1200, top: 60 },
    ])
    .png()
    .toFile(pathComparison);

  // 2. 6x Enlarged Diagnostic Crop: Header emblem (60px)
  const headerCropA = await sharp(normalizedBufferA)
    .extract({ left: 395, top: 55, width: 85, height: 85 })
    .resize(510, 510, { kernel: "nearest" })
    .png()
    .toBuffer();

  const headerCropB = await sharp(sampleBufferB!)
    .extract({ left: 395, top: 55, width: 85, height: 85 })
    .resize(510, 510, { kernel: "nearest" })
    .png()
    .toBuffer();

  const headerBanner = createCanvas(1040, 50);
  const hbCtx = headerBanner.getContext("2d");
  hbCtx.fillStyle = "#1E1A2B";
  hbCtx.fillRect(0, 0, 1040, 50);
  hbCtx.fillStyle = "#FFFFFF";
  hbCtx.font = "bold 16px sans-serif";
  hbCtx.fillText("Header Emblem: Config A (Scale 2 + SVG, 6x Nearest-Neighbor)", 20, 32);
  hbCtx.fillText("Header Emblem: Config B (Scale 1 + 2x SVG, 6x Nearest-Neighbor)", 540, 32);

  await sharp({
    create: {
      width: 1040,
      height: 570,
      channels: 4,
      background: { r: 30, g: 26, b: 43, alpha: 1 },
    },
  })
    .composite([
      { input: headerBanner.toBuffer("image/png"), left: 0, top: 0 },
      { input: headerCropA, left: 10, top: 50 },
      { input: headerCropB, left: 530, top: 50 },
    ])
    .png()
    .toFile(pathHeaderCrop);

  // 3. 6x Enlarged Diagnostic Crop: Transition emblem (48px)
  const transCropA = await sharp(normalizedBufferA)
    .extract({ left: 440, top: 464, width: 68, height: 68 })
    .resize(476, 476, { kernel: "nearest" })
    .png()
    .toBuffer();

  const transCropB = await sharp(sampleBufferB!)
    .extract({ left: 440, top: 464, width: 68, height: 68 })
    .resize(476, 476, { kernel: "nearest" })
    .png()
    .toBuffer();

  const transBanner = createCanvas(972, 50);
  const tbCtx = transBanner.getContext("2d");
  tbCtx.fillStyle = "#1E1A2B";
  tbCtx.fillRect(0, 0, 972, 50);
  tbCtx.fillStyle = "#FFFFFF";
  tbCtx.font = "bold 16px sans-serif";
  tbCtx.fillText("Transition Emblem: Config A (Scale 2 + SVG, 7x Crop)", 20, 32);
  tbCtx.fillText("Transition Emblem: Config B (Scale 1 + 2x SVG, 7x Crop)", 506, 32);

  await sharp({
    create: {
      width: 972,
      height: 536,
      channels: 4,
      background: { r: 30, g: 26, b: 43, alpha: 1 },
    },
  })
    .composite([
      { input: transBanner.toBuffer("image/png"), left: 0, top: 0 },
      { input: transCropA, left: 10, top: 50 },
      { input: transCropB, left: 496, top: 50 },
    ])
    .png()
    .toFile(pathTransitionCrop);

  // 4. Pixel Difference Analysis
  const rawA = await sharp(normalizedBufferA).raw().toBuffer();
  const rawB = await sharp(sampleBufferB!).raw().toBuffer();

  let diffPixels = 0;
  let sumSquaredError = 0;
  const totalPixels = 1200 * 760;
  const diffBuffer = Buffer.alloc(totalPixels * 4);

  for (let i = 0; i < rawA.length; i += 4) {
    const dr = Math.abs(rawA[i] - rawB[i]);
    const dg = Math.abs(rawA[i + 1] - rawB[i + 1]);
    const db = Math.abs(rawA[i + 2] - rawB[i + 2]);
    const da = Math.abs(rawA[i + 3] - rawB[i + 3]);

    const pixelDiff = dr + dg + db + da;
    sumSquaredError += (dr * dr + dg * dg + db * db) / 3;

    if (pixelDiff > 12) {
      diffPixels++;
      diffBuffer[i] = 255;
      diffBuffer[i + 1] = 0;
      diffBuffer[i + 2] = 128;
      diffBuffer[i + 3] = 255;
    } else {
      const gray = Math.round(((rawB[i] + rawB[i + 1] + rawB[i + 2]) / 3) * 0.3);
      diffBuffer[i] = gray;
      diffBuffer[i + 1] = gray;
      diffBuffer[i + 2] = gray;
      diffBuffer[i + 3] = 255;
    }
  }

  const mse = sumSquaredError / totalPixels;
  const psnr = mse === 0 ? 99 : Number((10 * Math.log10((255 * 255) / mse)).toFixed(2));
  const diffPercent = Number(((diffPixels / totalPixels) * 100).toFixed(2));

  await sharp(diffBuffer, { raw: { width: 1200, height: 760, channels: 4 } })
    .png()
    .toFile(pathDiffMap);

  // Results JSON Export
  const resultsData = {
    metadata: {
      timestamp: new Date().toISOString(),
      workloadRenders: TOTAL_RENDERS,
      workerThreads: WORKER_COUNT,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    },
    svgCache: {
      warmUpDurationMs: Number(warmUpDurationMs.toFixed(2)),
      cachedItems: cacheStats.cachedItems,
      totalHits: cacheStats.hits,
      totalMisses: cacheStats.misses,
    },
    configurationA: {
      name: "Configuration A (Scale 2, SVG Cached)",
      canvasDimensions: "2400 x 1520",
      totalPixels: 2400 * 1520,
      pngOutputBytes: sizeA,
      pngOutputKB: Number((sizeA / 1024).toFixed(1)),
      timing: statsA,
      wallClockElapsedMs: Number(wallElapsedA.toFixed(2)),
      throughputRps: throughputA,
      totalCpuMs: Number(cpuMsA.toFixed(2)),
      avgCpuPerRenderMs: Number((cpuMsA / TOTAL_RENDERS).toFixed(2)),
    },
    configurationB: {
      name: "Configuration B (Scale 1, SVG Cached at 2x)",
      canvasDimensions: "1200 x 760",
      totalPixels: 1200 * 760,
      pngOutputBytes: sizeB,
      pngOutputKB: Number((sizeB / 1024).toFixed(1)),
      timing: statsB,
      wallClockElapsedMs: Number(wallElapsedB.toFixed(2)),
      throughputRps: throughputB,
      totalCpuMs: Number(cpuMsB.toFixed(2)),
      avgCpuPerRenderMs: Number((cpuMsB / TOTAL_RENDERS).toFixed(2)),
    },
    comparison: {
      workerThreads: WORKER_COUNT,
      pixelReductionPercent: 75.0,
      renderSpeedupFactor: Number((statsA.avgMs / statsB.avgMs).toFixed(2)),
      renderTimeReductionPercent: Number(
        (((statsA.avgMs - statsB.avgMs) / statsA.avgMs) * 100).toFixed(1),
      ),
      wallClockSpeedupFactor: Number((wallElapsedA / wallElapsedB).toFixed(2)),
      wallClockReductionPercent: Number(
        (((wallElapsedA - wallElapsedB) / wallElapsedA) * 100).toFixed(1),
      ),
      throughputIncreasePercent: Number(
        (((throughputB - throughputA) / throughputA) * 100).toFixed(1),
      ),
      cpuReductionPercent: Number((((cpuMsA - cpuMsB) / cpuMsA) * 100).toFixed(1)),
      fileSizeReductionPercent: Number((((sizeA - sizeB) / sizeA) * 100).toFixed(1)),
      peakRssMB: Number((peakRssBytes / (1024 * 1024)).toFixed(1)),
      visualDiff: {
        totalPixels,
        differingPixels: diffPixels,
        differingPercent: diffPercent,
        meanSquaredError: Number(mse.toFixed(2)),
        psnrDb: psnr,
      },
    },
    artifacts: {
      configANative: pathA,
      configBNative: pathB,
      configANormalized: pathANormalized,
      comparisonSideBySide: pathComparison,
      cropHeaderComparison: pathHeaderCrop,
      cropTransitionComparison: pathTransitionCrop,
      diffMap: pathDiffMap,
      benchmarkResultsJson: pathJson,
    },
  };

  await writeFile(pathJson, JSON.stringify(resultsData, null, 2));

  // Console Summary
  console.log("\n======================================================================================================");
  console.log(`   BENCHMARK RESULTS: CONFIG A vs CONFIG B (100 RENDERS EACH, ${WORKER_COUNT} WORKER THREADS)`);
  console.log("======================================================================================================");
  console.log("METRIC                       CONFIG A (Scale 2 + SVG)    CONFIG B (Scale 1 + 2x SVG) DELTA (B vs A)");
  console.log("------------------------------------------------------------------------------------------------------");
  console.log(`Worker Threads               ${WORKER_COUNT} threads active              ${WORKER_COUNT} threads active              Parallel execution`);
  console.log(`Canvas Resolution            2400 x 1520                 1200 x 760                  -75.0% pixels`);
  console.log(`Total Canvas Pixels          3,648,000 pixels            912,000 pixels              -2,736,000 pixels`);
  console.log(
    `Output PNG File Size         ${(sizeA / 1024).toFixed(1)} KB                     ${(sizeB / 1024).toFixed(1)} KB                     -${resultsData.comparison.fileSizeReductionPercent}%`,
  );
  console.log(
    `Batch Wall-Clock Time        ${wallElapsedA.toFixed(1)} ms                 ${wallElapsedB.toFixed(1)} ms                 -${resultsData.comparison.wallClockReductionPercent}% (${resultsData.comparison.wallClockSpeedupFactor}x faster)`,
  );
  console.log(
    `Batch Throughput             ${throughputA} renders/sec             ${throughputB} renders/sec             +${resultsData.comparison.throughputIncreasePercent}% throughput`,
  );
  console.log(
    `Average Render Time (per img)${statsA.avgMs} ms                     ${statsB.avgMs} ms                     -${resultsData.comparison.renderTimeReductionPercent}% (${resultsData.comparison.renderSpeedupFactor}x faster)`,
  );
  console.log(
    `Median Render Time           ${statsA.medianMs} ms                     ${statsB.medianMs} ms                     -${(
      ((statsA.medianMs - statsB.medianMs) / statsA.medianMs) *
      100
    ).toFixed(1)}%`,
  );
  console.log(
    `p95 Render Time              ${statsA.p95Ms} ms                     ${statsB.p95Ms} ms                     -${(
      ((statsA.p95Ms - statsB.p95Ms) / statsA.p95Ms) *
      100
    ).toFixed(1)}%`,
  );
  console.log(
    `Min / Max Render Time        ${statsA.minMs} / ${statsA.maxMs} ms            ${statsB.minMs} / ${statsB.maxMs} ms`,
  );
  console.log(
    `Total CPU Time (100 renders) ${cpuMsA.toFixed(1)} ms                  ${cpuMsB.toFixed(1)} ms                  -${resultsData.comparison.cpuReductionPercent}% CPU work`,
  );
  console.log(
    `Avg CPU per Render           ${resultsData.configurationA.avgCpuPerRenderMs} ms                   ${resultsData.configurationB.avgCpuPerRenderMs} ms                   -${resultsData.comparison.cpuReductionPercent}%`,
  );
  console.log(`Peak RSS Memory              ${resultsData.comparison.peakRssMB} MB`);
  console.log(`Visual Pixel Variation       ${diffPercent}% differing pixels (MSE: ${mse.toFixed(2)}, PSNR: ${psnr} dB)`);
  console.log("======================================================================================================\n");
}

runBenchmark().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});

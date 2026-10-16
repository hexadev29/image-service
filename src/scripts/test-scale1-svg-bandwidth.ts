import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { RankProfileCardInput, RenderResult } from "../rank-profile/rankProfile.types.js";
import { RankSvgAssetCache } from "../rank-profile/experiments/rankSvgAssetCache.js";
import { RenderWorkerPool } from "../rank-profile/RenderWorkerPool.js";
import { sampleRankProfile } from "./rankProfile.sample.js";

const ARTIFACTS_DIR = join(process.cwd(), "artifacts");
const TOTAL_IMAGES = 100;

export const payload: RankProfileCardInput = {
  ...sampleRankProfile,
  rankTransition: {
    current: { name: "Platinum", icon: "platinum" },
    next: { name: "Diamond", icon: "diamond" },
    progress: 0.72,
  },
};

interface LatencyStats {
  count: number;
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  minMs: number;
  maxMs: number;
}

function calculateLatencyStats(durations: number[]): LatencyStats {
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
    avgMs: Number(avgMs.toFixed(2)),
    medianMs: Number(medianMs.toFixed(2)),
    p95Ms: Number(p95Ms.toFixed(2)),
    minMs: Number(minMs.toFixed(2)),
    maxMs: Number(maxMs.toFixed(2)),
  };
}

async function runBandwidthTest() {
  const WORKER_COUNT = Number(
    process.env.BENCHMARK_WORKER_THREADS ??
      process.env.RENDER_WORKER_THREADS ??
      1,
  );

  const mode = WORKER_COUNT === 1 ? "SINGLE-THREADED" : `${WORKER_COUNT} THREADS CONCURRENT`;

  console.log("================================================================================");
  console.log(`   BANDWIDTH & THROUGHPUT BENCHMARK: SCALE 1 + CACHED 2x SVG [${mode}]`);
  console.log(`   Workload: ${TOTAL_IMAGES} images | Mode: ${mode}`);
  console.log("================================================================================\n");

  await mkdir(ARTIFACTS_DIR, { recursive: true });

  const svgCache = new RankSvgAssetCache();
  await svgCache.warmUp("platinum", [60, 48], 2);

  console.log(`Initializing RenderWorkerPool with ${WORKER_COUNT} worker thread(s)...`);
  const pool = new RenderWorkerPool(WORKER_COUNT);

  // Warm-up renders
  console.log(`Running warm-up renders across ${WORKER_COUNT} worker thread(s)...`);
  const warmUps: Promise<unknown>[] = [];
  for (let i = 0; i < Math.max(2, WORKER_COUNT * 2); i++) {
    warmUps.push(pool.render(payload, { config: "B" }));
  }
  await Promise.all(warmUps);
  console.log("Warm-up complete.\n");

  console.log(
    `Starting 100-image workload on Scale 1 (1200x760) with Cached 2x SVG (${mode})...`,
  );

  const durations: number[] = [];
  const bufferSizes: number[] = [];
  let peakRss = process.memoryUsage().rss;
  let sampleResult: RenderResult | null = null;

  const tWallStart = performance.now();
  const cpuStart = process.cpuUsage();

  if (WORKER_COUNT === 1) {
    // Pure single-threaded sequential workload
    for (let i = 0; i < TOTAL_IMAGES; i++) {
      const t0 = performance.now();
      const result = await pool.render(payload, { config: "B" });
      const elapsed = performance.now() - t0;

      durations.push(elapsed);
      bufferSizes.push(result.buffer.length);

      const curRss = process.memoryUsage().rss;
      if (curRss > peakRss) peakRss = curRss;

      if (!sampleResult) sampleResult = result;
    }
  } else {
    // Multi-threaded concurrent workload
    const renderPromises = Array.from({ length: TOTAL_IMAGES }, async () => {
      const t0 = performance.now();
      const result = await pool.render(payload, { config: "B" });
      const elapsed = performance.now() - t0;

      durations.push(elapsed);
      bufferSizes.push(result.buffer.length);

      const curRss = process.memoryUsage().rss;
      if (curRss > peakRss) peakRss = curRss;

      if (!sampleResult) sampleResult = result;
      return result;
    });
    await Promise.all(renderPromises);
  }

  const wallElapsedMs = performance.now() - tWallStart;
  const cpuElapsed = process.cpuUsage(cpuStart);
  const totalCpuMs = (cpuElapsed.user + cpuElapsed.system) / 1000;

  await pool.close();

  // Bandwidth & Payload calculations
  const totalBytes = bufferSizes.reduce((sum, b) => sum + b, 0);
  const totalKB = totalBytes / 1024;
  const totalMB = totalKB / 1024;
  const avgBytesPerImage = totalBytes / TOTAL_IMAGES;
  const avgKBPerImage = avgBytesPerImage / 1024;

  const wallSec = wallElapsedMs / 1000;
  const throughputRps = Number((TOTAL_IMAGES / wallSec).toFixed(1));
  const throughputMBps = Number((totalMB / wallSec).toFixed(2));
  const throughputMbps = Number(((totalBytes * 8) / (1_000_000 * wallSec)).toFixed(2));

  // Scale 2 Baseline comparison metrics for reference
  const approxScale2BytesPerImage = 205.6 * 1024; // ~205.6 KB for Scale 2
  const approxScale2TotalMB = (approxScale2BytesPerImage * TOTAL_IMAGES) / (1024 * 1024);
  const bandwidthSavedMB = approxScale2TotalMB - totalMB;
  const bandwidthSavedPercent = Number(
    (((approxScale2TotalMB - totalMB) / approxScale2TotalMB) * 100).toFixed(1),
  );

  const latency = calculateLatencyStats(durations);

  // Save representative output artifact
  if (sampleResult) {
    await writeFile(
      join(ARTIFACTS_DIR, "scale1-svg-bandwidth-sample.png"),
      Buffer.from((sampleResult as RenderResult).buffer),
    );
  }

  // Export results JSON
  const reportData = {
    timestamp: new Date().toISOString(),
    configuration: "Scale 1 Canvas (1200x760) + Cached 2x Platinum SVG",
    mode,
    totalImages: TOTAL_IMAGES,
    workerThreads: WORKER_COUNT,
    bandwidth: {
      totalBytes,
      totalKB: Number(totalKB.toFixed(2)),
      totalMB: Number(totalMB.toFixed(2)),
      avgImageKB: Number(avgKBPerImage.toFixed(2)),
      bandwidthRateMBps: throughputMBps,
      bandwidthRateMbps: throughputMbps,
      scale2Comparison: {
        scale2EstimatedTotalMB: Number(approxScale2TotalMB.toFixed(2)),
        savedBandwidthMB: Number(bandwidthSavedMB.toFixed(2)),
        savedBandwidthPercent: bandwidthSavedPercent,
      },
    },
    performance: {
      wallClockElapsedMs: Number(wallElapsedMs.toFixed(2)),
      throughputRps,
      totalCpuMs: Number(totalCpuMs.toFixed(2)),
      avgCpuPerRenderMs: Number((totalCpuMs / TOTAL_IMAGES).toFixed(2)),
      peakRssMB: Number((peakRss / (1024 * 1024)).toFixed(1)),
      latency,
    },
  };

  const resultsJsonPath = join(ARTIFACTS_DIR, "bandwidth-scale1-results.json");
  await writeFile(resultsJsonPath, JSON.stringify(reportData, null, 2));

  console.log("======================================================================================================");
  console.log(`   FINAL BANDWIDTH & THROUGHPUT REPORT (${TOTAL_IMAGES} IMAGES, ${mode})`);
  console.log("======================================================================================================");
  console.log("DATA VOLUME & BANDWIDTH:");
  console.log(`  - Total Data Generated:        ${totalMB.toFixed(2)} MB (${totalKB.toFixed(1)} KB) for ${TOTAL_IMAGES} images`);
  console.log(`  - Average Image Payload Size:  ${avgKBPerImage.toFixed(1)} KB per PNG card`);
  console.log(`  - Data Generation Rate:        ${throughputMBps} MB/s (${throughputMbps} Mbps)`);
  console.log(`  - Bandwidth Saved vs Scale 2:  -${bandwidthSavedPercent}% (~${bandwidthSavedMB.toFixed(1)} MB saved per 100 images!)`);
  console.log("------------------------------------------------------------------------------------------------------");
  console.log("EXECUTION SPEED & THROUGHPUT:");
  console.log(`  - Execution Mode:              ${mode}`);
  console.log(`  - Total Batch Wall-Clock:      ${wallElapsedMs.toFixed(1)} ms (${wallSec.toFixed(2)} seconds)`);
  console.log(`  - Render Throughput:           ${throughputRps} images/second`);
  console.log(`  - Average Latency (per img):   ${latency.avgMs} ms`);
  console.log(`  - Median Latency:              ${latency.medianMs} ms`);
  console.log(`  - 95th Percentile Latency:     ${latency.p95Ms} ms`);
  console.log(`  - Min / Max Latency:           ${latency.minMs} ms / ${latency.maxMs} ms`);
  console.log("------------------------------------------------------------------------------------------------------");
  console.log("RESOURCE EFFICIENCY:");
  console.log(`  - Total CPU Time (100 imgs):   ${totalCpuMs.toFixed(1)} ms`);
  console.log(`  - CPU Work Per Image:          ${(totalCpuMs / TOTAL_IMAGES).toFixed(2)} ms`);
  console.log(`  - Peak RSS Memory:             ${(peakRss / (1024 * 1024)).toFixed(1)} MB`);
  console.log(`  - Output Artifact:             artifacts/scale1-svg-bandwidth-sample.png`);
  console.log(`  - Detailed JSON Report:        artifacts/bandwidth-scale1-results.json`);
  console.log("======================================================================================================\n");
}

runBandwidthTest().catch((err) => {
  console.error("Bandwidth test failed:", err);
  process.exit(1);
});

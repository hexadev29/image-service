import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { createCanvas } from "@napi-rs/canvas";

import type { RankProfileCardInput } from "../rank-profile/rankProfile.types.js";
import {
  RankSvgAssetCache,
  createBaselineRenderer,
  createExperimentalCandidateRenderer,
  createScale2SvgRenderer,
} from "../rank-profile/experiments/rankSvgAssetCache.js";

const ARTIFACTS_DIR = join(process.cwd(), "artifacts");

export const samplePayload: RankProfileCardInput = {
  identity: {
    displayName: "Platinum Hero",
    subtitle: "Focus. Compete. Improve.",
  },
  summary: { achievements: 32, goals: 18, milestones: 7 },
  activity: { days: [120, 210, 90, 300, 180, 240, 75] },
  leaderboard: {
    rank: 1,
    percentile: 1,
    nearbyRanks: [64, 82, 100, 72, 56],
    currentIndex: 2,
  },
  hours: {
    monthlyMinutes: 19260,
    weeklyMinutes: 4680,
    dailyMinutes: 491,
    allTimeMinutes: 116270,
  },
  rankTransition: {
    current: { name: "Platinum", icon: "platinum" },
    next: { name: "Diamond", icon: "diamond" },
    progress: 0.72,
  },
  timeBreakdown: {
    camMinutes: 4680,
    nonCamMinutes: 1440,
    overallMinutes: 6120,
    camPercent: 76.5,
    nonCamPercent: 23.5,
  },
  badgeContext: {
    achievements: 32,
    goals: 18,
    milestones: 7,
    isHallOfFame: true,
    isWinner: true,
  },
};

export async function generateComparisonSamples() {
  await mkdir(ARTIFACTS_DIR, { recursive: true });

  const svgCache = new RankSvgAssetCache();
  await svgCache.warmUp("platinum", [60, 48], 2);
  await svgCache.warmUp("platinum", [60, 48], 4);

  const baselineRenderer = createBaselineRenderer(); // Scale 2 PNG
  const scale2SvgRenderer = createScale2SvgRenderer(svgCache, 4); // Scale 2 SVG
  const scale1SvgRenderer = createExperimentalCandidateRenderer(svgCache); // Scale 1 SVG

  console.log("Generating sample comparison cards...");
  const t0 = performance.now();
  const [resScale2Png, resScale2Svg, resScale1Svg] = await Promise.all([
    baselineRenderer.render(samplePayload),
    scale2SvgRenderer.render(samplePayload),
    scale1SvgRenderer.render(samplePayload),
  ]);
  console.log(`Rendered cards in ${(performance.now() - t0).toFixed(1)} ms.`);

  const bufScale2Png = Buffer.from(resScale2Png.buffer);
  const bufScale2Svg = Buffer.from(resScale2Svg.buffer);
  const bufScale1Svg = Buffer.from(resScale1Svg.buffer);

  // 1. Save standard quickstart artifact & native individual variant outputs
  await writeFile(join(ARTIFACTS_DIR, "rank-profile-sample.png"), bufScale2Png);
  await writeFile(join(ARTIFACTS_DIR, "sample-scale2-png.png"), bufScale2Png);
  await writeFile(join(ARTIFACTS_DIR, "sample-scale2-svg.png"), bufScale2Svg);
  await writeFile(join(ARTIFACTS_DIR, "sample-scale1-svg.png"), bufScale1Svg);

  // 2. Generate normalized buffers for side-by-side display
  const normScale2Png = await sharp(bufScale2Png).resize(1200, 760).png().toBuffer();
  const normScale2Svg = await sharp(bufScale2Svg).resize(1200, 760).png().toBuffer();
  const normScale1Svg = bufScale1Svg; // already 1200x760

  // 3. Side-by-side 3-panel comparison
  const bannerCanvas = createCanvas(3600, 60);
  const bCtx = bannerCanvas.getContext("2d");
  bCtx.fillStyle = "#1E1A2B";
  bCtx.fillRect(0, 0, 3600, 60);
  bCtx.fillStyle = "#FFFFFF";
  bCtx.font = "bold 20px sans-serif";
  bCtx.fillText("1. BASELINE: Scale 2 Canvas + PNG Assets (2400x1520)", 40, 38);
  bCtx.fillText("2. CANDIDATE: Scale 2 Canvas + Genuine SVG (2400x1520)", 1240, 38);
  bCtx.fillText("3. CANDIDATE: Scale 1 Canvas + Genuine SVG (1200x760)", 2440, 38);

  await sharp({
    create: {
      width: 3600,
      height: 820,
      channels: 4,
      background: { r: 30, g: 26, b: 43, alpha: 1 },
    },
  })
    .composite([
      { input: bannerCanvas.toBuffer("image/png"), left: 0, top: 0 },
      { input: normScale2Png, left: 0, top: 60 },
      { input: normScale2Svg, left: 1200, top: 60 },
      { input: normScale1Svg, left: 2400, top: 60 },
    ])
    .png()
    .toFile(join(ARTIFACTS_DIR, "sample-comparison-side-by-side.png"));

  // 4. Diagnostic Crops: Enlarged 6x crops of header emblem
  // Header icon is at: left: 395, top: 55, width: 85, height: 85 (in 1200x760)
  const cropP2 = await sharp(normScale2Png)
    .extract({ left: 395, top: 55, width: 85, height: 85 })
    .resize(480, 480, { kernel: "nearest" })
    .png()
    .toBuffer();

  const cropS2 = await sharp(normScale2Svg)
    .extract({ left: 395, top: 55, width: 85, height: 85 })
    .resize(480, 480, { kernel: "nearest" })
    .png()
    .toBuffer();

  const cropS1 = await sharp(normScale1Svg)
    .extract({ left: 395, top: 55, width: 85, height: 85 })
    .resize(480, 480, { kernel: "nearest" })
    .png()
    .toBuffer();

  const cropBanner = createCanvas(1480, 50);
  const cbCtx = cropBanner.getContext("2d");
  cbCtx.fillStyle = "#1E1A2B";
  cbCtx.fillRect(0, 0, 1480, 50);
  cbCtx.fillStyle = "#FFFFFF";
  cbCtx.font = "bold 16px sans-serif";
  cbCtx.fillText("Scale 2 PNG (6x Enlarged)", 20, 32);
  cbCtx.fillText("Scale 2 SVG (6x Enlarged)", 520, 32);
  cbCtx.fillText("Scale 1 SVG (6x Enlarged)", 1020, 32);

  await sharp({
    create: {
      width: 1480,
      height: 540,
      channels: 4,
      background: { r: 30, g: 26, b: 43, alpha: 1 },
    },
  })
    .composite([
      { input: cropBanner.toBuffer("image/png"), left: 0, top: 0 },
      { input: cropP2, left: 10, top: 50 },
      { input: cropS2, left: 500, top: 50 },
      { input: cropS1, left: 990, top: 50 },
    ])
    .png()
    .toFile(join(ARTIFACTS_DIR, "sample-crops-comparison.png"));

  console.log("\nArtifacts successfully written to artifacts/:");
  console.log("  - artifacts/sample-scale2-png.png              (Native Scale 2 PNG, 2400x1520)");
  console.log("  - artifacts/sample-scale2-svg.png              (Native Scale 2 SVG, 2400x1520)");
  console.log("  - artifacts/sample-scale1-svg.png              (Native Scale 1 SVG, 1200x760)");
  console.log("  - artifacts/sample-comparison-side-by-side.png (3-panel side-by-side card)");
  console.log("  - artifacts/sample-crops-comparison.png        (6x enlarged diagnostic emblem crops)");
  console.log("  - artifacts/rank-profile-sample.png            (Standard quickstart sample)");
}

import { fileURLToPath } from "node:url";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generateComparisonSamples().catch((err) => {
    console.error("Failed to generate comparison samples:", err);
    process.exit(1);
  });
}


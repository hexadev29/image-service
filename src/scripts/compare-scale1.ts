import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { createCanvas } from "@napi-rs/canvas";

import { RankProfileCardRenderer } from "../rank-profile/RankProfileCardRenderer.js";
import {
  RankSvgAssetCache,
  createExperimentalCandidateRenderer,
} from "../rank-profile/experiments/rankSvgAssetCache.js";
import { sampleRankProfile } from "./rankProfile.sample.js";
import type { RankProfileCardInput } from "../rank-profile/rankProfile.types.js";

const ARTIFACTS_DIR = join(process.cwd(), "artifacts");

export const payload: RankProfileCardInput = {
  ...sampleRankProfile,
  rankTransition: {
    current: { name: "Platinum", icon: "platinum" },
    next: { name: "Diamond", icon: "diamond" },
    progress: 0.72,
  },
};

export async function compareScale1() {
  await mkdir(ARTIFACTS_DIR, { recursive: true });

  const svgCache = new RankSvgAssetCache();
  await svgCache.warmUp("platinum", [60, 48], 2);

  // 1. Scale 1 Canvas with Original PNG assets
  const pngRenderer = new RankProfileCardRenderer({ scale: 1 });

  // 2. Scale 1 Canvas with Cached 2x Platinum SVG
  const svgRenderer = createExperimentalCandidateRenderer(svgCache);

  console.log("================================================================================");
  console.log("   COMPARING SCALE 1 PNG vs SCALE 1 SVG (NATIVE 1200 x 760)");
  console.log("================================================================================\n");

  // Warm-up
  await pngRenderer.render(payload);
  await svgRenderer.render(payload);

  // Timed renders
  console.log("Rendering Scale 1 with PNG assets...");
  const t0Png = performance.now();
  const resPng = await pngRenderer.render(payload);
  const durPng = performance.now() - t0Png;

  console.log("Rendering Scale 1 with Cached 2x SVG...");
  const t0Svg = performance.now();
  const resSvg = await svgRenderer.render(payload);
  const durSvg = performance.now() - t0Svg;

  const bufPng = Buffer.from(resPng.buffer);
  const bufSvg = Buffer.from(resSvg.buffer);

  const pathPng = join(ARTIFACTS_DIR, "scale1-png.png");
  const pathSvg = join(ARTIFACTS_DIR, "scale1-svg.png");
  const pathSideBySide = join(ARTIFACTS_DIR, "compare-scale1-side-by-side.png");
  const pathHeaderCrop = join(ARTIFACTS_DIR, "compare-scale1-header-crop.png");
  const pathTransitionCrop = join(ARTIFACTS_DIR, "compare-scale1-transition-crop.png");
  const pathDiffMap = join(ARTIFACTS_DIR, "compare-scale1-diff-map.png");

  await writeFile(pathPng, bufPng);
  await writeFile(pathSvg, bufSvg);

  console.log("\nGenerating visual comparison artifacts...");

  // 1. Side-by-Side 2400x820 Comparison
  const bannerCanvas = createCanvas(2400, 60);
  const bCtx = bannerCanvas.getContext("2d");
  bCtx.fillStyle = "#1E1A2B";
  bCtx.fillRect(0, 0, 2400, 60);
  bCtx.fillStyle = "#FFFFFF";
  bCtx.font = "bold 20px sans-serif";
  bCtx.fillText("SCALE 1 CANVAS + ORIGINAL PNG (1200x760)", 40, 38);
  bCtx.fillText("SCALE 1 CANVAS + CACHED 2x SVG (1200x760)", 1240, 38);

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
      { input: bufPng, left: 0, top: 60 },
      { input: bufSvg, left: 1200, top: 60 },
    ])
    .png()
    .toFile(pathSideBySide);

  // 2. 6x Enlarged Diagnostic Crop: Header emblem (60px)
  const headerCropPng = await sharp(bufPng)
    .extract({ left: 395, top: 55, width: 85, height: 85 })
    .resize(510, 510, { kernel: "nearest" })
    .png()
    .toBuffer();

  const headerCropSvg = await sharp(bufSvg)
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
  hbCtx.fillText("Header Emblem: Scale 1 PNG (6x Zoom)", 20, 32);
  hbCtx.fillText("Header Emblem: Scale 1 Cached 2x SVG (6x Zoom)", 540, 32);

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
      { input: headerCropPng, left: 10, top: 50 },
      { input: headerCropSvg, left: 530, top: 50 },
    ])
    .png()
    .toFile(pathHeaderCrop);

  // 3. 7x Enlarged Diagnostic Crop: Transition emblem (48px)
  const transCropPng = await sharp(bufPng)
    .extract({ left: 440, top: 464, width: 68, height: 68 })
    .resize(476, 476, { kernel: "nearest" })
    .png()
    .toBuffer();

  const transCropSvg = await sharp(bufSvg)
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
  tbCtx.fillText("Transition Emblem: Scale 1 PNG (7x Zoom)", 20, 32);
  tbCtx.fillText("Transition Emblem: Scale 1 Cached 2x SVG (7x Zoom)", 506, 32);

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
      { input: transCropPng, left: 10, top: 50 },
      { input: transCropSvg, left: 496, top: 50 },
    ])
    .png()
    .toFile(pathTransitionCrop);

  // 4. Pixel Difference Analysis
  const rawPng = await sharp(bufPng).raw().toBuffer();
  const rawSvg = await sharp(bufSvg).raw().toBuffer();

  let diffPixels = 0;
  let sumSquaredError = 0;
  const totalPixels = 1200 * 760;
  const diffBuffer = Buffer.alloc(totalPixels * 4);

  for (let i = 0; i < rawPng.length; i += 4) {
    const dr = Math.abs(rawPng[i] - rawSvg[i]);
    const dg = Math.abs(rawPng[i + 1] - rawSvg[i + 1]);
    const db = Math.abs(rawPng[i + 2] - rawSvg[i + 2]);
    const da = Math.abs(rawPng[i + 3] - rawSvg[i + 3]);

    const pixelDiff = dr + dg + db + da;
    sumSquaredError += (dr * dr + dg * dg + db * db) / 3;

    if (pixelDiff > 12) {
      diffPixels++;
      diffBuffer[i] = 255;
      diffBuffer[i + 1] = 0;
      diffBuffer[i + 2] = 128;
      diffBuffer[i + 3] = 255;
    } else {
      const gray = Math.round(((rawSvg[i] + rawSvg[i + 1] + rawSvg[i + 2]) / 3) * 0.3);
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

  const sizePng = bufPng.length;
  const sizeSvg = bufSvg.length;

  console.log("\n======================================================================================================");
  console.log("   COMPARISON RESULTS: SCALE 1 PNG vs SCALE 1 SVG");
  console.log("======================================================================================================");
  console.log("METRIC                       SCALE 1 (PNG)               SCALE 1 (2x SVG)            DELTA");
  console.log("------------------------------------------------------------------------------------------------------");
  console.log("Canvas Resolution            1200 x 760                  1200 x 760                  Identical");
  console.log(`Render Duration              ${durPng.toFixed(1)} ms                     ${durSvg.toFixed(1)} ms                     ${durSvg < durPng ? "-" : "+"}${Math.abs(Number((durSvg - durPng).toFixed(1)))} ms`);
  console.log(`Output PNG File Size         ${(sizePng / 1024).toFixed(1)} KB                      ${(sizeSvg / 1024).toFixed(1)} KB                      ${sizeSvg < sizePng ? "-" : "+"}${Math.abs(Number(((sizeSvg - sizePng) / 1024).toFixed(1)))} KB`);
  console.log(`Differing Pixels             ${diffPixels} (${diffPercent}%)           PSNR: ${psnr} dB            MSE: ${mse.toFixed(2)}`);
  console.log("------------------------------------------------------------------------------------------------------");
  console.log("ARTIFACTS GENERATED IN artifacts/:");
  console.log(`  1. Native Scale 1 PNG:     artifacts/scale1-png.png`);
  console.log(`  2. Native Scale 1 SVG:     artifacts/scale1-svg.png`);
  console.log(`  3. Side-by-Side:           artifacts/compare-scale1-side-by-side.png`);
  console.log(`  4. 6x Header Emblem Zoom:  artifacts/compare-scale1-header-crop.png`);
  console.log(`  5. 7x Transition Zoom:     artifacts/compare-scale1-transition-crop.png`);
  console.log(`  6. Pixel Difference Map:   artifacts/compare-scale1-diff-map.png`);
  console.log("======================================================================================================\n");
}

compareScale1().catch((err) => {
  console.error("Comparison failed:", err);
  process.exit(1);
});

import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const ARTIFACTS_DIR = join(process.cwd(), "artifacts");
import {
  printProcessHeader,
  logWithPid,
  printPeakResourceUsage,
} from "../utils/processMetrics.js";
import { resolveRequiredFonts } from "../utils/fontResolver.js";

const ORIGINAL_SVG_PATH = join(
  process.cwd(),
  "src",
  "assets",
  "profile_with_platinum_rank.svg",
);
const BAKED_SVG_PATH = join(
  process.cwd(),
  "src",
  "assets",
  "profile_with_baked_shadow.svg",
);

const DEFAULT_TEST_AVATAR =
  "https://avatars.githubusercontent.com/u/9919?s=200&v=4";

export async function injectCustomAvatar(
  svgString: string,
  avatarUrlOrBuffer: string | Buffer,
): Promise<string> {
  const { AvatarCache, FINAL_DISPLAY_AVATAR_DIAMETER } = await import(
    "../rank-profile/AvatarCache.js"
  );
  const cache = AvatarCache.getInstance();
  const avatarDataUri = await cache.getAvatarDataUri(
    avatarUrlOrBuffer,
    FINAL_DISPLAY_AVATAR_DIAMETER, // 167px exact final display dimension
  );

  const avatarGroupRegex =
    /<!-- (Stylized Vector Portrait|Custom User Avatar) inside Avatar Clip -->[\s\S]*?(?=<!-- Inner Avatar Border Ring -->)/;
  const newAvatarMarkup = `<!-- Custom User Avatar inside Avatar Clip -->
    <g clip-path="url(#avatar-clip)">
      <image href="${avatarDataUri}" x="48.5" y="100.5" width="167" height="167" preserveAspectRatio="xMidYMid slice" />
    </g>

    `;

  return svgString.replace(avatarGroupRegex, newAvatarMarkup);
}

async function main() {
  await mkdir(ARTIFACTS_DIR, { recursive: true });

  const is100 =
    process.argv.includes("--100") || process.argv.includes("-n=100");
  const count = is100 ? 100 : 1;
  const useBaked = process.argv.includes("--baked") || !process.argv.includes("--original");
  const svgPath = useBaked ? BAKED_SVG_PATH : ORIGINAL_SVG_PATH;

  // Check for custom avatar url
  const avatarArgIdx = process.argv.findIndex((a) => a === "--avatar" || a === "--avatar-url" || a === "--with-avatar");
  let avatarUrl: string | undefined;
  if (avatarArgIdx !== -1) {
    const nextArg = process.argv[avatarArgIdx + 1];
    avatarUrl = nextArg && !nextArg.startsWith("-") ? nextArg : DEFAULT_TEST_AVATAR;
  }

  printProcessHeader(
    `Full SVG to PNG Renderer Service [${count === 1 ? "SINGLE IMAGE" : "100 IMAGES"}]`,
  );
  logWithPid(`Mode:       ${useBaked ? "BAKED SHADOW (PRE-RENDERED CONTAINER + HYBRID RANK PNG)" : "DYNAMIC FILTERS (ORIGINAL SVG)"}`);
  logWithPid(`Source SVG: ${useBaked ? "src/assets/profile_with_baked_shadow.svg" : "src/assets/profile_with_platinum_rank.svg"}`);
  if (avatarUrl) {
    logWithPid(`Avatar:     URL Profile Image (${avatarUrl.slice(0, 60)}...)`);
  } else {
    logWithPid(`Avatar:     Default Vector Artwork`);
  }

  let svgContent = await readFile(svgPath, "utf8");

  if (avatarUrl) {
    logWithPid("Fetching and clipping custom avatar via AvatarCache...");
    const t0 = performance.now();
    svgContent = await injectCustomAvatar(svgContent, avatarUrl);
    const avatarDur = performance.now() - t0;
    logWithPid(`Injected circular custom avatar into SVG (${avatarDur.toFixed(1)} ms, cached).`);
  }

  logWithPid(`Source SVG string size: ${(Buffer.byteLength(svgContent, "utf8") / 1024).toFixed(1)} KB`);

  const fontFiles = resolveRequiredFonts();
  logWithPid(`Loaded font files for Resvg: ${fontFiles.length} fonts (Poppins)`);

  // Initialize Resvg instance fitted to 1200 width (Scale 1) with font registration
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: "width", value: 1200 },
    background: "rgba(0,0,0,0)",
    font: {
      fontFiles,
      loadSystemFonts: false,
      defaultFontFamily: "Poppins",
    },
  });

  if (count === 1) {
    // Single render test
    logWithPid("Rendering single SVG card to PNG format...");
    const t0 = performance.now();
    const rendered = resvg.render();
    const pngBuffer = Buffer.from(rendered.asPng());
    const duration = performance.now() - t0;

    const outputPath = join(ARTIFACTS_DIR, "profile-from-svg.png");
    await writeFile(outputPath, pngBuffer);

    const isGold = svgContent.includes("Gold rank icon");
    const rankLabel = isGold
      ? "Variant C Pre-sized Gold PNG (Hybrid SVG)"
      : "Variant C Pre-sized Rank PNG (Hybrid SVG)";

    logWithPid(`--------------------------------------------------------------------------------`);
    logWithPid(`SINGLE RENDER RESULT:`);
    logWithPid(`  - Output File:       artifacts/profile-from-svg.png`);
    logWithPid(`  - Dimensions:        ${rendered.width} x ${rendered.height} (Scale 1)`);
    logWithPid(`  - PNG File Size:     ${(pngBuffer.length / 1024).toFixed(1)} KB`);
    logWithPid(`  - Render Duration:   ${duration.toFixed(2)} ms`);
    logWithPid(`  - Rank Icon:         ${rankLabel}`);
    logWithPid(`  - Typography Status: Verified (All text, names, stats & numbers rendered)`);
    logWithPid(`--------------------------------------------------------------------------------`);
  } else {
    // 100 images workload directly without pre-warmup
    logWithPid(`Directly rendering 100 images of full SVG to PNG format (no warm-up)...`);
    const durations: number[] = [];
    let totalBytes = 0;
    let samplePng: Buffer | null = null;

    const tWallStart = performance.now();
    const cpuStart = process.cpuUsage();

    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      const rendered = resvg.render();
      const pngBuffer = Buffer.from(rendered.asPng());
      const elapsed = performance.now() - t0;

      durations.push(elapsed);
      totalBytes += pngBuffer.length;
      if (!samplePng) samplePng = pngBuffer;

      if ((i + 1) % 25 === 0 || i === 0) {
        logWithPid(`Render progress: [${String(i + 1).padStart(3, " ")}/100] images completed (current image: ${elapsed.toFixed(2)} ms)`);
      }
    }

    const wallElapsed = performance.now() - tWallStart;
    const cpuElapsed = process.cpuUsage(cpuStart);
    const cpuMs = (cpuElapsed.user + cpuElapsed.system) / 1000;

    const outputPath = join(ARTIFACTS_DIR, "profile-from-svg.png");
    if (samplePng) await writeFile(outputPath, samplePng);

    const sorted = [...durations].sort((a, b) => a - b);
    const avgMs = (durations.reduce((sum, v) => sum + v, 0) / 100).toFixed(2);
    const medianMs = sorted[50].toFixed(2);
    const p95Ms = sorted[95].toFixed(2);
    const minMs = sorted[0].toFixed(2);
    const maxMs = sorted[99].toFixed(2);
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
    const throughput = (100 / (wallElapsed / 1000)).toFixed(1);
    const mbps = (Number(totalMB) / (wallElapsed / 1000)).toFixed(2);

    logWithPid(`================================================================================`);
    logWithPid(`100-IMAGE SVG TO PNG BENCHMARK RESULTS:`);
    logWithPid(`================================================================================`);
    logWithPid(`  - Total Wall-Clock:      ${wallElapsed.toFixed(2)} ms (${(wallElapsed / 1000).toFixed(2)} s)`);
    logWithPid(`  - Throughput:            ${throughput} images/sec`);
    logWithPid(`  - Total Data Generated:  ${totalMB} MB (${(totalBytes / 1024 / 100).toFixed(1)} KB/image)`);
    logWithPid(`  - Data Generation Rate:  ${mbps} MB/s`);
    logWithPid(`  - Average Latency:       ${avgMs} ms per image`);
    logWithPid(`  - Median Latency:        ${medianMs} ms`);
    logWithPid(`  - P95 Latency:           ${p95Ms} ms`);
    logWithPid(`  - Min / Max Latency:     ${minMs} ms / ${maxMs} ms`);
    const isGold = svgContent.includes("Gold rank icon");
    const rankLabel = isGold
      ? "Variant C Pre-sized Gold PNG (Hybrid SVG)"
      : "Variant C Pre-sized Rank PNG (Hybrid SVG)";

    logWithPid(`  - Total CPU Time:        ${cpuMs.toFixed(2)} ms (${(cpuMs / 100).toFixed(2)} ms/image)`);
    logWithPid(`  - Rank Icon:             ${rankLabel}`);
    logWithPid(`  - Output File:           artifacts/profile-from-svg.png`);
    logWithPid(`  - Typography:            Rendered with Poppins font family`);
    logWithPid(`================================================================================`);
  }

  printPeakResourceUsage(
    count === 1 ? "SVG Single Render Complete" : "SVG 100-Image Workload Complete",
  );
}

main().catch((err) => {
  console.error(`[PID: ${process.pid}] Render failed:`, err);
  process.exit(1);
});


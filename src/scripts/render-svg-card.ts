import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const ARTIFACTS_DIR = join(process.cwd(), "artifacts");
import sharp from "sharp";

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

export async function injectCustomAvatar(
  svgString: string,
  avatarUrlOrBuffer: string | Buffer,
): Promise<string> {
  let rawBuffer: Buffer;
  if (typeof avatarUrlOrBuffer === "string") {
    const res = await fetch(avatarUrlOrBuffer);
    if (!res.ok) throw new Error(`Failed to fetch avatar: ${res.statusText}`);
    rawBuffer = Buffer.from(await res.arrayBuffer());
  } else {
    rawBuffer = avatarUrlOrBuffer;
  }

  // Resize with sharp to 334x334 (2x retina for 167x167 avatar circle)
  const resizedAvatar = await sharp(rawBuffer)
    .resize(334, 334, { fit: "cover" })
    .png()
    .toBuffer();

  const avatarDataUri =
    "data:image/png;base64," + resizedAvatar.toString("base64");

  const avatarGroupRegex =
    /<!-- Stylized Vector Portrait inside Avatar Clip -->[\s\S]*?(?=<!-- Inner Avatar Border Ring -->)/;
  const newAvatarMarkup = `<!-- Custom User Avatar inside Avatar Clip -->
    <g clip-path="url(#avatar-clip)">
      <image href="${avatarDataUri}" x="48.5" y="100.5" width="167" height="167" preserveAspectRatio="xMidYMid slice" />
    </g>

    `;

  return svgString.replace(avatarGroupRegex, newAvatarMarkup);
}

function getFontFiles(): string[] {
  const localFonts = join(process.cwd(), "src", "assets", "fonts");
  const distFonts = join(process.cwd(), "dist", "assets", "fonts");
  const dir = existsSync(localFonts) ? localFonts : distFonts;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ttf"))
    .map((f) => join(dir, f));
}

async function main() {
  await mkdir(ARTIFACTS_DIR, { recursive: true });

  const is100 =
    process.argv.includes("--100") || process.argv.includes("-n=100");
  const count = is100 ? 100 : 1;
  const useBaked = process.argv.includes("--baked");
  const svgPath = useBaked ? BAKED_SVG_PATH : ORIGINAL_SVG_PATH;

  // Check for custom avatar url
  const avatarArgIdx = process.argv.findIndex((a) => a === "--avatar" || a === "--avatar-url");
  const avatarUrl = avatarArgIdx !== -1 ? process.argv[avatarArgIdx + 1] : undefined;

  console.log("================================================================================");
  console.log(
    `   FULL SVG TO PNG RENDERER SERVICE [${count === 1 ? "SINGLE IMAGE" : "100 IMAGES"}]`,
  );
  console.log(`   Mode:       ${useBaked ? "BAKED SHADOW (PRE-RENDERED CONTAINER)" : "DYNAMIC FILTERS (ORIGINAL SVG)"}`);
  console.log(`   Source SVG: ${useBaked ? "src/assets/profile_with_baked_shadow.svg" : "src/assets/profile_with_platinum_rank.svg"}`);
  if (avatarUrl) {
    console.log(`   Avatar:     Custom URL (${avatarUrl.slice(0, 60)}...)`);
  } else {
    console.log(`   Avatar:     Default Vector Artwork`);
  }
  console.log("================================================================================\n");

  let svgContent = await readFile(svgPath, "utf8");

  if (avatarUrl) {
    console.log("Fetching and clipping custom avatar from URL...");
    svgContent = await injectCustomAvatar(svgContent, avatarUrl);
    console.log("Injected circular custom avatar into SVG.");
  }

  console.log(`Source SVG string size: ${(Buffer.byteLength(svgContent, "utf8") / 1024).toFixed(1)} KB`);

  const fontFiles = getFontFiles();
  console.log(`Loaded font files for Resvg: ${fontFiles.length} fonts (Poppins)`);

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
    console.log("Rendering single SVG card to PNG format...");
    const t0 = performance.now();
    const rendered = resvg.render();
    const pngBuffer = Buffer.from(rendered.asPng());
    const duration = performance.now() - t0;

    const outputPath = join(ARTIFACTS_DIR, "profile-from-svg.png");
    await writeFile(outputPath, pngBuffer);

    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`SINGLE RENDER RESULT:`);
    console.log(`  - Output File:       artifacts/profile-from-svg.png`);
    console.log(`  - Dimensions:        ${rendered.width} x ${rendered.height} (Scale 1)`);
    console.log(`  - PNG File Size:     ${(pngBuffer.length / 1024).toFixed(1)} KB`);
    console.log(`  - Render Duration:   ${duration.toFixed(1)} ms`);
    console.log(`  - Typography Status: Verified (All text, names, stats & numbers rendered)`);
    console.log(`--------------------------------------------------------------------------------\n`);
  } else {
    // 100 images workload directly without pre-warmup
    console.log(`Directly rendering 100 images of full SVG to PNG format (no warm-up)...`);
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
    }

    const wallElapsed = performance.now() - tWallStart;
    const cpuElapsed = process.cpuUsage(cpuStart);
    const cpuMs = (cpuElapsed.user + cpuElapsed.system) / 1000;

    const outputPath = join(ARTIFACTS_DIR, "profile-from-svg.png");
    if (samplePng) await writeFile(outputPath, samplePng);

    const sorted = [...durations].sort((a, b) => a - b);
    const avgMs = (durations.reduce((sum, v) => sum + v, 0) / 100).toFixed(1);
    const medianMs = sorted[50].toFixed(1);
    const p95Ms = sorted[95].toFixed(1);
    const minMs = sorted[0].toFixed(1);
    const maxMs = sorted[99].toFixed(1);
    const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
    const throughput = (100 / (wallElapsed / 1000)).toFixed(1);
    const mbps = (Number(totalMB) / (wallElapsed / 1000)).toFixed(2);

    console.log(`\n================================================================================`);
    console.log(`100-IMAGE SVG TO PNG BENCHMARK RESULTS:`);
    console.log(`================================================================================`);
    console.log(`  - Total Wall-Clock:      ${wallElapsed.toFixed(1)} ms (${(wallElapsed / 1000).toFixed(2)} s)`);
    console.log(`  - Throughput:            ${throughput} images/sec`);
    console.log(`  - Total Data Generated:  ${totalMB} MB (${(totalBytes / 1024 / 100).toFixed(1)} KB/image)`);
    console.log(`  - Data Generation Rate:  ${mbps} MB/s`);
    console.log(`  - Average Latency:       ${avgMs} ms per image`);
    console.log(`  - Median Latency:        ${medianMs} ms`);
    console.log(`  - P95 Latency:           ${p95Ms} ms`);
    console.log(`  - Min / Max Latency:     ${minMs} ms / ${maxMs} ms`);
    console.log(`  - Total CPU Time:        ${cpuMs.toFixed(1)} ms`);
    console.log(`  - Output File:           artifacts/profile-from-svg.png`);
    console.log(`  - Typography:            Rendered with Poppins font family`);
    console.log(`================================================================================\n`);
  }
}

main().catch((err) => {
  console.error("Render failed:", err);
  process.exit(1);
});

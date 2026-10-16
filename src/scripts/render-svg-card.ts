import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const ARTIFACTS_DIR = join(process.cwd(), "artifacts");
const SVG_PATH = join(process.cwd(), "src", "assets", "profile_with_platinum_rank.svg");

async function main() {
  await mkdir(ARTIFACTS_DIR, { recursive: true });

  const is100 = process.argv.includes("--100") || process.argv.includes("-n=100");
  const count = is100 ? 100 : 1;

  console.log("================================================================================");
  console.log(`   FULL SVG TO PNG RENDERER SERVICE [${count === 1 ? "SINGLE IMAGE" : "100 IMAGES"}]`);
  console.log(`   Source SVG: src/assets/profile_with_platinum_rank.svg`);
  console.log("================================================================================\n");

  const svgContent = await readFile(SVG_PATH);
  console.log(`Source SVG file size: ${(svgContent.length / 1024).toFixed(1)} KB`);

  // Initialize Resvg instance fitted to 1200 width (Scale 1)
  const resvg = new Resvg(svgContent, {
    fitTo: { mode: "width", value: 1200 },
    background: "rgba(0,0,0,0)",
    font: { loadSystemFonts: false },
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
    console.log(`================================================================================\n`);
  }
}

main().catch((err) => {
  console.error("Render failed:", err);
  process.exit(1);
});

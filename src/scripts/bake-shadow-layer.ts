import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

const ASSETS_DIR = join(process.cwd(), "src", "assets");
const SOURCE_SVG = join(ASSETS_DIR, "profile_with_platinum_rank.svg");
const BAKED_PNG_OUTPUT = join(ASSETS_DIR, "card-background-baked.png");
const BAKED_SVG_OUTPUT = join(ASSETS_DIR, "profile_with_baked_shadow.svg");

export async function generateBakedAssets(): Promise<{
  pngSize: number;
  svgSize: number;
  base64Uri: string;
}> {
  // 1. Define the static container background with outer card and 4 panels
  const containerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 835" width="1200" height="835">
  <defs>
    <!-- Main Outer Card Drop Shadow -->
    <filter id="card-shadow" x="-3%" y="-3%" width="106%" height="108%" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#0B1528" flood-opacity="0.08" />
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#0B1528" flood-opacity="0.04" />
    </filter>

    <!-- Subtle Inner Panel Shadow -->
    <filter id="panel-shadow" x="-4%" y="-4%" width="108%" height="112%">
      <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#0F2942" flood-opacity="0.03" />
    </filter>
  </defs>

  <!-- Main Outer White Card -->
  <rect x="20" y="30" width="1160" height="772" rx="36" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#card-shadow)" />

  <!-- Top Right Card 1: Summary Counters Container -->
  <g transform="translate(644, 62)">
    <rect x="0" y="0" width="516" height="104" rx="16" fill="#FFFFFF" stroke="#E9EEF5" stroke-width="1.5" filter="url(#panel-shadow)" />
  </g>

  <!-- Top Right Card 2: Last 7 Days Chart Container -->
  <g transform="translate(644, 176)">
    <rect x="0" y="0" width="516" height="158" rx="16" fill="#FFFFFF" stroke="#E9EEF5" stroke-width="1.5" filter="url(#panel-shadow)" />
  </g>

  <!-- Bottom Left: Leaderboard Card Container -->
  <g transform="translate(41, 347)">
    <rect x="0" y="0" width="205" height="422" rx="16" fill="#FFFFFF" stroke="#E9EEF5" stroke-width="1.5" filter="url(#panel-shadow)" />
  </g>

  <!-- Bottom Right: Hours Overview Card Container -->
  <g transform="translate(269, 347)">
    <rect x="0" y="0" width="891" height="422" rx="16" fill="#FFFFFF" stroke="#E9EEF5" stroke-width="1.5" filter="url(#panel-shadow)" />
  </g>
</svg>`;

  // Render the static container layer once with Resvg
  const bakeResvg = new Resvg(containerSvg, {
    fitTo: { mode: "width", value: 1200 },
    background: "rgba(0,0,0,0)",
  });
  const bakedPngBuffer = Buffer.from(bakeResvg.render().asPng());
  await writeFile(BAKED_PNG_OUTPUT, bakedPngBuffer);

  const base64Uri = `data:image/png;base64,${bakedPngBuffer.toString("base64")}`;

  // Read original full SVG
  let fullSvg = await readFile(SOURCE_SVG, "utf8");

  // 1. Replace the outer card rect with the pre-rendered baked background image
  fullSvg = fullSvg.replace(
    '<rect x="20" y="30" width="1160" height="772" rx="36" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="1" filter="url(#card-shadow)" />',
    `<!-- Pre-rendered Baked Container Layer (Outer card + 4 panels with shadows) -->\n    <image href="${base64Uri}" x="0" y="0" width="1200" height="835" />`,
  );

  // 2. Remove the 4 inner panel rects that are now included in the baked background image
  fullSvg = fullSvg.replace(
    '      <rect x="0" y="0" width="516" height="104" rx="16" fill="#FFFFFF" stroke="#E9EEF5" stroke-width="1.5" filter="url(#panel-shadow)" />\n',
    "",
  );
  fullSvg = fullSvg.replace(
    '      <rect x="0" y="0" width="516" height="158" rx="16" fill="#FFFFFF" stroke="#E9EEF5" stroke-width="1.5" filter="url(#panel-shadow)" />\n',
    "",
  );
  fullSvg = fullSvg.replace(
    '      <rect x="0" y="0" width="205" height="422" rx="16" fill="#FFFFFF" stroke="#E9EEF5" stroke-width="1.5" filter="url(#panel-shadow)" />\n',
    "",
  );
  fullSvg = fullSvg.replace(
    '      <rect x="0" y="0" width="891" height="422" rx="16" fill="#FFFFFF" stroke="#E9EEF5" stroke-width="1.5" filter="url(#panel-shadow)" />\n',
    "",
  );

  // 3. Remove the filter definitions since they are no longer dynamically computed
  fullSvg = fullSvg.replace(
    /    <!-- Main Outer Card Drop Shadow -->[\s\S]*?<\/filter>\n\n/g,
    "",
  );
  fullSvg = fullSvg.replace(
    /    <!-- Subtle Inner Panel Shadow -->[\s\S]*?<\/filter>\n\n/g,
    "",
  );

  await writeFile(BAKED_SVG_OUTPUT, fullSvg, "utf8");

  return {
    pngSize: bakedPngBuffer.length,
    svgSize: Buffer.byteLength(fullSvg, "utf8"),
    base64Uri,
  };
}

if (process.argv[1]?.endsWith("bake-shadow-layer.ts")) {
  generateBakedAssets()
    .then(({ pngSize, svgSize }) => {
      console.log("Successfully generated baked shadow assets:");
      console.log(`  - PNG: ${BAKED_PNG_OUTPUT} (${(pngSize / 1024).toFixed(1)} KB)`);
      console.log(`  - SVG: ${BAKED_SVG_OUTPUT} (${(svgSize / 1024).toFixed(1)} KB)`);
    })
    .catch((err) => {
      console.error("Failed to generate baked assets:", err);
      process.exit(1);
    });
}

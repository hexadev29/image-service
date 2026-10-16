import { mkdir, writeFile } from "node:fs/promises";
import {
  RankSvgAssetCache,
  createScale2SvgRenderer,
} from "../rank-profile/experiments/rankSvgAssetCache.js";
import { sampleRankProfile } from "./rankProfile.sample.js";
import type { RankProfileCardInput } from "../rank-profile/rankProfile.types.js";

const payload: RankProfileCardInput = {
  ...sampleRankProfile,
  rankTransition: {
    current: { name: "Platinum", icon: "platinum" },
    next: { name: "Diamond", icon: "diamond" },
    progress: 0.72,
  },
};

await mkdir("artifacts", { recursive: true });

const svgCache = new RankSvgAssetCache();
const renderer = createScale2SvgRenderer(svgCache, 4);

const start = performance.now();
const result = await renderer.render(payload);
const duration = (performance.now() - start).toFixed(1);

const outputPath = "artifacts/rank-profile-sample.png";
await writeFile(outputPath, Buffer.from(result.buffer));

console.log(`Rendered Scale 2 SVG sample card in ${duration} ms.`);
console.log(`Saved to: ${outputPath} (${(result.buffer.length / 1024).toFixed(1)} KB, 2400x1520)`);

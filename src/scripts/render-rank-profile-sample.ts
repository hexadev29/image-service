import { mkdir, writeFile } from "node:fs/promises";
import {
  RankSvgAssetCache,
  createExperimentalCandidateRenderer,
} from "../rank-profile/experiments/rankSvgAssetCache.js";
import { sampleRankProfile } from "./rankProfile.sample.js";
import type { RankProfileCardInput } from "../rank-profile/rankProfile.types.js";
import {
  printProcessHeader,
  logWithPid,
  printPeakResourceUsage,
} from "../utils/processMetrics.js";

printProcessHeader("Render Rank Profile Sample");

const payload: RankProfileCardInput = {
  ...sampleRankProfile,
  rankTransition: {
    current: { name: "Platinum", icon: "platinum" },
    next: { name: "Diamond", icon: "diamond" },
    progress: 0.72,
  },
};

await mkdir("artifacts", { recursive: true });

logWithPid("Initializing RankSvgAssetCache (platinum 60px/48px @ 2x)...");
const svgCache = new RankSvgAssetCache();
await svgCache.warmUp("platinum", [60, 48], 2);

const renderer = createExperimentalCandidateRenderer(svgCache);

const start = performance.now();
const result = await renderer.render(payload);
const duration = (performance.now() - start).toFixed(1);

const outputPath = "artifacts/rank-profile-sample.png";
const scale1Path = "artifacts/rank-profile-scale1-sample.png";
await writeFile(outputPath, Buffer.from(result.buffer));
await writeFile(scale1Path, Buffer.from(result.buffer));

logWithPid(`Rendered Scale 1 with Cached 2x SVG sample card in ${duration} ms.`);
logWithPid(
  `Saved to: ${outputPath} (${(result.buffer.length / 1024).toFixed(1)} KB, 1200x760)`,
);
logWithPid(`Also saved to: ${scale1Path}`);

printPeakResourceUsage("Sample Render Complete");

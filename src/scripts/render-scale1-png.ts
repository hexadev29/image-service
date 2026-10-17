import { mkdir, writeFile } from "node:fs/promises";
import { RankProfileCardRenderer } from "../rank-profile/RankProfileCardRenderer.js";
import { sampleRankProfile } from "./rankProfile.sample.js";
import type { RankProfileCardInput } from "../rank-profile/rankProfile.types.js";
import {
  printProcessHeader,
  logWithPid,
  printPeakResourceUsage,
} from "../utils/processMetrics.js";

printProcessHeader("Render Scale 1 Card (PNG Baseline)");

const payload: RankProfileCardInput = {
  ...sampleRankProfile,
  rankTransition: {
    current: { name: "Platinum", icon: "platinum" },
    next: { name: "Diamond", icon: "diamond" },
    progress: 0.72,
  },
};

await mkdir("artifacts", { recursive: true });

// Scale 1 Canvas with standard PNG rank assets
const renderer = new RankProfileCardRenderer({ scale: 1 });

const start = performance.now();
const result = await renderer.render(payload);
const duration = (performance.now() - start).toFixed(1);

const outputPath = "artifacts/scale1-png.png";
await writeFile(outputPath, Buffer.from(result.buffer));

logWithPid(`Rendered Scale 1 with PNG assets in ${duration} ms.`);
logWithPid(
  `Saved to: ${outputPath} (${(result.buffer.length / 1024).toFixed(1)} KB, 1200x760)`,
);

printPeakResourceUsage("Scale 1 PNG Render Complete");

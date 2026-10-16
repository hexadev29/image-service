import { mkdir, writeFile } from "node:fs/promises";
import { RankProfileCardRenderer } from "../rank-profile/RankProfileCardRenderer.js";
import { sampleRankProfile } from "./rankProfile.sample.js";
await mkdir("artifacts", { recursive: true });
const r = await new RankProfileCardRenderer().render(sampleRankProfile);
await writeFile("artifacts/rank-profile-sample.png", r.buffer);

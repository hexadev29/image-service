import axios from "axios";
import { sampleRankProfile } from "./src/scripts/rankProfile.sample";

const CONCURRENT = readPositiveInt(process.env.CONCURRENT, 5);
const BATCHES = readPositiveInt(process.env.BATCHES, 1);
const URL =
  process.env.RENDER_URL ?? "http://localhost:9000/v1/rank-profile/render";

const start = performance.now();

let success = 0;
let failed = 0;

for (let batch = 0; batch < BATCHES; batch += 1) {
  const results = await Promise.allSettled(
    Array.from({ length: CONCURRENT }, () =>
      axios.post(URL, sampleRankProfile, {
        responseType: "arraybuffer",
        timeout: 30_000,
      }),
    ),
  );

  success += results.filter((r) => r.status === "fulfilled").length;
  failed +=
    results.length - results.filter((r) => r.status === "fulfilled").length;
}

const end = performance.now();
const totalRequests = CONCURRENT * BATCHES;

console.log({
  url: URL,
  concurrent: CONCURRENT,
  batches: BATCHES,
  totalRequests,
  success,
  failed,
  totalMs: Math.round(end - start),
  avgMs: Math.round((end - start) / totalRequests),
  requestsPerSecond: Number(
    (totalRequests / ((end - start) / 1000)).toFixed(2),
  ),
});

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;

  return parsed;
}

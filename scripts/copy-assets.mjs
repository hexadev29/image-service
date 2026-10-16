import { cp, mkdir } from "node:fs/promises";

await mkdir("dist/assets", { recursive: true });
await cp("src/assets", "dist/assets", { recursive: true });

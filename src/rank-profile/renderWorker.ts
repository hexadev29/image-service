import { parentPort } from "node:worker_threads";

import { RankProfileCardRenderer } from "./RankProfileCardRenderer.js";
import type { RankProfileCardInput } from "./rankProfile.types.js";

const renderer = new RankProfileCardRenderer();

if (!parentPort) {
  throw new Error("renderWorker must run inside a Worker thread");
}

parentPort.on(
  "message",
  async (message: { id: number; input: RankProfileCardInput }) => {
    try {
      const result = await renderer.render(message.input);
      parentPort?.postMessage({ id: message.id, ok: true, result });
    } catch (error) {
      parentPort?.postMessage({
        id: message.id,
        ok: false,
        error: serializeError(error),
      });
    }
  },
);

function serializeError(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  return {
    message: error.message,
    name: error.name,
    stack: error.stack,
    issues: "issues" in error ? error.issues : undefined,
  };
}

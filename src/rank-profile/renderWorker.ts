import { parentPort } from "node:worker_threads";

import { RankProfileCardRenderer } from "./RankProfileCardRenderer.js";
import type { RankProfileCardInput } from "./rankProfile.types.js";

export interface RenderWorkerOptions {
  config?: "A" | "B";
  scale?: number;
  useSvg?: boolean;
}

export interface RenderWorkerIncomingMessage {
  id: number;
  input: RankProfileCardInput;
  options?: RenderWorkerOptions;
}

const defaultRenderer = new RankProfileCardRenderer();
let svgCacheInstance: any = null;
let scale2SvgRenderer: RankProfileCardRenderer | null = null;
let scale1SvgRenderer: RankProfileCardRenderer | null = null;
const customScaleRenderers = new Map<number, RankProfileCardRenderer>();

async function getRenderer(
  options?: RenderWorkerOptions,
): Promise<RankProfileCardRenderer> {
  if (!options || (!options.config && !options.useSvg && !options.scale)) {
    return defaultRenderer;
  }

  // Configuration A: Scale 2 Canvas + Cached SVG
  if (options.config === "A" || (options.useSvg && options.scale === 2)) {
    if (!scale2SvgRenderer) {
      const exp = await import("./experiments/rankSvgAssetCache.js");
      if (!svgCacheInstance) {
        svgCacheInstance = new exp.RankSvgAssetCache();
      }
      await svgCacheInstance.warmUp("platinum", [60, 48], 4);
      scale2SvgRenderer = exp.createScale2SvgRenderer(svgCacheInstance, 4);
    }
    return scale2SvgRenderer;
  }

  // Configuration B: Scale 1 Canvas + Cached 2x SVG
  if (options.config === "B" || (options.useSvg && options.scale === 1)) {
    if (!scale1SvgRenderer) {
      const exp = await import("./experiments/rankSvgAssetCache.js");
      if (!svgCacheInstance) {
        svgCacheInstance = new exp.RankSvgAssetCache();
      }
      await svgCacheInstance.warmUp("platinum", [60, 48], 2);
      scale1SvgRenderer = exp.createExperimentalCandidateRenderer(
        svgCacheInstance,
      );
    }
    return scale1SvgRenderer;
  }

  // Custom scale fallback
  if (options.scale && options.scale !== 2) {
    let r = customScaleRenderers.get(options.scale);
    if (!r) {
      r = new RankProfileCardRenderer({ scale: options.scale });
      customScaleRenderers.set(options.scale, r);
    }
    return r;
  }

  return defaultRenderer;
}

if (!parentPort) {
  throw new Error("renderWorker must run inside a Worker thread");
}

parentPort.on(
  "message",
  async (message: RenderWorkerIncomingMessage) => {
    try {
      const activeRenderer = await getRenderer(message.options);
      const result = await activeRenderer.render(message.input);
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

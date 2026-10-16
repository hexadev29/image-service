import { Resvg } from "@resvg/resvg-js";
import { loadImage } from "@napi-rs/canvas";
import type { Image } from "@napi-rs/canvas";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RankProfileCardRenderer,
  type RankIconLoader,
} from "../RankProfileCardRenderer.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function resolveRanksDir(): string {
  const relativePath = join(__dirname, "..", "..", "assets", "ranks");
  if (existsSync(relativePath)) return relativePath;
  const cwdSrc = join(process.cwd(), "src", "assets", "ranks");
  if (existsSync(cwdSrc)) return cwdSrc;
  const cwdDist = join(process.cwd(), "dist", "assets", "ranks");
  if (existsSync(cwdDist)) return cwdDist;
  return relativePath;
}

export interface SvgAssetCacheStats {
  hits: number;
  misses: number;
  totalRasterizationTimeMs: number;
  cachedItems: string[];
}

/**
 * Isolated SVG asset manager and rasterization cache for experimental rendering.
 *
 * Requirements:
 * 1. Reads local trusted SVG files only (no external network I/O).
 * 2. Rasterizes SVGs using Resvg while preserving transparency and aspect ratio.
 * 3. Decodes into @napi-rs/canvas compatible Image objects.
 * 4. Caches by asset name and rasterization dimensions.
 * 5. Fails clearly when an SVG asset is absent or invalid.
 */
export class RankSvgAssetCache {
  private readonly ranksDir: string;
  private readonly imageCache = new Map<string, Image>();
  private hits = 0;
  private misses = 0;
  private totalRasterizationTimeMs = 0;

  constructor(ranksDir?: string) {
    this.ranksDir = ranksDir ?? resolveRanksDir();
  }

  /**
   * Returns the filesystem path for the specified rank's SVG file.
   */
  public getSvgPath(icon: string): string {
    const normalized = icon.replace(/^rank-/, "");
    return join(this.ranksDir, `${normalized}.svg`);
  }

  /**
   * Checks whether the SVG file exists on disk.
   */
  public hasSvgAsset(icon: string): boolean {
    return existsSync(this.getSvgPath(icon));
  }

  /**
   * Retrieves or rasterizes an SVG rank icon for the given logical size and pixel multiplier.
   *
   * For Scale 1 with 2x local rasterization:
   *   logicalSize = 60, pixelMultiplier = 2 => target width = 120px.
   */
  public async getRankSvgImage(
    icon: string,
    logicalSize: number,
    pixelMultiplier = 2,
  ): Promise<Image> {
    const normalized = icon.replace(/^rank-/, "");
    const targetPixelSize = Math.round(logicalSize * pixelMultiplier);
    const cacheKey = `${normalized}:${targetPixelSize}`;

    const cached = this.imageCache.get(cacheKey);
    if (cached) {
      this.hits += 1;
      return cached;
    }

    this.misses += 1;
    const svgPath = this.getSvgPath(normalized);

    if (!existsSync(svgPath)) {
      throw new Error(
        `[RankSvgAssetCache] Missing genuine SVG asset for rank "${normalized}" at: ${svgPath}`,
      );
    }

    const tStart = performance.now();
    let svgContent: Buffer;
    try {
      svgContent = readFileSync(svgPath);
    } catch (err: any) {
      throw new Error(
        `[RankSvgAssetCache] Failed to read SVG asset at ${svgPath}: ${err?.message ?? err}`,
      );
    }

    let pngBuffer: Buffer;
    try {
      const resvg = new Resvg(svgContent, {
        fitTo: {
          mode: "width",
          value: targetPixelSize,
        },
        background: "rgba(0,0,0,0)", // Preserve full alpha transparency
        font: {
          loadSystemFonts: false, // Security: never query untrusted host system fonts
        },
      });
      const rendered = resvg.render();
      pngBuffer = Buffer.from(rendered.asPng());
    } catch (err: any) {
      throw new Error(
        `[RankSvgAssetCache] Resvg failed to rasterize SVG asset at ${svgPath}: ${err?.message ?? err}`,
      );
    }

    let img: Image;
    try {
      img = await loadImage(pngBuffer);
    } catch (err: any) {
      throw new Error(
        `[RankSvgAssetCache] Canvas failed to decode rasterized PNG for ${svgPath}: ${err?.message ?? err}`,
      );
    }

    const duration = performance.now() - tStart;
    this.totalRasterizationTimeMs += duration;

    this.imageCache.set(cacheKey, img);
    return img;
  }

  /**
   * Pre-warms the cache for the specified rank icon and logical sizes.
   * Returns warm-up time in milliseconds.
   */
  public async warmUp(
    icon: string,
    logicalSizes: number[],
    pixelMultiplier = 2,
  ): Promise<number> {
    const t0 = performance.now();
    for (const size of logicalSizes) {
      await this.getRankSvgImage(icon, size, pixelMultiplier);
    }
    return performance.now() - t0;
  }

  public getStats(): SvgAssetCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      totalRasterizationTimeMs: Number(
        this.totalRasterizationTimeMs.toFixed(2),
      ),
      cachedItems: Array.from(this.imageCache.keys()),
    };
  }

  public resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.totalRasterizationTimeMs = 0;
  }
}

/**
 * Creates an experimental rank icon loader that uses genuine SVG for Platinum (rasterized at 2x)
 * and returns null for all other ranks to preserve existing PNG loading.
 */
export function createExperimentalRankIconLoader(
  svgCache: RankSvgAssetCache,
  pixelMultiplier = 2,
): RankIconLoader {
  return async (icon: string, logicalSize: number) => {
    const normalized = icon.replace(/^rank-/, "");
    if (normalized === "platinum") {
      return svgCache.getRankSvgImage(normalized, logicalSize, pixelMultiplier);
    }
    // Return null so the renderer falls back to the existing PNG asset
    return null;
  };
}

/**
 * Creates the candidate experimental renderer: Scale 1 canvas with 2x rasterized Platinum SVG.
 */
export function createExperimentalCandidateRenderer(
  svgCache = new RankSvgAssetCache(),
): RankProfileCardRenderer {
  return new RankProfileCardRenderer({
    scale: 1,
    customRankIconLoader: createExperimentalRankIconLoader(svgCache, 2),
  });
}

/**
 * Creates an experimental Scale 2 renderer with genuine SVG for Platinum.
 * Default pixelMultiplier = 4 (supersampled 2x relative to physical 120px canvas destination).
 */
export function createScale2SvgRenderer(
  svgCache = new RankSvgAssetCache(),
  pixelMultiplier = 4,
): RankProfileCardRenderer {
  return new RankProfileCardRenderer({
    scale: 2,
    customRankIconLoader: createExperimentalRankIconLoader(svgCache, pixelMultiplier),
  });
}

/**
 * Creates the baseline renderer: Scale 2 canvas with existing PNG assets.
 */
export function createBaselineRenderer(): RankProfileCardRenderer {
  return new RankProfileCardRenderer({
    scale: 2,
  });
}

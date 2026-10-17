import { existsSync, readdirSync, readFileSync, mkdirSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { loadImage, type Image } from "@napi-rs/canvas";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

function resolveRanksDir(): string {
  const localRanks = join(process.cwd(), "src", "assets", "ranks");
  if (existsSync(localRanks)) return localRanks;
  const distRanks = join(process.cwd(), "dist", "assets", "ranks");
  if (existsSync(distRanks)) return distRanks;
  const relative = join(__dirname, "..", "assets", "ranks");
  if (existsSync(relative)) return relative;
  return localRanks;
}

export const ALL_RANKS = [
  "ascendant",
  "bronze",
  "diamond",
  "gold",
  "immortal",
  "iron",
  "platinum",
  "radient",
  "silver",
  "unrated",
];

export interface PresizedAssetDetails {
  rank: string;
  size: number;
  filePath: string;
  fileSizeBytes: number;
  dataUriLength: number;
}

export interface PresizedCacheOptions {
  ranksDir?: string;
  cacheDir?: string;
  scale?: number;
  sizes?: number[];
  compressionLevel?: number;
}

export class PresizedRankAssetCache {
  private static instance: PresizedRankAssetCache | null = null;

  private readonly ranksDir: string;
  private readonly cacheDir: string;
  private readonly scale: number;
  private readonly targetSizes: number[];
  private readonly compressionLevel: number;

  private readonly dataUris = new Map<string, string>();
  private readonly buffers = new Map<string, Buffer>();
  private readonly canvasImages = new Map<string, Image>();
  private initialized = false;

  constructor(options: PresizedCacheOptions = {}) {
    this.ranksDir = options.ranksDir ?? resolveRanksDir();
    this.cacheDir =
      options.cacheDir ?? join(process.cwd(), "tmp", "presized-ranks-cache");
    this.scale = options.scale ?? 1;
    this.targetSizes = options.sizes ?? [60, 48, 40];
    this.compressionLevel = options.compressionLevel ?? 6;
  }

  public static async getInstance(
    options?: PresizedCacheOptions,
  ): Promise<PresizedRankAssetCache> {
    if (!PresizedRankAssetCache.instance) {
      PresizedRankAssetCache.instance = new PresizedRankAssetCache(options);
      await PresizedRankAssetCache.instance.initialize();
    }
    return PresizedRankAssetCache.instance;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  private getCacheKey(icon: string, logicalSize: number): string {
    const normalized = icon.replace(/^rank-/, "").toLowerCase();
    return `${normalized}:${logicalSize}`;
  }

  /**
   * Generates or validates pre-sized variants and loads them into memory.
   * If source PNG is newer than cached variant, it invalidates and re-encodes.
   */
  public async initialize(): Promise<{
    durationMs: number;
    generatedCount: number;
    loadedCount: number;
    totalSizeBytes: number;
    assets: PresizedAssetDetails[];
  }> {
    const t0 = performance.now();
    mkdirSync(this.cacheDir, { recursive: true });

    let generatedCount = 0;
    let loadedCount = 0;
    let totalSizeBytes = 0;
    const assets: PresizedAssetDetails[] = [];

    for (const rank of ALL_RANKS) {
      const sourcePath = join(this.ranksDir, `${rank}.png`);
      if (!existsSync(sourcePath)) continue;

      const sourceStat = statSync(sourcePath);
      let sourceBuffer: Buffer | null = null;

      for (const logicalSize of this.targetSizes) {
        const physicalPx = Math.round(logicalSize * this.scale);
        const cachedFileName = `${rank}-${physicalPx}x${physicalPx}.png`;
        const cachedFilePath = join(this.cacheDir, cachedFileName);

        let needsRegen = true;
        if (existsSync(cachedFilePath)) {
          const cachedStat = statSync(cachedFilePath);
          if (cachedStat.mtimeMs >= sourceStat.mtimeMs && cachedStat.size > 0) {
            needsRegen = false;
          }
        }

        let variantBuffer: Buffer;
        if (needsRegen) {
          if (!sourceBuffer) {
            sourceBuffer = readFileSync(sourcePath);
          }
          variantBuffer = await sharp(sourceBuffer)
            .resize(physicalPx, physicalPx, {
              fit: "contain",
              background: { r: 0, g: 0, b: 0, alpha: 0 },
              kernel: "lanczos3",
            })
            .png({ compressionLevel: this.compressionLevel })
            .toBuffer();

          await writeFile(cachedFilePath, variantBuffer);
          generatedCount++;
        } else {
          variantBuffer = readFileSync(cachedFilePath);
        }

        const dataUri = `data:image/png;base64,${variantBuffer.toString("base64")}`;
        const cacheKey = this.getCacheKey(rank, logicalSize);

        this.buffers.set(cacheKey, variantBuffer);
        this.dataUris.set(cacheKey, dataUri);

        // Also decode into Image for optional canvas use
        try {
          const img = await loadImage(variantBuffer);
          this.canvasImages.set(cacheKey, img);
        } catch {
          // Canvas decoding fallback
        }

        loadedCount++;
        totalSizeBytes += variantBuffer.length;
        assets.push({
          rank,
          size: logicalSize,
          filePath: cachedFilePath,
          fileSizeBytes: variantBuffer.length,
          dataUriLength: dataUri.length,
        });
      }
    }

    this.initialized = true;
    const durationMs = performance.now() - t0;

    return {
      durationMs,
      generatedCount,
      loadedCount,
      totalSizeBytes,
      assets,
    };
  }

  /**
   * Fast synchronous in-memory Base64 data URI lookup.
   */
  public getDataUri(icon: string, logicalSize: number): string | undefined {
    const key = this.getCacheKey(icon, logicalSize);
    return this.dataUris.get(key);
  }

  /**
   * Fast synchronous in-memory raw PNG Buffer lookup.
   */
  public getBuffer(icon: string, logicalSize: number): Buffer | undefined {
    const key = this.getCacheKey(icon, logicalSize);
    return this.buffers.get(key);
  }

  /**
   * Fast synchronous in-memory Canvas Image lookup.
   */
  public getCanvasImage(icon: string, logicalSize: number): Image | undefined {
    const key = this.getCacheKey(icon, logicalSize);
    return this.canvasImages.get(key);
  }

  /**
   * Canvas loader adapter compatible with RankProfileCardRenderer customRankIconLoader.
   */
  public getCanvasIconLoader() {
    return async (icon: string, logicalSize: number): Promise<Image | null> => {
      const img = this.getCanvasImage(icon, logicalSize);
      return img ?? null;
    };
  }

  public getStats() {
    return {
      cachedDataUris: this.dataUris.size,
      cachedBuffers: this.buffers.size,
      cachedCanvasImages: this.canvasImages.size,
    };
  }
}

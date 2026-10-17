import sharp from "sharp";

// Optimize libvips memory: disable 50MB internal caching & limit concurrency
// to prevent multi-threaded glibc memory arena fragmentation on Linux.
sharp.cache(false);
sharp.concurrency(1);

export interface AvatarCacheOptions {
  /** Maximum memory in bytes allowed for cached avatar strings. Default: 25 MB */
  maxBytes?: number;
  /** Final display diameter for profile card avatar in pixels. Default: 167 */
  defaultDiameter?: number;
}

interface CacheRecord {
  dataUri: string;
  byteLength: number;
}

const DEFAULT_MAX_BYTES =
  Number(process.env.AVATAR_CACHE_MAX_BYTES) || 25 * 1024 * 1024; // 25 MB
export const FINAL_DISPLAY_AVATAR_DIAMETER = 167; // Exact 167x167 final display dimension

export class AvatarCache {
  private static instance: AvatarCache | null = null;

  // Map preserves insertion order, providing O(1) LRU eviction behavior
  private readonly cache = new Map<string, CacheRecord>();
  private currentBytes = 0;
  private maxBytes: number;
  private defaultDiameter: number;

  constructor(options: AvatarCacheOptions = {}) {
    this.maxBytes = Math.max(1024 * 1024, options.maxBytes ?? DEFAULT_MAX_BYTES);
    this.defaultDiameter = options.defaultDiameter ?? FINAL_DISPLAY_AVATAR_DIAMETER;
  }

  public static getInstance(options?: AvatarCacheOptions): AvatarCache {
    if (!AvatarCache.instance) {
      AvatarCache.instance = new AvatarCache(options);
    }
    return AvatarCache.instance;
  }

  public static resetInstance(): void {
    if (AvatarCache.instance) {
      AvatarCache.instance.clear();
      AvatarCache.instance = null;
    }
  }

  /**
   * Fetches/decodes the avatar, resizes it to its exact final display dimensions
   * (default: 167x167), and caches the resulting Base64 Data URI within the byte limit.
   */
  public async getAvatarDataUri(
    urlOrBuffer: string | Buffer,
    diameter: number = this.defaultDiameter,
  ): Promise<string> {
    const key =
      typeof urlOrBuffer === "string"
        ? `${urlOrBuffer}:${diameter}`
        : `buffer:${urlOrBuffer.length}:${diameter}`;

    // Cache hit: move entry to the end to mark it as most recently used
    const existing = this.cache.get(key);
    if (existing) {
      this.cache.delete(key);
      this.cache.set(key, existing);
      return existing.dataUri;
    }

    let rawBuffer: Buffer;
    if (typeof urlOrBuffer === "string") {
      const res = await fetch(urlOrBuffer);
      if (!res.ok) {
        throw new Error(
          `Failed to fetch avatar from ${urlOrBuffer}: ${res.statusText}`,
        );
      }
      rawBuffer = Buffer.from(await res.arrayBuffer());
    } else {
      rawBuffer = urlOrBuffer;
    }

    // Resize strictly to the final display dimensions and encode with high compression
    const resized = await sharp(rawBuffer)
      .resize(diameter, diameter, { fit: "cover" })
      .png({ compressionLevel: 9, effort: 7 })
      .toBuffer();

    const dataUri = `data:image/png;base64,${resized.toString("base64")}`;
    const entryBytes = Buffer.byteLength(dataUri, "utf8") + Buffer.byteLength(key, "utf8");

    // Enforce cache byte limit: evict LRU entries until enough space is available
    while (this.currentBytes + entryBytes > this.maxBytes && this.cache.size > 0) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.cache.get(oldestKey);
      if (oldest) {
        this.currentBytes -= oldest.byteLength;
      }
      this.cache.delete(oldestKey);
    }

    // Only cache if the item itself does not exceed the total cache capacity
    if (entryBytes <= this.maxBytes) {
      this.cache.set(key, { dataUri, byteLength: entryBytes });
      this.currentBytes += entryBytes;
    }

    return dataUri;
  }

  public has(key: string): boolean {
    return this.cache.has(key);
  }

  public getCurrentBytes(): number {
    return this.currentBytes;
  }

  public getMaxBytes(): number {
    return this.maxBytes;
  }

  public getEntryCount(): number {
    return this.cache.size;
  }

  public setMaxBytes(bytes: number): void {
    this.maxBytes = Math.max(1024 * 1024, bytes);
    while (this.currentBytes > this.maxBytes && this.cache.size > 0) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      const oldest = this.cache.get(oldestKey);
      if (oldest) {
        this.currentBytes -= oldest.byteLength;
      }
      this.cache.delete(oldestKey);
    }
  }

  public clear(): void {
    this.cache.clear();
    this.currentBytes = 0;
  }
}

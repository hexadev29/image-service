import sharp from "sharp";

export class AvatarCache {
  private static instance: AvatarCache | null = null;
  private readonly cache = new Map<string, string>();

  public static getInstance(): AvatarCache {
    if (!AvatarCache.instance) {
      AvatarCache.instance = new AvatarCache();
    }
    return AvatarCache.instance;
  }

  public async getAvatarDataUri(
    urlOrBuffer: string | Buffer,
    diameter = 334,
  ): Promise<string> {
    const key =
      typeof urlOrBuffer === "string"
        ? `${urlOrBuffer}:${diameter}`
        : `buffer:${urlOrBuffer.length}:${diameter}`;

    if (this.cache.has(key)) {
      return this.cache.get(key)!;
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

    const resized = await sharp(rawBuffer)
      .resize(diameter, diameter, { fit: "cover" })
      .png()
      .toBuffer();

    const dataUri = `data:image/png;base64,${resized.toString("base64")}`;
    this.cache.set(key, dataUri);
    return dataUri;
  }

  public has(url: string): boolean {
    return this.cache.has(url);
  }

  public clear(): void {
    this.cache.clear();
  }
}

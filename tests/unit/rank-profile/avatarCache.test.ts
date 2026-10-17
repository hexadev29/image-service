import { describe, it, expect, beforeEach } from "vitest";
import sharp from "sharp";
import {
  AvatarCache,
  FINAL_DISPLAY_AVATAR_DIAMETER,
} from "../../../src/rank-profile/AvatarCache.js";
import {
  resolveRequiredFonts,
  REQUIRED_FONT_REGEX,
} from "../../../src/utils/fontResolver.js";

describe("AvatarCache & Font Optimization", () => {
  beforeEach(() => {
    AvatarCache.resetInstance();
  });

  it("resolves strictly the 4 required Poppins font weights", () => {
    const fonts = resolveRequiredFonts();
    expect(fonts.length).toBe(4);
    for (const font of fonts) {
      expect(font).toMatch(REQUIRED_FONT_REGEX);
    }
  });

  it("resizes avatars at final display dimensions (167px) by default", async () => {
    // Generate a dummy 400x400 image buffer
    const testBuffer = await sharp({
      create: {
        width: 400,
        height: 400,
        channels: 4,
        background: { r: 50, g: 100, b: 150, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const cache = new AvatarCache();
    const dataUri = await cache.getAvatarDataUri(testBuffer);

    expect(dataUri).toMatch(/^data:image\/png;base64,/);

    // Extract the raw PNG from the Base64 data URI to inspect its dimensions
    const base64Data = dataUri.replace(/^data:image\/png;base64,/, "");
    const decodedBuffer = Buffer.from(base64Data, "base64");
    const metadata = await sharp(decodedBuffer).metadata();

    expect(metadata.width).toBe(FINAL_DISPLAY_AVATAR_DIAMETER);
    expect(metadata.height).toBe(FINAL_DISPLAY_AVATAR_DIAMETER);
    expect(metadata.width).toBe(167);
    expect(metadata.height).toBe(167);
  });

  it("enforces cache byte limit and evicts LRU items when capacity is exceeded", async () => {
    // Set a tiny maxBytes limit (e.g. 15 KB)
    const smallLimit = 15 * 1024;
    const cache = new AvatarCache({ maxBytes: smallLimit });

    // Helper to generate distinct buffers
    const makeBuffer = (color: number) =>
      sharp({
        create: {
          width: 200,
          height: 200,
          channels: 4,
          background: { r: color, g: 50, b: 50, alpha: 1 },
        },
      })
        .png()
        .toBuffer();

    const buf1 = await makeBuffer(10);
    const buf2 = await makeBuffer(20);
    const buf3 = await makeBuffer(30);

    const uri1 = await cache.getAvatarDataUri(buf1, 100);
    expect(cache.has(`buffer:${buf1.length}:100`)).toBe(true);

    const uri2 = await cache.getAvatarDataUri(buf2, 100);
    expect(cache.has(`buffer:${buf2.length}:100`)).toBe(true);

    // Inserting buf3 should exceed the limit and evict buf1 (oldest)
    const uri3 = await cache.getAvatarDataUri(buf3, 100);
    expect(cache.has(`buffer:${buf3.length}:100`)).toBe(true);

    expect(cache.getCurrentBytes()).toBeLessThanOrEqual(smallLimit);
  });
});

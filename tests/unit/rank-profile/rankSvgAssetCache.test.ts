import { describe, it, expect, beforeEach } from "vitest";
import {
  RankSvgAssetCache,
  createExperimentalRankIconLoader,
} from "../../../src/rank-profile/experiments/rankSvgAssetCache.js";

describe("RankSvgAssetCache", () => {
  let cache: RankSvgAssetCache;

  beforeEach(() => {
    cache = new RankSvgAssetCache();
  });

  it("detects genuine platinum SVG asset on disk", () => {
    expect(cache.hasSvgAsset("platinum")).toBe(true);
    expect(cache.hasSvgAsset("rank-platinum")).toBe(true);
    expect(cache.hasSvgAsset("nonexistent-rank")).toBe(false);
  });

  it("rasterizes platinum SVG to 2x logical display size with alpha transparency", async () => {
    // 60px logical size * 2 = 120px physical size
    const image = await cache.getRankSvgImage("platinum", 60, 2);
    expect(image).toBeDefined();
    expect(image.width).toBe(120);
    expect(image.height).toBe(120);

    const stats = cache.getStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(0);
  });

  it("serves repeated requests from in-memory cache without re-rasterizing", async () => {
    await cache.getRankSvgImage("platinum", 60, 2);
    const cachedImage = await cache.getRankSvgImage("platinum", 60, 2);

    expect(cachedImage).toBeDefined();
    const stats = cache.getStats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it("throws clear error when SVG asset is missing", async () => {
    await expect(cache.getRankSvgImage("fake-rank", 60, 2)).rejects.toThrow(
      /Missing genuine SVG asset for rank "fake-rank"/,
    );
  });

  it("createExperimentalRankIconLoader delegates platinum to SVG and non-platinum to fallback", async () => {
    const loader = createExperimentalRankIconLoader(cache, 2);

    const platinumImg = await loader("platinum", 48);
    expect(platinumImg).toBeDefined();
    expect(platinumImg.width).toBe(96);
    expect(platinumImg.height).toBe(96);

    const goldImg = await loader("gold", 48);
    expect(goldImg).toBeNull();
  });

  it("warms up cache and tracks warm-up duration", async () => {
    const warmUpDuration = await cache.warmUp("platinum", [48, 60]);
    expect(warmUpDuration).toBeGreaterThan(0);

    const stats = cache.getStats();
    expect(stats.cachedItems).toContain("platinum:96");
    expect(stats.cachedItems).toContain("platinum:120");
  });
});

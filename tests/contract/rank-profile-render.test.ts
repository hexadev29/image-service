import { describe, it, expect } from "vitest";
import { buildApp } from "../../src/app.js";
import { sample } from "../fixtures/rankProfile.sample.js";
describe("render endpoint", () =>
  it("returns PNG", async () => {
    const app = buildApp(),
      r = await app.inject({
        method: "POST",
        url: "/v1/rank-profile/render",
        payload: sample,
      });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toContain("image/png");
    expect(r.rawPayload.subarray(1, 4).toString()).toBe("PNG");
    await app.close();
  }));

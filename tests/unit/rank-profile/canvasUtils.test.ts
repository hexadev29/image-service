import { describe, it, expect } from "vitest";
import {
  clamp,
  minutes,
  ellipsis,
} from "../../../src/rank-profile/components/canvasUtils.js";
describe("canvas utilities", () => {
  it("formats durations", () => {
    expect(minutes(486)).toBe("08h 06m");
    expect(minutes(19260)).toBe("321h");
  });
  it("clamps progress", () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(2)).toBe(1);
  });
  it("truncates names", () =>
    expect(
      ellipsis(
        { measureText: (s: string) => ({ width: s.length }) },
        "abcdefgh",
        5,
      ),
    ).toBe("abcd…"));
});

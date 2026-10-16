import { describe, it, expect } from "vitest";
import { normalizeRankProfile } from "../../../src/rank-profile/rankProfile.schema.js";
import { sample } from "../../fixtures/rankProfile.sample.js";
it("normalizes activity and negatives", () => {
  const d = normalizeRankProfile({
    ...sample,
    activity: { days: [-2] },
    hours: { ...sample.hours, dailyMinutes: -1 },
  });
  expect(d.activity.days).toHaveLength(7);
  expect(d.activity.days[0]).toBe(0);
  expect(d.hours.dailyMinutes).toBe(0);
});

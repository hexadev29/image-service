import { describe, it, expect } from "vitest";
import { getEligibleBadges } from "../../../src/rank-profile/badge-rules/getEligibleBadges.js";
describe("badges", () =>
  it("sorts eligible badges", () =>
    expect(
      getEligibleBadges({
        isHallOfFame: true,
        achievements: 30,
        isWinner: true,
      }).map((x) => x.id),
    ).toEqual(["hall", "top", "winner"])));

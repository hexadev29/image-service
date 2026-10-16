import type { RankProfileCardInput } from "../rank-profile/rankProfile.types.js";

export const sampleRankProfile: RankProfileCardInput = {
  identity: {
    displayName: "Hexa Dev",
    subtitle: "Focus. Compete. Improve.",
  },
  summary: { achievements: 32, goals: 18, milestones: 7 },
  activity: { days: [120, 210, 90, 300, 180, 240, 75] },
  leaderboard: { rank: 1, percentile: 1, nearbyRanks: [64, 82, 100, 72, 56] },
  hours: {
    monthlyMinutes: 19260,
    weeklyMinutes: 4680,
    dailyMinutes: 491,
    allTimeMinutes: 116270,
  },
  rankTransition: {
    current: { name: "Gold", icon: "gold" },
    next: { name: "Platinum", icon: "platinum" },
    progress: 0.72,
  },
  timeBreakdown: {
    camMinutes: 4680,
    nonCamMinutes: 1440,
    overallMinutes: 6120,
    camPercent: 76.5,
    nonCamPercent: 23.5,
  },
  badgeContext: {
    achievements: 32,
    goals: 18,
    milestones: 7,
    isHallOfFame: true,
  },
};

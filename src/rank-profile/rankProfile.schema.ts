import { z } from "zod";
import type {
  RankProfileCardData,
  RankProfileCardInput,
} from "./rankProfile.types.js";
const n = z.coerce
  .number()
  .finite()
  .catch(0)
  .transform((x) => Math.max(0, x));
const icon = z.enum([
  "iron",
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "ascendant",
  "immortal",
  "radiant",
  "trophy",
  "target",
  "flag",
  "calendar",
  "camera",
  "clock",
  "rank-gold",
  "rank-platinum",
  "star",
]);
export const rankProfileSchema = z.object({
  identity: z.object({
    displayName: z.string().trim().min(1).max(160),
    subtitle: z.string().trim().max(120).optional(),
    avatarUrl: z
      .string()
      .url()
      .refine((v) => /^https?:/.test(v))
      .optional(),
  }),
  summary: z.object({ achievements: n, goals: n, milestones: n }),
  activity: z.object({ days: z.array(n).max(7).default([]) }),
  leaderboard: z.object({
    rank: n.transform((x) => Math.max(1, Math.round(x))),
    percentile: n.transform((x) => Math.min(100, x)),
    nearbyRanks: z.array(n).max(5).default([]),
    currentIndex: z.number().int().min(0).max(4).optional(),
  }),
  hours: z.object({
    monthlyMinutes: n,
    weeklyMinutes: n,
    dailyMinutes: n,
    allTimeMinutes: n,
  }),
  rankTransition: z.object({
    current: z.object({ name: z.string().max(32), icon }),
    next: z.object({ name: z.string().max(32), icon }),
    progress: n.transform((x) => Math.min(1, x)),
  }),
  timeBreakdown: z.object({
    camMinutes: n,
    nonCamMinutes: n,
    overallMinutes: n,
    camPercent: n.transform((x) => Math.min(100, x)).optional(),
    nonCamPercent: n.transform((x) => Math.min(100, x)).optional(),
  }),
  badgeContext: z.object({
    achievements: n,
    goals: n,
    milestones: n,
    isHallOfFame: z.boolean().optional(),
    isWinner: z.boolean().optional(),
  }),
});
export function normalizeRankProfile(
  input: RankProfileCardInput,
): RankProfileCardData {
  const d = rankProfileSchema.parse(input);
  return {
    ...d,
    activity: {
      days: [...d.activity.days, 0, 0, 0, 0, 0, 0].slice(
        0,
        7,
      ) as RankProfileCardData["activity"]["days"],
    },
    leaderboard: {
      ...d.leaderboard,
      nearbyRanks: [...d.leaderboard.nearbyRanks, 0, 0, 0, 0, 0].slice(
        0,
        5,
      ) as RankProfileCardData["leaderboard"]["nearbyRanks"],
      currentIndex: d.leaderboard.currentIndex ?? 2,
    },
  };
}

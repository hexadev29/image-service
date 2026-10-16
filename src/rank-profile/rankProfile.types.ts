export type IconName =
  | "iron"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "ascendant"
  | "immortal"
  | "radiant"
  | "trophy"
  | "target"
  | "flag"
  | "calendar"
  | "camera"
  | "clock"
  | "rank-gold"
  | "rank-platinum"
  | "star";
export interface RankProfileCardInput {
  identity: { displayName: string; subtitle?: string; avatarUrl?: string };
  summary: { achievements: number; goals: number; milestones: number };
  activity: { days: number[] };
  leaderboard: {
    rank: number;
    percentile: number;
    nearbyRanks: number[];
    currentIndex?: number;
  };
  hours: {
    monthlyMinutes: number;
    weeklyMinutes: number;
    dailyMinutes: number;
    allTimeMinutes: number;
  };
  rankTransition: {
    current: { name: string; icon: IconName };
    next: { name: string; icon: IconName };
    progress: number;
  };
  timeBreakdown: {
    camMinutes: number;
    nonCamMinutes: number;
    overallMinutes: number;
    camPercent?: number;
    nonCamPercent?: number;
  };
  badgeContext: {
    achievements: number;
    goals: number;
    milestones: number;
    isHallOfFame?: boolean;
    isWinner?: boolean;
  };
}
export interface RankProfileCardData extends RankProfileCardInput {
  activity: { days: [number, number, number, number, number, number, number] };
  leaderboard: {
    rank: number;
    percentile: number;
    nearbyRanks: [number, number, number, number, number];
    currentIndex: number;
  };
}
export interface RenderResult {
  buffer: Uint8Array;
  contentType: "image/png";
  filename: "rank-profile.png";
}

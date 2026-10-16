import type { IconName } from "../rankProfile.types.js";
export interface Badge {
  id: string;
  label: string;
  icon: IconName;
  priority: number;
  isEligible: (c: any) => boolean;
}
export const badgeDefinitions: Badge[] = [
  {
    id: "hall",
    label: "Hall of Fame",
    icon: "star",
    priority: 30,
    isEligible: (c) => !!c.isHallOfFame,
  },
  {
    id: "top",
    label: "Top Performer",
    icon: "trophy",
    priority: 20,
    isEligible: (c) => c.achievements >= 25,
  },
  {
    id: "winner",
    label: "Winner",
    icon: "trophy",
    priority: 10,
    isEligible: (c) => !!c.isWinner,
  },
];

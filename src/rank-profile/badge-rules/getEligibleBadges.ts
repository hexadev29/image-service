import { badgeDefinitions } from "./badgeDefinitions.js";
export const getEligibleBadges = (context: any) =>
  badgeDefinitions
    .filter((b) => b.isEligible(context))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

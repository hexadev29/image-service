import { Resvg } from "@resvg/resvg-js";
import { createCanvas } from "@napi-rs/canvas";
import { join } from "node:path";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { normalizeRankProfile } from "./rankProfile.schema.js";
import { minutes, clamp } from "./components/canvasUtils.js";
import { getEligibleBadges } from "./badge-rules/getEligibleBadges.js";
import { PresizedRankAssetCache } from "./PresizedRankAssetCache.js";
import type {
  RankProfileCardInput,
  RenderResult,
} from "./rankProfile.types.js";
import { resolveRequiredFonts } from "../utils/fontResolver.js";

const C = {
  ink: "#27223A",
  muted: "#827B96",
  white: "#FFFFFF",
  border: "#ECE7F4",
  coral: "#EF897D",
  purple: "#9D8CD6",
  mint: "#9EDCC9",
  cardBg: "#FCF7F8",
  panelBg: "#FCFBFF",
  badgeBg: "#F2EEFC",
  barTrack: "#EAE5F5",
  timeBoxBg: "#F5F2FC",
  leaderNearbyBar: "#DDD6F3",
};

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncateText(s: string, size: number, max = 999): string {
  const safeLength = Math.max(1, Math.floor(max / Math.max(size * 0.55, 1)));
  return s.length > safeLength ? `${s.slice(0, safeLength - 1)}…` : s;
}

export interface SvgHybridRendererOptions {
  assetCache?: PresizedRankAssetCache;
  scale?: number;
}

export class SvgHybridProfileRenderer {
  private readonly assetCache: PresizedRankAssetCache;
  private readonly fontFiles: string[];
  private readonly scale: number;
  private readonly measureCtx: any;

  constructor(options: SvgHybridRendererOptions = {}) {
    this.assetCache = options.assetCache ?? new PresizedRankAssetCache();
    this.fontFiles = resolveRequiredFonts();
    this.scale = options.scale ?? 1;

    // Fast canvas context strictly for text measurement (e.g. nameWidth)
    const measureCanvas = createCanvas(1, 1);
    this.measureCtx = measureCanvas.getContext("2d");
  }

  public async initialize(): Promise<void> {
    if (!this.assetCache.isInitialized()) {
      await this.assetCache.initialize();
    }
  }

  public generateSvg(input: RankProfileCardInput): string {
    const data = normalizeRankProfile(input);

    // Measure name width for header rank icon placement
    this.measureCtx.font = "700 30px Poppins";
    const rawName = truncateText(data.identity.displayName, 30, 520);
    const nameWidth = this.measureCtx.measureText(rawName).width;

    const displayNameEscaped = escapeXml(rawName);
    const subtitleEscaped = data.identity.subtitle
      ? escapeXml(truncateText(data.identity.subtitle, 15, 520))
      : "";

    // Cached rank icon data URIs
    const headerRankUri =
      this.assetCache.getDataUri(data.rankTransition.current.icon, 60) ?? "";
    const transitionCurrentRankUri =
      this.assetCache.getDataUri(data.rankTransition.current.icon, 48) ?? "";
    const transitionNextRankUri =
      this.assetCache.getDataUri(data.rankTransition.next.icon, 48) ?? "";

    const headerRankX = 180 + nameWidth + 10;

    // Badges (up to 3)
    let badgeMarkup = "";
    let badgeX = 180;
    for (const badge of getEligibleBadges(data.badgeContext).slice(0, 3)) {
      const pillWidth = badge.label.length * 8 + 38;
      badgeMarkup += `
      <!-- Badge: ${escapeXml(badge.label)} -->
      <rect x="${badgeX}" y="151" width="${pillWidth}" height="28" rx="14" ry="14" fill="${C.badgeBg}" stroke="${C.border}" stroke-width="1"/>
      <circle cx="${badgeX + 16}" cy="165" r="4" fill="${C.purple}"/>
      <text x="${badgeX + 26}" y="171" font-family="Poppins" font-size="12" font-weight="600" fill="${C.ink}">${escapeXml(badge.label)}</text>`;
      badgeX += pillWidth + 8;
    }

    // Summary Counters (Achievements, Goals, Milestones)
    const summaryItems: [string, number, string][] = [
      ["Achievements", data.summary.achievements, "#9D8CD6"],
      ["Goals", data.summary.goals, "#9EDCC9"],
      ["Milestones", data.summary.milestones, "#EF897D"],
    ];
    let summaryMarkup = "";
    summaryItems.forEach(([label, value, color], index) => {
      const sx = 755 + index * 122;
      summaryMarkup += `
      <!-- Summary: ${label} -->
      <circle cx="${sx + 8}" cy="83" r="7" fill="${color}"/>
      <text x="${sx + 20}" y="88" font-family="Poppins" font-size="22" font-weight="700" fill="${C.ink}">${value}</text>
      <text x="${sx}" y="111" font-family="Poppins" font-size="11" font-weight="500" fill="${C.muted}">${label}</text>`;
    });

    // Activity Bars (7 days)
    const activityMax = Math.max(...data.activity.days, 1);
    const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    let activityMarkup = "";
    data.activity.days.forEach((v, i) => {
      const barHeight = (v / activityMax) * 72;
      const barX = 760 + i * 50;
      const barY = 238 - barHeight;
      activityMarkup += `
      <rect x="${barX}" y="${barY}" width="26" height="${barHeight}" rx="8" ry="8" fill="${C.coral}"/>
      <text x="${barX - 2}" y="258" font-family="Poppins" font-size="10" font-weight="500" fill="${C.muted}">${dayNames[i]}</text>`;
    });

    // Leaderboard Nearby Ranks
    const rankMax = Math.max(...data.leaderboard.nearbyRanks, 1);
    let rankBarsMarkup = "";
    data.leaderboard.nearbyRanks.forEach((v, i) => {
      const barHeight = 55 + (v / rankMax) * 130;
      const barX = 96 + i * 54;
      const barY = 642 - barHeight;
      const fillColor =
        i === data.leaderboard.currentIndex ? C.coral : C.leaderNearbyBar;
      rankBarsMarkup += `
      <rect x="${barX}" y="${barY}" width="34" height="${barHeight}" rx="12" ry="12" fill="${fillColor}"/>`;
    });

    // Hours Overview items
    const hourRows: [string, number][] = [
      ["May", data.hours.monthlyMinutes],
      ["Weekly", data.hours.weeklyMinutes],
      ["Daily", data.hours.dailyMinutes],
      ["All Time", data.hours.allTimeMinutes],
    ];
    let hoursMarkup = "";
    hourRows.forEach(([label, value], i) => {
      const colX = 450 + i * 162;
      hoursMarkup += `
      <text x="${colX}" y="384" font-family="Poppins" font-size="12" font-weight="600" fill="${C.muted}">${label}</text>
      <text x="${colX}" y="417" font-family="Poppins" font-size="24" font-weight="700" fill="${C.ink}">${minutes(value)}</text>`;
      if (i < 3) {
        hoursMarkup += `
      <line x1="${colX + 142}" y1="365" x2="${colX + 142}" y2="425" stroke="${C.border}" stroke-width="1"/>`;
      }
    });

    // Progress bar
    const progressClamped = clamp(data.rankTransition.progress);
    const progressFillWidth = 590 * progressClamped;
    const progressPercentText = `${Math.round(progressClamped * 100)}%`;

    // Time Breakdown items
    const timeBreakdownItems: [string, number][] = [
      ["CAM HOURS", data.timeBreakdown.camMinutes],
      ["NON CAM HOURS", data.timeBreakdown.nonCamMinutes],
      ["OVERALL HOURS", data.timeBreakdown.overallMinutes],
    ];
    let timeBreakdownMarkup = "";
    timeBreakdownItems.forEach(([label, value], i) => {
      const colX = 450 + i * 207;
      timeBreakdownMarkup += `
      <rect x="${colX}" y="566" width="187" height="88" rx="16" ry="16" fill="${C.timeBoxBg}" stroke="${C.border}" stroke-width="1"/>
      <text x="${colX + 16}" y="592" font-family="Poppins" font-size="11" font-weight="600" fill="${C.muted}">${label}</text>
      <text x="${colX + 16}" y="630" font-family="Poppins" font-size="24" font-weight="700" fill="${C.ink}">${minutes(value)}</text>`;
    });

    // Avatar section: fallback or custom
    const fallbackLetter = (data.identity.displayName[0] || "?").toUpperCase();
    const avatarSection = `
    <!-- Avatar (cx: 114, cy: 112, r: 46) -->
    <g clip-path="url(#avatar-clip)">
      <rect x="68" y="66" width="92" height="92" fill="#E9E2F8"/>
      <text x="114" y="112" font-family="Poppins" font-size="34" font-weight="700" fill="${C.purple}" text-anchor="middle" dominant-baseline="central">${fallbackLetter}</text>
    </g>
    <!-- Outer Rings -->
    <circle cx="114" cy="112" r="49" fill="none" stroke="#F9F1ED" stroke-width="6"/>
    <circle cx="114" cy="112" r="53" fill="none" stroke="#EFDED5" stroke-width="2"/>`;

    // Complete composite SVG string
    return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1200 760" width="1200" height="760">
  <defs>
    <clipPath id="avatar-clip">
      <circle cx="114" cy="112" r="46"/>
    </clipPath>
  </defs>

  <!-- Main Card Container -->
  <rect x="34" y="32" width="1132" height="696" rx="26" ry="26" fill="${C.cardBg}" stroke="${C.border}" stroke-width="1"/>

  <!-- Identity Section -->
  ${avatarSection}
  <text x="180" y="106" font-family="Poppins" font-size="30" font-weight="700" fill="${C.ink}">${displayNameEscaped}</text>
  ${data.identity.subtitle ? `<text x="180" y="134" font-family="Poppins" font-size="15" font-weight="400" fill="${C.muted}">${subtitleEscaped}</text>` : ""}
  
  <!-- Header Rank Icon (Variant C Pre-sized Lanczos3 PNG) -->
  ${headerRankUri ? `<image href="${headerRankUri}" x="${headerRankX}" y="66" width="60" height="60"/>` : ""}

  <!-- Badges -->
  ${badgeMarkup}

  <!-- Summary Section -->
  ${summaryMarkup}

  <!-- Activity Chart (Last 7 Days) -->
  <text x="755" y="151" font-family="Poppins" font-size="12" font-weight="600" fill="${C.muted}">LAST 7 DAYS</text>
  ${activityMarkup}

  <!-- Left Panel: Leaderboard -->
  <rect x="68" y="314" width="330" height="370" rx="22" ry="22" fill="${C.panelBg}" stroke="${C.border}" stroke-width="1"/>
  <text x="94" y="350" font-family="Poppins" font-size="13" font-weight="600" fill="${C.muted}">LEADERBOARD</text>
  <text x="94" y="418" font-family="Poppins" font-size="58" font-weight="700" fill="${C.ink}">#${data.leaderboard.rank}</text>
  <text x="94" y="445" font-family="Poppins" font-size="16" font-weight="600" fill="${C.purple}">Top ${data.leaderboard.percentile}%</text>
  ${rankBarsMarkup}

  <!-- Right Panel: Overview -->
  <rect x="422" y="314" width="698" height="370" rx="22" ry="22" fill="${C.panelBg}" stroke="${C.border}" stroke-width="1"/>
  
  <!-- Hours Overview -->
  <text x="450" y="350" font-family="Poppins" font-size="13" font-weight="600" fill="${C.muted}">HOURS OVERVIEW</text>
  ${hoursMarkup}

  <!-- Rank Transition -->
  <text x="450" y="470" font-family="Poppins" font-size="12" font-weight="600" fill="${C.muted}">TO NEXT RANK GROUP</text>
  
  <!-- Current Rank Icon & Name -->
  ${transitionCurrentRankUri ? `<image href="${transitionCurrentRankUri}" x="450" y="474" width="48" height="48"/>` : ""}
  <text x="506" y="503" font-family="Poppins" font-size="18" font-weight="700" fill="${C.ink}">${escapeXml(data.rankTransition.current.name)}</text>

  <!-- Transition Arrow -->
  <line x1="620" y1="495" x2="644" y2="495" stroke="${C.muted}" stroke-width="2"/>
  <polygon points="644,495 636,490 636,500" fill="${C.muted}"/>

  <!-- Next Rank Icon & Name -->
  ${transitionNextRankUri ? `<image href="${transitionNextRankUri}" x="656" y="474" width="48" height="48"/>` : ""}
  <text x="712" y="503" font-family="Poppins" font-size="18" font-weight="700" fill="${C.ink}">${escapeXml(data.rankTransition.next.name)}</text>

  <!-- Progress Bar -->
  <rect x="450" y="524" width="590" height="14" rx="7" ry="7" fill="${C.barTrack}"/>
  <rect x="450" y="524" width="${progressFillWidth}" height="14" rx="7" ry="7" fill="${C.mint}"/>
  <text x="1050" y="537" font-family="Poppins" font-size="13" font-weight="700" fill="${C.ink}">${progressPercentText}</text>

  <!-- Time Breakdown Cards -->
  ${timeBreakdownMarkup}
</svg>`;
  }

  public render(input: RankProfileCardInput): RenderResult {
    const svgString = this.generateSvg(input);

    const resvg = new Resvg(svgString, {
      fitTo: { mode: "width", value: 1200 * this.scale },
      background: "rgba(0,0,0,0)",
      font: {
        fontFiles: this.fontFiles,
        loadSystemFonts: false,
        defaultFontFamily: "Poppins",
      },
    });

    const rendered = resvg.render();
    const buffer = Buffer.from(rendered.asPng());

    return {
      buffer,
      contentType: "image/png",
      filename: "rank-profile.png",
    };
  }
}

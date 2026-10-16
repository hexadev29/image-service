import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import type { SKRSContext2D } from "@napi-rs/canvas";
import { normalizeRankProfile } from "./rankProfile.schema.js";
import { minutes, clamp } from "./components/canvasUtils.js";
import { getEligibleBadges } from "./badge-rules/getEligibleBadges.js";
import type {
  RankProfileCardInput,
  RenderResult,
} from "./rankProfile.types.js";

import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

import https from "node:https";
import http from "node:http";
// ── Fonts ─────────────────────────────────────────────────────────────────────
const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fontsDir = join(__dirname, "..", "assets", "fonts");

GlobalFonts.registerFromPath(join(fontsDir, "Poppins-Regular.ttf"), "Poppins");
GlobalFonts.registerFromPath(join(fontsDir, "Poppins-Medium.ttf"), "Poppins");
GlobalFonts.registerFromPath(join(fontsDir, "Poppins-SemiBold.ttf"), "Poppins");
GlobalFonts.registerFromPath(join(fontsDir, "Poppins-Bold.ttf"), "Poppins");
GlobalFonts.registerFromPath(
  join(fontsDir, "Poppins-ExtraBold.ttf"),
  "Poppins",
);

const ranksDir = join(__dirname, "..", "assets", "ranks");
const rankImageCache = new Map<string, any>();

const loadRankImage = async (icon: string) => {
  if (rankImageCache.has(icon)) return rankImageCache.get(icon);
  try {
    const buffer = readFileSync(join(ranksDir, `${icon}.png`));
    const img = await loadImage(buffer);
    rankImageCache.set(icon, img);
    return img;
  } catch {
    console.warn(`[RankCard] Missing rank icon: ${icon}.png`);
    return null;
  }
};

const fetchImageBuffer = (url: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;

    const req = client.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "image/webp,image/png,image/jpeg,*/*",
        },
      },
      (res) => {
        // Follow redirects (301/302)
        if (
          (res.statusCode === 301 || res.statusCode === 302) &&
          res.headers.location
        ) {
          fetchImageBuffer(res.headers.location).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      },
    );

    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });

const C = {
  ink: "#27223A",
  muted: "#827B96",
  white: "#fff",
  border: "#ECE7F4",
  coral: "#EF897D",
  purple: "#9D8CD6",
  mint: "#9EDCC9",
};

const rr = (ctx: any, x: number, y: number, w: number, h: number, r = 22) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.stroke();
};

const text = (
  ctx: any,
  s: string,
  x: number,
  y: number,
  size: number,
  color = C.ink,
  weight = 500,
  max = 999,
) => {
  ctx.font = `${weight} ${size}px Poppins`;
  ctx.fillStyle = color;
  const safeLength = Math.max(1, Math.floor(max / Math.max(size * 0.55, 1)));
  ctx.fillText(
    s.length > safeLength ? `${s.slice(0, safeLength - 1)}…` : s,
    x,
    y,
  );
};

// cx, cy = center of circle, radius = 46 in your layout
const drawAvatar = async (
  ctx: any,
  cx: number,
  cy: number,
  radius: number,
  avatarUrl: string | undefined,
  fallbackLetter: string,
) => {
  // Save state and clip to circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  let imageLoaded = false;

  if (avatarUrl) {
    try {
      const imageBuffer = await fetchImageBuffer(avatarUrl);
      const img = await loadImage(imageBuffer);

      const diameter = radius * 2;
      const scale = Math.max(diameter / img.width, diameter / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = cx - radius + (diameter - drawW) / 2;
      const drawY = cy - radius + (diameter - drawH) / 2;

      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      imageLoaded = true;
    } catch (err) {
      console.warn(`[RankCard] Failed to load avatar: ${err}`);
    }
  }

  if (!imageLoaded) {
    // Letter fallback — drawn inside the clip
    ctx.fillStyle = "#E9E2F8";
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    // Draw letter manually without the text() helper
    // because text() changes fillStyle internally
    ctx.fillStyle = C.purple;
    ctx.font = `700 34px Poppins`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fallbackLetter, cx, cy);
    ctx.textAlign = "left"; // reset
    ctx.textBaseline = "alphabetic"; // reset
  }

  // Restore clip — everything below draws outside the circle clip
  ctx.restore();

  // Thick white ring
  ctx.strokeStyle = "#F9F1ED";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
  ctx.stroke();

  // Soft grey outer ring
  ctx.shadowColor = "rgba(0, 0, 0, 0.12)";
  ctx.shadowBlur = 8;
  ctx.strokeStyle = "#EFDED5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 7, 0, Math.PI * 2);
  ctx.stroke();

  // Reset
  ctx.shadowBlur = 0;
  ctx.lineWidth = 1;
};

const drawRankIcon = async (
  ctx: SKRSContext2D,
  icon: string,
  x: number,
  y: number,
  size: number,
) => {
  const img = await loadRankImage(icon);
  if (!img) return;

  ctx.save();

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(img, x, y, size, size);

  ctx.restore();
};

export class RankProfileCardRenderer {
  async render(input: RankProfileCardInput): Promise<RenderResult> {
    const data = normalizeRankProfile(input);

    const SCALE = 6; // render at 2x
    const W = 1200 * SCALE;
    const H = 760 * SCALE;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    // Scale all drawing operations by 2x
    ctx.scale(SCALE, SCALE);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#FCF7F8";
    ctx.strokeStyle = "#ECE7F4";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.roundRect(34, 32, 1132, 696, 26);
    ctx.fill();
    ctx.stroke();

    // ── Avatar ────────────────────────────────────────────────────────────
    await drawAvatar(
      ctx,
      114,
      112,
      46,
      data.identity.avatarUrl,
      (data.identity.displayName[0] || "?").toUpperCase(),
    );

    // ── Identity text ─────────────────────────────────────────────────────
    text(ctx, data.identity.displayName, 180, 106, 30, C.ink, 700, 520);
    if (data.identity.subtitle)
      text(ctx, data.identity.subtitle, 180, 134, 15, C.muted, 400, 520);

    // Rank icon next to name
    ctx.font = `700 30px Poppins`;
    const nameWidth = ctx.measureText(data.identity.displayName).width;
    await drawRankIcon(
      ctx,
      data.rankTransition.current.icon,
      180 + nameWidth + 10,
      66,
      60,
    );

    // ── Badges ────────────────────────────────────────────────────────────
    let badgeX = 180;
    for (const badge of getEligibleBadges(data.badgeContext).slice(0, 3)) {
      ctx.fillStyle = "#F2EEFC";
      ctx.strokeStyle = C.border;
      rr(ctx, badgeX, 151, badge.label.length * 8 + 38, 28, 14);
      ctx.fillStyle = C.purple;
      ctx.beginPath();
      ctx.arc(badgeX + 16, 165, 4, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, badge.label, badgeX + 26, 171, 12, C.ink, 600);
      badgeX += badge.label.length * 8 + 46;
    }

    // ── Summary (Achievements / Goals / Milestones) ───────────────────────
    const summaryItems: [string, number, string][] = [
      ["Achievements", data.summary.achievements, "#9D8CD6"],
      ["Goals", data.summary.goals, "#9EDCC9"],
      ["Milestones", data.summary.milestones, "#EF897D"],
    ];

    summaryItems.forEach(([label, value, color], index) => {
      const sx = 755 + index * 122;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx + 8, 83, 7, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, String(value), sx + 20, 88, 22, C.ink, 700);
      text(ctx, label, sx, 111, 11, C.muted, 500);
    });

    // ── Activity bars ─────────────────────────────────────────────────────
    text(ctx, "LAST 7 DAYS", 755, 151, 12, C.muted, 600);

    const activityMax = Math.max(...data.activity.days, 1);
    data.activity.days.forEach((v, i) => {
      const barHeight = (v / activityMax) * 72;
      const barX = 760 + i * 50;
      ctx.fillStyle = C.coral;
      ctx.beginPath();
      ctx.roundRect(barX, 238 - barHeight, 26, barHeight, 8);
      ctx.fill();
      text(
        ctx,
        ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i],
        barX - 2,
        258,
        10,
        C.muted,
        500,
      );
    });

    // ── Panels ────────────────────────────────────────────────────────────
    ctx.fillStyle = "#FCFBFF";
    ctx.strokeStyle = C.border;
    rr(ctx, 68, 314, 330, 370);
    rr(ctx, 422, 314, 698, 370);

    // Leaderboard
    text(ctx, "LEADERBOARD", 94, 350, 13, C.muted, 600);
    text(ctx, `#${data.leaderboard.rank}`, 94, 418, 58, C.ink, 700);
    text(
      ctx,
      `Top ${data.leaderboard.percentile}%`,
      94,
      445,
      16,
      C.purple,
      600,
    );

    const rankMax = Math.max(...data.leaderboard.nearbyRanks, 1);
    data.leaderboard.nearbyRanks.forEach((v, i) => {
      const barHeight = 55 + (v / rankMax) * 130;
      const barX = 96 + i * 54;
      ctx.fillStyle = i === data.leaderboard.currentIndex ? C.coral : "#DDD6F3";
      ctx.beginPath();
      ctx.roundRect(barX, 642 - barHeight, 34, barHeight, 12);
      ctx.fill();
    });

    // Hours overview
    text(ctx, "HOURS OVERVIEW", 450, 350, 13, C.muted, 600);

    const hourRows: [string, number][] = [
      ["May", data.hours.monthlyMinutes],
      ["Weekly", data.hours.weeklyMinutes],
      ["Daily", data.hours.dailyMinutes],
      ["All Time", data.hours.allTimeMinutes],
    ];

    hourRows.forEach(([label, value], i) => {
      const colX = 450 + i * 162;
      text(ctx, label, colX, 384, 12, C.muted, 600);
      text(ctx, minutes(value), colX, 417, 24, C.ink, 700);
      if (i < 3) {
        ctx.strokeStyle = C.border;
        ctx.beginPath();
        ctx.moveTo(colX + 142, 365);
        ctx.lineTo(colX + 142, 425);
        ctx.stroke();
      }
    });

    // Rank transition
    text(ctx, "TO NEXT RANK GROUP", 450, 470, 12, C.muted, 600);

    // Current rank icon + name
    await drawRankIcon(ctx, data.rankTransition.current.icon, 450, 474, 48);
    text(ctx, data.rankTransition.current.name, 506, 503, 18, C.ink, 700);

    // Arrow — drawn manually (Poppins missing → glyph)
    ctx.strokeStyle = C.muted;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(620, 495);
    ctx.lineTo(644, 495);
    ctx.stroke();
    ctx.fillStyle = C.muted;
    ctx.beginPath();
    ctx.moveTo(644, 495);
    ctx.lineTo(636, 490);
    ctx.lineTo(636, 500);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1;

    // Next rank icon + name
    await drawRankIcon(ctx, data.rankTransition.next.icon, 656, 474, 48);
    text(ctx, data.rankTransition.next.name, 712, 503, 18, C.ink, 700);

    ctx.fillStyle = "#EAE5F5";
    ctx.beginPath();
    ctx.roundRect(450, 524, 590, 14, 7);
    ctx.fill();

    ctx.fillStyle = C.mint;
    ctx.beginPath();
    ctx.roundRect(450, 524, 590 * clamp(data.rankTransition.progress), 14, 7);
    ctx.fill();

    text(
      ctx,
      `${Math.round(data.rankTransition.progress * 100)}%`,
      1050,
      537,
      13,
      C.ink,
      700,
    );

    // Time breakdown
    const timeBreakdownItems: [string, number][] = [
      ["CAM HOURS", data.timeBreakdown.camMinutes],
      ["NON CAM HOURS", data.timeBreakdown.nonCamMinutes],
      ["OVERALL HOURS", data.timeBreakdown.overallMinutes],
    ];

    timeBreakdownItems.forEach(([label, value], i) => {
      const colX = 450 + i * 207;
      ctx.fillStyle = "#F5F2FC";
      ctx.strokeStyle = C.border;
      rr(ctx, colX, 566, 187, 88, 16);
      text(ctx, label, colX + 16, 592, 11, C.muted, 600);
      text(ctx, minutes(value), colX + 16, 630, 24, C.ink, 700);
    });

    const buffer = canvas.toBuffer("image/png");
    return { buffer, contentType: "image/png", filename: "rank-profile.png" };
  }
}

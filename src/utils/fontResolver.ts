import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * The profile cards strictly use Poppins Medium (500), SemiBold (600),
 * Bold (700), and ExtraBold (800). All italics, Thin, Light, and Black weights
 * are unused and pruned to minimize Resvg native fontdb memory footprint.
 */
export const REQUIRED_FONT_REGEX =
  /Poppins-(Medium|SemiBold|Bold|ExtraBold)\.ttf$/;

let cachedFontFiles: string[] | null = null;

export function resolveRequiredFonts(): string[] {
  if (cachedFontFiles) {
    return cachedFontFiles;
  }

  const candidateDirs = [
    join(process.cwd(), "src", "assets", "fonts"),
    join(process.cwd(), "dist", "assets", "fonts"),
    join(__dirname, "..", "assets", "fonts"),
    join(__dirname, "..", "..", "src", "assets", "fonts"),
  ];

  for (const dir of candidateDirs) {
    if (existsSync(dir)) {
      const files = readdirSync(dir)
        .filter((file) => REQUIRED_FONT_REGEX.test(file))
        .map((file) => join(dir, file));

      if (files.length > 0) {
        cachedFontFiles = files;
        return files;
      }
    }
  }

  return [];
}

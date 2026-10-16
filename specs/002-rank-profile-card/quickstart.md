# Quickstart: Discord Rank Profile Card

## Prerequisites

- Node.js LTS and npm
- Docker for container verification
- Four local Poppins TTF files (400, 500, 600, 700) placed in `src/rank-profile/assets/fonts/`
- Approved local PNG/SVG icons, badge assets, and optional background assets placed under their respective `assets/` folders

## Local setup

1. Install the package dependencies defined by the implementation.
2. Copy the approved fonts and visual assets into the asset folders; do not configure remote icon URLs.
3. Run the automated test suite.
4. Run the sample-render script. It uses `tests/fixtures/rankProfile.sample.ts` and writes `artifacts/rank-profile-sample.png` for visual review.
5. Start the Fastify server and send the sample contract payload to `POST /v1/rank-profile/render`. Confirm the response headers identify `rank-profile.png` and save/open the bytes as PNG.

## Discord bot use

Instantiate or import the renderer from `src/rank-profile` in the bot process, fetch/prepare analytics in bot-owned code, and pass only the completed input to `render`. Attach the returned buffer using its returned filename and content type. Do not make the renderer fetch Discord data.

## Docker verification

1. Build the Docker image.
2. Run it with a read-only asset directory available in the image and the HTTP port published.
3. Repeat the sample request and verify the output is a 1200 × 760 PNG.
4. Run 100 local representative render attempts and confirm all responses succeed.

## Visual review checklist

- Primary name, rank, all-time hours, and rank-progress percentage are readable at embed size.
- The pale cream/lavender background, white card, panel borders, and soft shadows remain subtle.
- Coral is chiefly used for activity bars; other accents stay restrained.
- Missing avatar and zero-activity variants remain balanced.
- No label, pill, value, or bar crosses its panel boundary.

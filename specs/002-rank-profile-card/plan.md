# Implementation Plan: Discord Rank Profile Card

**Branch**: `001-rank-profile-card` | **Date**: 2026-06-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-rank-profile-card/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Deliver a Docker-deployable Fastify image service that validates one Discord member's rank-profile analytics payload, renders a fixed 1200 × 760 premium dashboard card, and returns `rank-profile.png`. The rendering core remains a typed, side-effect-contained module that can be called directly from discord.js or through the HTTP API. It uses local Poppins fonts and approved local visual assets, bounded remote-avatar retrieval, reusable Canvas drawing components, and Sharp only as an optional final PNG optimization step.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: Node.js LTS with TypeScript (strict mode)

**Primary Dependencies**: Fastify, @napi-rs/canvas, Sharp, Zod, discord.js; Vitest for automated checks

**Storage**: N/A; local read-only font and image assets only

**Testing**: Vitest unit tests; Fastify injection contract tests; sample-render visual smoke check

**Target Platform**: Linux Docker container; HTTP callers and discord.js consumers

**Project Type**: Single TypeScript web service with a reusable rendering module

**Performance Goals**: Render the representative 1200 × 760 card within 1 second locally after warm-up; 100 consecutive representative renders return valid PNGs

**Constraints**: Fixed layout only; local approved icon assets; no database or Discord API calls inside the renderer; no arbitrary section coordinates; avatar fetch timeout 3 seconds and payload limit 5 MiB; retain no avatar data after rendering; no avatar URLs in logs

**Scale/Scope**: One fixed rank-profile card, one render route, one direct TypeScript entry point, four bundled Poppins weights, seven activity days, up to three badges, and five rank bars

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The current constitution is an uncustomized template and defines no enforceable gates. The design applies these provisional quality gates: strict typing, schema validation at ingress, unit coverage for every specified utility, no remote icon assets, and no renderer-owned database/Discord I/O.

**Pre-design result: PASS.** The planned module boundary isolates business data retrieval from rendering and avoids unnecessary persistence or template systems.

## Project Structure

### Documentation (this feature)

```text
specs/002-rank-profile-card/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
src/
├── app.ts                         # Fastify assembly and route registration
├── server.ts                      # HTTP process bootstrap
├── rank-profile/
│   ├── RankProfileCardRenderer.ts
│   ├── rankProfile.types.ts
│   ├── rankProfile.layout.ts       # All section geometry and spacing tokens
│   ├── rankProfile.theme.ts
│   ├── rankProfile.schema.ts
│   ├── sections/
│   │   ├── drawBackground.ts
│   │   ├── drawIdentityHeader.ts
│   │   ├── drawAchievementSummary.ts
│   │   ├── drawActivityChart.ts
│   │   ├── drawLeaderboardPanel.ts
│   │   ├── drawHoursOverview.ts
│   │   └── drawTimeBreakdown.ts
│   ├── components/
│   │   ├── drawPanel.ts
│   │   ├── drawText.ts
│   │   ├── drawAvatar.ts
│   │   ├── drawIcon.ts
│   │   ├── drawPill.ts
│   │   ├── drawMetric.ts
│   │   ├── drawDivider.ts
│   │   ├── drawProgressBar.ts
│   │   ├── drawBarChart.ts
│   │   ├── drawRankBars.ts
│   │   └── canvasUtils.ts
│   ├── badge-rules/
│   │   ├── badgeDefinitions.ts
│   │   └── getEligibleBadges.ts
│   └── assets/
│       ├── fonts/
│       ├── icons/
│       ├── badges/
│       └── backgrounds/
└── scripts/
    └── render-rank-profile-sample.ts

tests/
├── unit/
│   └── rank-profile/
├── contract/
│   └── rank-profile-render.test.ts
└── fixtures/
    └── rankProfile.sample.ts

Dockerfile
```

**Structure Decision**: Use a single service. `src/rank-profile` is independently callable and does not import Fastify or discord.js. `src/app.ts` adapts the validated HTTP request to the renderer. A Discord bot imports the renderer or a small local client adapter; it is not run inside this image service.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |

## Post-Design Constitution Check

**Result: PASS.** `research.md`, `data-model.md`, the HTTP contract, and quickstart preserve the provisional gates. No storage, generic templating engine, or renderer-level Discord/database integration is introduced.

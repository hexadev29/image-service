# Tasks: Discord Rank Profile Card

**Input**: Design documents from `/specs/002-rank-profile-card/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/rank-profile-render.md, quickstart.md

**Tests**: Required by FR-020; write them before the matching implementation.

## Phase 1: Setup

- [ ] T001 Create Node/TypeScript project configuration and scripts in `package.json`, `tsconfig.json`, and `vitest.config.ts`
- [ ] T002 [P] Create Node/Docker ignore rules in `.gitignore` and `.dockerignore`
- [ ] T003 [P] Create service Docker image definition in `Dockerfile`
- [ ] T004 Create planned source, asset, test, fixture, and script directories under `src/`, `tests/`, and `artifacts/`

## Phase 2: Foundational

- [ ] T005 Define shared input/output and layout types in `src/rank-profile/rankProfile.types.ts`
- [ ] T006 Implement Zod ingress validation and normalization in `src/rank-profile/rankProfile.schema.ts`
- [ ] T007 [P] Define palette, typography, and radius tokens in `src/rank-profile/rankProfile.theme.ts`
- [ ] T008 [P] Define all canvas and section geometry in `src/rank-profile/rankProfile.layout.ts`
- [ ] T009 Implement font registration, formatting, clamping, ellipsis, and safe local asset caching utilities in `src/rank-profile/components/canvasUtils.ts`
- [ ] T010 Implement local icon manifest and safe icon drawing in `src/rank-profile/components/drawIcon.ts`
- [ ] T011 Create deterministic sample payload in `tests/fixtures/rankProfile.sample.ts`

**Checkpoint**: Validated normalized data and shared visual primitives are ready.

## Phase 3: User Story 1 - Generate a rank profile card (Priority: P1) 🎯 MVP

**Goal**: Produce a polished fixed-layout PNG card from valid profile analytics data.

**Independent Test**: Submit the sample contract payload and verify a 1200 × 760 `rank-profile.png` response with all required regions.

- [ ] T012 [P] [US1] Write formatting, activity normalization, progress clamping, and ellipsis tests in `tests/unit/rank-profile/canvasUtils.test.ts`
- [ ] T013 [P] [US1] Write PNG API contract test in `tests/contract/rank-profile-render.test.ts`
- [ ] T014 [P] [US1] Implement rounded panel, divider, and progress-bar components in `src/rank-profile/components/drawPanel.ts`, `drawDivider.ts`, and `drawProgressBar.ts`
- [ ] T015 [P] [US1] Implement text, metric, pill, bar-chart, and rank-bar components in `src/rank-profile/components/drawText.ts`, `drawMetric.ts`, `drawPill.ts`, `drawBarChart.ts`, and `drawRankBars.ts`
- [ ] T016 [P] [US1] Implement background and identity/summary/activity sections in `src/rank-profile/sections/drawBackground.ts`, `drawIdentityHeader.ts`, `drawAchievementSummary.ts`, and `drawActivityChart.ts`
- [ ] T017 [P] [US1] Implement leaderboard and hours/time sections in `src/rank-profile/sections/drawLeaderboardPanel.ts`, `drawHoursOverview.ts`, and `drawTimeBreakdown.ts`
- [ ] T018 [US1] Implement ordered badge registry and pure eligibility evaluation in `src/rank-profile/badge-rules/badgeDefinitions.ts` and `getEligibleBadges.ts`
- [ ] T019 [US1] Implement canvas orchestration and PNG result in `src/rank-profile/RankProfileCardRenderer.ts`
- [ ] T020 [US1] Implement Fastify render route and server assembly in `src/app.ts` and `src/server.ts`

## Phase 4: User Story 2 - Render trustworthy data and graceful fallbacks (Priority: P2)

**Goal**: Return a stable card for unavailable avatars, zero/missing activity, long names, and invalid numeric inputs.

**Independent Test**: Render all five resilience variants and verify every result is a PNG with bounded primary text.

- [ ] T021 [P] [US2] Write normalization and failure-fallback tests in `tests/unit/rank-profile/rankProfile.schema.test.ts` and `tests/unit/rank-profile/avatar.test.ts`
- [ ] T022 [US2] Implement bounded avatar fetch/decode, circular crop, and fallback drawing in `src/rank-profile/components/drawAvatar.ts`
- [ ] T023 [US2] Add resilient avatar, zero-data, and long-label handling to `src/rank-profile/RankProfileCardRenderer.ts` and dependent sections
- [ ] T024 [US2] Add safe HTTP errors and payload limit handling in `src/app.ts`

## Phase 5: User Story 3 - Display earned achievements consistently (Priority: P3)

**Goal**: Display the highest-priority eligible badges while keeping eligibility independent of rendering.

**Independent Test**: Evaluate representative badge contexts and verify a maximum of three priority-sorted pills are rendered.

- [ ] T025 [P] [US3] Write deterministic badge eligibility tests in `tests/unit/rank-profile/getEligibleBadges.test.ts`
- [ ] T026 [US3] Integrate the first three eligible badges into `src/rank-profile/sections/drawIdentityHeader.ts`

## Phase 6: Polish and verification

- [ ] T027 [P] Add local sample-image writer in `src/scripts/render-rank-profile-sample.ts`
- [ ] T028 [P] Add approved placeholder icon, badge, background, and Poppins asset guidance in `src/rank-profile/assets/README.md`
- [ ] T029 Run lint, typecheck, test, sample-render, and Docker build verification; record results in `specs/002-rank-profile-card/quickstart.md`

## Dependencies & Execution Order

- Setup → Foundational → US1 (MVP) → US2 → US3 → Polish.
- US1 requires T005–T011. US2 depends on the renderer from US1. US3's pure badge logic is implemented in US1 so only its rendering integration follows US1.
- Parallel tasks are marked `[P]`; they touch distinct files after their prerequisite types exist.

## Parallel Examples

- After T005: run T007, T008, and T011 concurrently.
- After T009–T011: run T012–T017 concurrently by file group.
- After T019: run T021 and T025 concurrently.

## Implementation Strategy

Build and validate the direct renderer plus HTTP contract first (US1). Then make untrusted avatar and malformed-data handling robust (US2), followed by independently tested badge rules and their header integration (US3). Finish by producing the local visual-review asset and container verification.

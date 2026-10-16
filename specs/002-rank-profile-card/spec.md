# Feature Specification: Discord Rank Profile Card

**Feature Branch**: `001-rank-profile-card`

**Created**: 2026-06-23

**Status**: Draft

**Input**: User description: "Build a polished rank/profile analytics card image service for a Discord bot."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate a rank profile card (Priority: P1)

A Discord bot can supply one member's profile and analytics data and receive a polished PNG rank card suitable for attaching to an embed.

**Why this priority**: This is the primary user-visible capability; without a correct, readable card the feature provides no value.

**Independent Test**: Provide a complete valid profile payload and verify that the returned attachment is a PNG named `rank-profile.png`, has the requested card dimensions, and visibly contains all required profile areas.

**Acceptance Scenarios**:

1. **Given** a valid member profile, summary, activity, leaderboard, rank-progress, and time-breakdown payload, **When** the bot requests a profile card, **Then** it receives one 1200 by 760 pixel PNG attachment named `rank-profile.png`.
2. **Given** a valid payload, **When** the card is generated, **Then** it presents the member identity, up to three earned achievements, the three summary counters, seven-day activity, leaderboard status, hours overview, next-rank progress, and time breakdown in the defined visual hierarchy.
3. **Given** the returned card is displayed as a Discord embed image, **When** a viewer opens the embed, **Then** primary identity, rank, key hour values, and progress information remain legible without opening the full-size image.

---

### User Story 2 - Render trustworthy data and graceful fallbacks (Priority: P2)

A Discord bot can render a card even when optional media or optional descriptive data is unavailable, while ensuring invalid numeric inputs do not produce misleading negative values or broken visuals.

**Why this priority**: Discord profile data and remote avatars are imperfect in normal operation; a failed image should not prevent the bot command from succeeding.

**Independent Test**: Render payloads with an unavailable avatar, missing activity days, zero activity, long names, omitted subtitle, and negative numeric values; confirm an image is returned with safe, readable fallbacks.

**Acceptance Scenarios**:

1. **Given** an avatar cannot be retrieved or decoded, **When** the card is generated, **Then** a default avatar placeholder is shown and the image is still returned.
2. **Given** fewer than seven activity values are supplied, **When** the card is generated, **Then** the missing days are shown as zero activity across a seven-day display.
3. **Given** all activity is zero, **When** the card is generated, **Then** the activity area remains clearly labeled and visually stable without invalid bars or labels.
4. **Given** a display name exceeds the available header space, **When** the card is generated, **Then** the visible name is safely shortened without overlapping nearby content.
5. **Given** negative counts or durations are supplied, **When** the card is generated, **Then** they are treated as zero in the returned card.

---

### User Story 3 - Display earned achievements consistently (Priority: P3)

A bot can show the member's most relevant earned achievements without embedding achievement business rules in card layout code.

**Why this priority**: Achievement visibility makes the card more motivating, while separation allows achievement rules to evolve independently from the visual design.

**Independent Test**: Evaluate achievement eligibility for representative member contexts and verify that the card displays no more than the three highest-priority eligible achievements.

**Acceptance Scenarios**:

1. **Given** a member qualifies for more than three achievements, **When** a card is generated, **Then** only the three highest-priority achievements appear beneath the identity.
2. **Given** a member qualifies for no achievements, **When** a card is generated, **Then** the header remains balanced and does not show empty achievement placeholders.
3. **Given** the same member context is evaluated repeatedly, **When** eligibility is determined, **Then** the same eligible achievement set and ordering are produced.

### Edge Cases

- An absent optional subtitle must not leave an empty-looking header gap or overlap achievement pills.
- A name containing emoji, mixed scripts, or unsupported glyphs must still produce a readable, bounded identity label.
- Extremely large counts and durations must use locale-aware compact, readable formatting without clipping their assigned cells.
- Zero, missing, or uneven nearby-rank values must still result in five baseline-aligned leaderboard bars with the current member clearly distinguished.
- Progress values below zero or above the completed threshold must render as the nearest valid endpoint.
- Optional local background imagery being absent or unreadable must preserve the soft dashboard card appearance.
- Unrecognized icon or badge identifiers must use a safe local fallback and never cause an arbitrary local file to be loaded.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST produce exactly one PNG profile-card attachment for each accepted profile-card request, named `rank-profile.png` and identified as an image PNG.
- **FR-002**: The generated card MUST be 1200 by 760 pixels and retain a legible hierarchy when viewed as a Discord embed image.
- **FR-003**: The card MUST use a pale warm-white and light-lavender background, a large inset white outer card, rounded white panels, subtle borders, soft lavender shadows, and restrained pastel accents.
- **FR-004**: The header MUST show a circular member avatar, display name, optional subtitle, and up to three earned achievement pills.
- **FR-005**: The header MUST show three evenly spaced summary metrics for achievements, goals, and milestones, each paired with a recognizable icon.
- **FR-006**: The header MUST include a labeled Mon-to-Sun activity chart that represents seven daily values, uses a muted coral accent for activity bars, and preserves a valid zero-data display.
- **FR-007**: The body MUST include a leaderboard panel showing its label, the member's rank, percentile, and exactly five rounded nearby-rank bars sharing a baseline; the member's bar MUST be visually distinct.
- **FR-008**: The body MUST include an hours-overview panel with monthly, weekly, daily, and all-time values; the four values MUST remain individually distinguishable.
- **FR-009**: The hours-overview panel MUST present current and next rank groups, a bounded progress visualization, and a percentage label.
- **FR-010**: The card MUST include a time-breakdown area containing Cam Hours, Non Cam Hours, and Overall Hours, with each duration formatted for rapid reading and percentages shown where applicable.
- **FR-011**: The system MUST accept only validated profile-card data and normalize it before rendering; invalid negative numeric inputs MUST display as zero, progress MUST be limited to the inclusive 0%–100% range, and activity MUST always render as seven values.
- **FR-012**: The system MUST format counts using the active locale's number conventions and durations using compact hour/minute forms, including hour-only values for whole-hour durations and hour-and-minute values when minutes remain.
- **FR-013**: The system MUST safely constrain display names and other bounded labels so they do not overlap, overflow, or destabilize the layout.
- **FR-014**: The system MUST retrieve an optional avatar within bounded time and data-size limits; if it cannot be safely used, it MUST show a default placeholder without exposing the member's avatar address in logs or output.
- **FR-015**: The system MUST use only approved bundled visual assets for icons, badges, and optional backgrounds, and MUST reject unknown asset identifiers rather than resolving caller-provided file paths or external icon locations.
- **FR-016**: Achievement definitions MUST be maintained in one ordered registry containing an identifier, visible label, icon, priority, and eligibility rule.
- **FR-017**: Achievement eligibility evaluation MUST be deterministic, free of rendering side effects, and independently verifiable; card rendering MUST consume the resulting eligible achievements rather than deciding eligibility itself.
- **FR-018**: Repeated rendering MUST reuse previously prepared local visual resources where possible without changing the rendered result.
- **FR-019**: The delivered feature MUST include a representative sample input and a repeatable local visual-inspection workflow that writes the sample card image for review.
- **FR-020**: The delivered feature MUST include automated checks covering duration formatting, seven-day activity normalization, progress bounds, achievement eligibility, and truncation of long names.

### Key Entities

- **Rank Profile Card Data**: The complete validated input for one member's card, including identity, optional avatar and subtitle, summary counts, activity values, leaderboard context, rank transition, time totals, and achievement context.
- **Activity Day**: One labeled daily activity duration used in the fixed seven-day chart.
- **Leaderboard Context**: The member's visible rank, percentile, and five nearby-ranking values used to show relative position.
- **Rank Transition**: The current and next rank groups together with advancement progress.
- **Time Breakdown**: Cam, non-cam, and overall durations plus relevant percentages.
- **Achievement Definition**: A prioritized, user-visible achievement and its deterministic eligibility rule.
- **Eligible Achievement**: An achievement definition that matches a member's supplied achievement context.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A valid representative payload produces one correctly named 1200 by 760 PNG card in 100% of 100 consecutive local rendering attempts.
- **SC-002**: In a visual review at Discord embed size, 10 of 10 reviewers can correctly identify the member name, displayed rank, all-time hours, and next-rank percentage within 10 seconds.
- **SC-003**: All five defined resilience cases (unavailable avatar, fewer than seven activity days, zero activity, overly long name, and negative numeric values) return a valid PNG without clipped primary content in automated verification.
- **SC-004**: For each of 20 representative achievement contexts, the displayed achievement set matches the ordered eligible set, capped at three items.
- **SC-005**: All required automated checks for formatting, normalization, progress bounds, achievement eligibility, and name truncation pass before release.

## Assumptions

- The Discord bot obtains member analytics and permission-relevant data before requesting a card; this feature does not query Discord, databases, or other business systems.
- Input durations are expressed in minutes and summary quantities are non-negative whole-number concepts after normalization.
- A supplied avatar is optional and may be ignored when unavailable, oversized, slow, or unsuitable for safe image use.
- The initial card supports one fixed premium dashboard layout rather than user-configurable templates or theme selection.
- The application provides bundled approved visual assets and suitable font resources at deployment time.
- The active deployment locale is used for number formatting unless a caller later adds an explicit locale preference.

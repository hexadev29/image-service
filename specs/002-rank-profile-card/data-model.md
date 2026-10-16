# Data Model: Discord Rank Profile Card

## Ingress model

`RankProfileCardInput` is the public JSON request/direct-call shape. The Zod schema transforms it to `RankProfileCardData`, the normalized renderer input.

| Entity | Fields | Validation and normalization |
|---|---|---|
| `ProfileIdentity` | `displayName`, `subtitle?`, `avatarUrl?` | Display name required and bounded before drawing; subtitle optional and bounded; avatar URL optional, must use HTTP(S) when present. |
| `AchievementContext` | `achievements`, `goals`, `milestones`, optional contextual totals | All numeric values become finite non-negative integers. It is used by pure badge eligibility only. |
| `ActivitySeries` | `days` | Accept 0–7 supplied minute values; coerce each to finite non-negative integer; right-pad to exactly seven Mon–Sun values. |
| `Leaderboard` | `rank`, `percentile`, `nearbyRanks`, `currentIndex` | Rank is at least 1; percentile is `[0, 100]`; normalize values to exactly five non-negative entries; current index identifies the accent bar. |
| `HoursOverview` | `monthlyMinutes`, `weeklyMinutes`, `dailyMinutes`, `allTimeMinutes` | Finite non-negative integer minutes. |
| `RankTransition` | `current`, `next`, `progress` | Current/next have approved rank icon names and bounded labels; progress is clamped to `[0, 1]`. |
| `TimeBreakdown` | `camMinutes`, `nonCamMinutes`, `overallMinutes`, `camPercent?`, `nonCamPercent?` | Minute values are finite non-negative integers; optional percentages are clamped to `[0, 100]`. |

## Derived view data

| Derived value | Source | Rule |
|---|---|---|
| `eligibleBadges` | `AchievementContext` | Pure registry evaluation; sort by descending priority with stable ID tie-breaker; header takes the first three. |
| `activityMax` | seven normalized day values | Maximum value; use a zero-safe baseline when every value is zero. |
| `rankBarHeights` | five normalized nearby ranks | Scale each against the largest positive rank value; retain shared baseline and minimum visual height. |
| `formattedDuration` | minute values | Whole hours show `321h`; sub-100-hour durations with minutes show padded hour/minute form such as `08h 11m`; larger values use grouped hours such as `1,937h 50m`. |
| `formattedCount` | counters | Use `Intl.NumberFormat` with configured/default locale. |
| `truncatedLabel` | display and section labels | Fit measured text inside assigned layout bounds using ellipsis; optionally reduce font only to configured minimum. |

## Lifecycle

1. An adapter receives JSON or a typed direct-call object.
2. The schema parses, coerces, and normalizes it into `RankProfileCardData`; malformed non-coercible payloads are rejected before rendering.
3. The renderer obtains eligible badges and preloads safe local resources.
4. Remote avatar use is attempted within its safety bounds; it never mutates input or persistent state.
5. The renderer returns a PNG attachment result. No request/profile data is persisted.

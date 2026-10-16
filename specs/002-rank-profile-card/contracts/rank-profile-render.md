# Rank Profile Render API Contract

## POST `/v1/rank-profile/render`

Renders one fixed-layout Discord rank profile card.

### Request

- Content type: `application/json`
- Body: `RankProfileCardInput`

```json
{
  "identity": {
    "displayName": "Avery Chen",
    "subtitle": "Focus session champion",
    "avatarUrl": "https://cdn.example.test/avatar.png"
  },
  "summary": { "achievements": 32, "goals": 18, "milestones": 7 },
  "activity": { "days": [120, 210, 90, 300, 180, 240, 75] },
  "leaderboard": { "rank": 1, "percentile": 1, "nearbyRanks": [64, 82, 100, 72, 56], "currentIndex": 2 },
  "hours": { "monthlyMinutes": 19260, "weeklyMinutes": 4680, "dailyMinutes": 491, "allTimeMinutes": 116270 },
  "rankTransition": { "current": { "name": "Gold", "icon": "rank-gold" }, "next": { "name": "Platinum", "icon": "rank-platinum" }, "progress": 0.72 },
  "timeBreakdown": { "camMinutes": 4680, "nonCamMinutes": 1440, "overallMinutes": 6120, "camPercent": 76.5, "nonCamPercent": 23.5 },
  "badgeContext": { "achievements": 32, "goals": 18, "milestones": 7, "isHallOfFame": true, "isWinner": false }
}
```

### Success response

- Status: `200 OK`
- Content type: `image/png`
- `Content-Disposition`: `inline; filename=rank-profile.png`
- Body: PNG bytes for a 1200 × 760 card

### Error responses

| Status | Body | Meaning |
|---|---|---|
| `400` | `{ "error": "invalid_rank_profile_data", "issues": [...] }` | The request cannot be parsed into valid profile card data. |
| `413` | `{ "error": "payload_too_large" }` | The HTTP request body exceeds the configured safe API limit. |
| `500` | `{ "error": "render_failed" }` | An unexpected local rendering failure occurred. Never include avatar URLs or input values in this response. |

## Direct TypeScript contract

```ts
interface RankProfileCardRenderer {
  render(input: RankProfileCardInput): Promise<{
    buffer: Buffer;
    contentType: 'image/png';
    filename: 'rank-profile.png';
  }>;
}
```

The direct method validates the same input shape and never queries Discord, a database, or other business services.

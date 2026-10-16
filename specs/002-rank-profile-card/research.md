# Research: Discord Rank Profile Card

## Decisions

### Fixed-layout renderer boundary

- **Decision**: Implement one `RankProfileCardRenderer` class with a `render(data)` method returning `{ buffer, contentType, filename }`. Keep Fastify and discord.js outside this module.
- **Rationale**: A direct callable renderer satisfies bot integration while the Fastify adapter makes the Docker service independently consumable. The fixed layout matches the requested card and avoids the scope and security cost of a generic template system.
- **Alternatives considered**: A Discord-command handler would couple rendering to bot lifecycle and data retrieval; a generic template registry would expand scope and undermine visual consistency.

### Validation and normalization boundary

- **Decision**: Parse the HTTP/body or direct-call input with one Zod schema, then return a normalized typed object. Coerce finite numeric-like values, clamp negative values to zero, clamp progress to `[0, 1]`, and normalize activity to exactly seven values.
- **Rationale**: Every drawing function receives safe values and needs no duplicated defensive checks.
- **Alternatives considered**: Validating in individual sections causes inconsistent fallbacks; rejecting every negative value would conflict with the required safe clamping behavior.

### Geometry and typography

- **Decision**: Place all absolute rectangles, section boundaries, and spacing tokens in `rankProfile.layout.ts`; use an 8-pixel scale and 18–24-pixel panel radii. Register Poppins Regular (400), Medium (500), SemiBold (600), and Bold (700) once during renderer initialization.
- **Rationale**: It preserves a cohesive card and makes visual tuning safe without hidden coordinates in drawing functions.
- **Alternatives considered**: Per-section literal coordinates make changes brittle; system fonts do not guarantee visual consistency across Docker and developer machines.

### Local assets and decoded-image caching

- **Decision**: Define a typed icon manifest mapping known icon names to files below `assets/icons`. Decode/cache approved icons and optional backgrounds once per process. Load badge artwork only through an equivalent typed registry.
- **Rationale**: This prevents caller-controlled path traversal, avoids external icon availability, and removes repeated decode work.
- **Alternatives considered**: Arbitrary string paths expose filesystem risk; external icon URLs add latency and reliability failures.

### Avatar safety

- **Decision**: Fetch only optional `http`/`https` avatar URLs with a 3-second abort signal, redirect disabled, a 5 MiB streamed byte limit, and a content-type allow-list for PNG/JPEG/WebP. Decode only after these checks; on any failure draw a deterministic local placeholder.
- **Rationale**: Avatar content is untrusted remote input. The card remains available without retaining or logging sensitive URL data.
- **Alternatives considered**: Unbounded `fetch` risks slow or oversized inputs; using a remote default avatar violates the local-asset rule.

### PNG production and response behavior

- **Decision**: Create the card with @napi-rs/canvas and export PNG bytes. Pass the result through Sharp only when it reduces output size without changing dimensions, alpha, or visual fidelity; otherwise return the Canvas bytes. Fastify writes raw bytes with `Content-Type: image/png` and `Content-Disposition: inline; filename=rank-profile.png`.
- **Rationale**: Canvas owns drawing; Sharp remains an optional output concern as requested.
- **Alternatives considered**: Making Sharp part of visual composition duplicates responsibilities; JSON/base64 output makes Discord attachment use less direct.

### Badge eligibility

- **Decision**: Keep badge definitions in one typed priority-sorted registry. `getEligibleBadges(context)` is pure, returns only eligible entries, and caps rendering to the first three in the header section.
- **Rationale**: Tests can assert eligibility independently and the renderer cannot accidentally become the business-rules owner.
- **Alternatives considered**: Inline conditions in `drawIdentityHeader` conflate policy and presentation.

### Testing and inspection

- **Decision**: Use Vitest for unit tests of formatting, activity normalization, progress clamping, eligible badges, and text ellipsis. Use Fastify `inject` for the render endpoint and add a script that writes a deterministic fixture output under a local ignored `artifacts/` directory.
- **Rationale**: It proves the specified boundaries and gives a repeatable visual-review artifact without requiring Discord or a database.
- **Alternatives considered**: End-to-end Discord tests are outside the service boundary; only screenshot review misses edge-case correctness.

## Resolved Planning Questions

All technical-context choices are resolved. Production dependency versions will be pinned to mutually compatible current stable releases when the project manifest is created; version pinning is an implementation task, not a design uncertainty.

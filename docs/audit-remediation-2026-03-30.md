# Audit Remediation Tracker

Date: 2026-03-30
Source: `docs/codex-review-prompt.md`
Status: implemented and fully verified

## Scope

This document captures the findings from the full Marin Monitor audit and tracks the remediation work so implementation can proceed without losing context.

## Priority Queue

### P0

- [x] Fix `/api/health` broken identifier usage and restore clean typing.
- [x] Fix map feature click typing so coffee and fitness layers compile cleanly.

### P1

- [x] Initialize coffee and fitness map layers correctly.
- [x] Remove config drift in `scripts/sync-cappuccino.mjs`.
- [x] Consolidate grocery basket product matching so server and Actions use the same logic.
- [x] Fix false freshness reporting caused by fallback writes with fresh timestamps.
- [x] Fix composite live-source accounting for housing.
- [x] Remove hardcoded activity-parser years and date fallbacks where practical.
- [x] Reduce operational information disclosure in health/proxy surfaces.

### P2

- [x] Clear current `svelte-check` errors in the new panels.
- [x] Update docs that drifted from the implementation.
- [x] Consolidate duplicated script helpers where the change is low-risk.

### P3

- [x] Revisit larger structural improvements such as `SignalDeck.svelte` composition after the functional fixes are landed.

## Findings

### Critical

1. `src/routes/api/health/+server.ts`
   Problem: `_DATA_SOURCES` is exported, but `GET` references `DATA_SOURCES`, which breaks type-checking and likely the endpoint itself.
   Fix: unify the identifier and re-check the endpoint output.

### Important

1. `src/lib/components/panels/MapPanel.svelte`
   Problem: feature click typing omits `coffee-shop` and `fitness-studio`, but `MapDataLayer` emits them.
   Fix: move both sides to a shared feature-inspector type.

2. `src/lib/stores/map.ts`
   Problem: `coffee` and `fitness` are not part of the initial active layer set.
   Fix: seed those layers in initial map state.

3. `scripts/sync-cappuccino.mjs`
   Problem: the script duplicates coffee shop config and is missing Red Whale.
   Fix: source shop definitions from shared code or generate from config.

4. `src/lib/server/scrapers/grocery-basket.ts`
   Problem: matching logic diverged from `scripts/sync-grocery-basket.mjs`, so server and Actions can resolve different products.
   Fix: extract one shared scorer and use it from both paths.

5. `scripts/sync-ikon-pass.mjs`
   Problem: failed scrapes still emit fresh snapshots, which can make fallback data appear healthy.
   Fix: preserve scrape outcome metadata separately from write timestamp and teach health checks to use it.

6. `src/lib/server/scrapers/composite.ts`
   Problem: housing is always marked `live`, even when falling back to defaults.
   Fix: gate housing source metadata the same way as the other dynamic inputs.

7. `src/lib/server/scrapers/activity.ts`
   Problem: recent parser additions hardcode `2025`/`2026` dates and URLs.
   Fix: derive season years from `now` or parsed content.

8. `src/routes/api/health/+server.ts`, `scripts/scrape-proxy.mjs`
   Problem: health/proxy surfaces expose operational detail more broadly than needed.
   Fix: split public/private health concerns, redact debug details, and require auth on the proxy health path.

### Minor

1. `src/lib/components/panels/CappuccinoPanel.svelte`
   Problem: nullable `lastWeek` access fails `svelte-check`.
   Fix: guard access before dereferencing.

2. `src/lib/components/panels/SchoolTuitionPanel.svelte`
   Problem: unused import.
   Fix: remove it.

3. `src/lib/components/panels/FitnessPanel.svelte`
   Problem: unused import.
   Fix: remove it.

4. `src/lib/components/panels/DrivewayPanel.svelte`
   Problem: unused derived value.
   Fix: remove it.

5. `src/lib/components/panels/CompositePanel.svelte`
   Problem: unused type import.
   Fix: remove it.

6. `CLAUDE.md`, `docs/marin-indices.md`, `CHANGELOG.md`
   Problem: map-layer and coffee-count docs drifted from the implementation.
   Fix: update to match current behavior.

### Suggestions

1. `src/lib/components/dashboard/SignalDeck.svelte`
   Suggestion: move toward a registry-driven layout rather than a growing manual switchboard.

2. `scripts/*.mjs`
   Suggestion: centralize shared helpers such as `proxyFetch` into a script utility module.

## Verification Targets

- `npm run check`
- `npm run test:unit`
- `npm run build`

## Verification Results

- `npm run check`: passed with `0` errors and `0` warnings.
- `npm run test:unit`: passed with `36` files and `406` tests.
- `npm run build`: passed with clean `adapter-vercel` output and no residual dependency warnings.

## Residual Follow-up

- Array-backed feeds such as housing, activity, and police logs still use blob upload time for freshness by design; if those need source-level freshness semantics later, they will need embedded metadata instead of upload-time monitoring.

## Progress Log

- 2026-03-30: tracker created from the audit findings; implementation work started.
- 2026-03-30: health endpoint, map typing, layer initialization, config drift, grocery matching, composite source accounting, activity date handling, and proxy hardening fixes implemented.
- 2026-03-30: panel cleanup, docs refresh, shared script helper extraction, and `SignalDeck.svelte` simplification completed.
- 2026-03-30: `+page.svelte`, `TownPicker`, `LayoutEditMode`, and chart accessibility cleanup completed; `svelte-check` now passes with zero warnings.
- 2026-03-30: fallback-backed composite input scrapers now emit `lastSuccessfulScrapeAt` in addition to the legacy `lastLiveScrapeAt` field.
- 2026-03-30: object-backed scraper outputs and Strava blobs now standardize on `lastSuccessfulScrapeAt`, and health/freshness readers now prefer embedded freshness metadata over blob upload time where available.
- 2026-03-30: non-blocking build follow-up completed. `agentation` was removed from the production route tree, runtime scraper DOM parsing moved off `jsdom`, browser-only coffee scrape dependencies were moved out of production installs, and the dormant Vercel cappuccino sync route now returns an explicit GitHub-Actions-only response.

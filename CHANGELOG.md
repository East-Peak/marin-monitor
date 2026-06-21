# Changelog

All notable changes to Marin Monitor are documented here.

---

## 2026-06-21

### Internal — code-quality glow-up (phases 0–5, no behavior change)

- ESLint now ignores `.vercel/` build output; combined with type-error fixes and lint triage, `svelte-check` and `eslint` are both clean (0 errors) where lint previously reported 4,687 problems (4,626 of them noise from the unignored build dir).
- Repo-wide Prettier formatting pass (220 files). `static/data/` (generated) and `tests/fixtures/` (whitespace-sensitive parser fixtures) are now excluded from formatting.
- Fixed all 10 `svelte-check` type errors (test-file typing) and all 61 real ESLint issues; 1,170 unit tests green before and after.
- Added Vitest coverage tooling (`@vitest/coverage-v8`, `npm run coverage`).
- Removed dead code: two unused scripts (`build-boundaries`, `extract-housing` — its logic lives in the housing cron), the never-mounted `AgentationWidget` dev component + its orphaned `agentation`/`react-dom` deps; dropped dead exports/consts in map/nws/chart; declared the previously-undeclared `@eslint/js` + `playwright` deps. (Codex-verified — no production-reachable code removed.)
- Decomposed the two oversized data scripts (`extract-activity-feeds.mjs` 1,455→1,314; `strava-explore.mjs` 1,305→1,072) — extracted 35 pure helpers into tested ES modules (`scripts/lib/*-helpers.mjs`), adding **+155 unit tests** to scripts that previously had 0% coverage. No behavior change.
- Decomposed `MapDataLayer.svelte` (1,130→901) — extracted 16 pure feature-builder functions into `map-data.ts` with **+69 unit tests**; runtime-verified the map still renders every layer (news/activity/housing/311/gas/EV/coffee/fitness/earthquakes/segments/traffic). No reactive code touched.
- **Locked in deterministic gates:** a `verify` script (typecheck + lint + format-check + unit tests), a CI workflow (`.github/workflows/ci.yml` — `npm ci → verify → build` on push/PR, fails on violations), and a tiered `husky` + `lint-staged` pre-commit (format/lint staged files only). Test count over the whole glow-up: **1,170 → 1,394 green**.

---

## 2026-05-03

### Fixed

- `/api/data/*` blob-backed endpoints now return `503` with a structured error body (`{ error, message, timestamp, blobKey, upstreamStatus? }`) when the blob is missing, env is unset, or upstream fetch fails. Previously returned `200 OK` with an empty payload, so a misconfigured deployment looked like "Marin has no data" instead of an operational outage. 16 endpoints migrated to a single `serveBlobJson` / `tryReadBlobText` helper.
- Freshness pipeline no longer substitutes blob upload time for missing scrape metadata on live-scrape datasets. When `preferContent: true` and content lacks `lastSuccessfulScrapeAt` (or the fetch fails), `lastUpdated` is now `null` — so `/api/health` and the daily check-freshness cron correctly report stale data as stale instead of healthy.
- TV wallboard refresh cycle no longer reports success when individual fetchers fail. New `createDataFetcherWithStatus` factory returns tagged `{ ok, data } | { ok, error, fallback }` results; the wallboard collects per-source failures, preserves previous good data on error (instead of blanking with fallback), and passes the error list to `refresh.endRefresh()` so refresh history correctly shows degraded status during upstream outages.
- Weather no longer shows the wrong town on hydration. Server bootstrap is hardcoded to Central Marin coordinates; previously a user whose persisted town was Novato/Sausalito/etc. would see Central Marin weather indefinitely until something else triggered a live fetch. Bootstrap now declares its `locationId`, and the client fetches the user's actual location's weather on mount when the IDs differ.
- Weather fetch race fixed. Quick town switches or visibility-change + auto-refresh overlaps could let a slow earlier `fetchWeather()` overwrite a faster later one. Each call now captures a monotonic request ID via the new `createRequestGuard()` helper and only commits its result if it's still the latest.
- Auto-refresh toggle/interval changes now reschedule against the post-update store state. `toggleAutoRefresh(callback)` and `setAutoRefreshInterval(ms, callback)` previously called `setupAutoRefresh()` from inside the `update()` closure, which observed the pre-update state — so toggling off could leave the timer running and changing the interval could keep the old cadence.
- Main dashboard refresh now has an in-flight guard. Visibility-change + auto-refresh + manual refresh could overlap and double-fetch the same sources; only one cycle runs at a time now (matches TV mode's existing behavior).
- `staleWhileRevalidate` no longer defeats the circuit breaker. Background revalidation is now gated on `breaker.canRequest()`; when an upstream is down, stale-cache hits stop firing fresh retrying requests behind the scenes.
- `CircuitBreaker.getState()` is now a pure read. It previously called `canRequest()` internally, which transitions OPEN→HALF_OPEN once the reset timeout has elapsed — so a monitoring/debug read could silently consume the recovery window. Split into `peekCanRequest()` (status reads) and `canRequest()` (the real gate); only the latter still mutates.
- `CacheManager.invalidate(pattern)` actually honors the pattern now. Storage entries are written with their `originalKey` embedded; invalidation parses each entry and only removes those whose key matches. Previously the storage path ignored the pattern and flushed every prefix-matching entry — what looked like a targeted clear was a full cache wipe.
- 311 (SeeClickFix) feed no longer pins stale incidents indefinitely on outage. `fetchSeeClickFixIssues` now throws on fetch failure (was silently returning `[]`); the orchestrator uses `Promise.allSettled` status to decide between "rewrite the store with fresh data" (success — including legitimate empty) and "preserve last known good" (failure). Previously a fetch failure left whatever was in the 311 panel visible forever, looking like fresh civic reports during an upstream outage.
- `fetchSeeClickFixIssues` also throws on malformed response shape (was silently returning `[]` when the upstream JSON had no `issues` array). Schema breakage now goes through the failure-preservation path instead of clearing the 311 store as if it were a quiet day.
- 311 blob is now monitored by `/api/health` and the daily check-freshness cron (was missing from `DATA_SOURCES`).
- 311 direct-rewrite path no longer clobbers a per-category RSS merge. If `fetchAllFeeds` ever returns a `'311'` category result, the per-category loop's `setItems('311', ...)` is now respected; the direct rewrite skips. Latent today (no live RSS source for 311) but the tripwire is removed.
- `/api/data/strava-segments` and `/api/data/strava-leaderboard/[id]` migrated to the shared `tryReadBlobText` / `serveBlobJson` helpers. Strava segment endpoint now returns `503` only when both the live blob AND the local committed catalog are unavailable; the local-fallback path emits `X-Data-Source: local-fallback` to match the activity/housing/police-logs contract.
- Dashboard panels (Composite, Grocery Basket, Wine Index, Fitness, School Tuition, Driveway, Gas Prices, Housing) now use the `*WithStatus` fetchers instead of the silent ones. When `/api/data/*` returns `503`, panels render an explicit "Live data unavailable" message via `Panel.error` instead of pretending the endpoint succeeded with empty data. Housing panel error now reflects housing-data fetch failures instead of housing-news RSS errors.
- `loadAllNews()` now returns `errors: string[]` of per-adapter failures (RSS feeds, NPS, USGS, transit, sheriff, police, supplemental activity, SeeClickFix, plus per-feed RSS errors). Both `+page.svelte` and `TvWallboard.svelte` propagate these into `refresh.endRefresh(errors)`, so refresh history correctly records degraded vs. clean cycles. Previously the dashboard's `handleRefresh` recorded "success" regardless of upstream state.
- TV wallboard surfaces a `DEGRADED · N` badge in the header when the most recent refresh had errors. The chyron's "All clear in Marin County" fallback is suppressed during degraded refreshes; an explicit "Data refresh degraded — N source(s) failed" item is shown instead so operators don't read silent-stale data as live.
- `FetchResult<T>` now carries a `dataSource: 'live' | 'static-fallback' | 'local-fallback' | 'legacy'` field on success, parsed from the server's `X-Data-Source` response header. Coffee's legacy-blob fallback now emits the header. Status-aware panels can render an explicit "fallback data" indicator (HousingPanel does this; others can opt in). Previously the server signaled fallback-source provenance but the client discarded it, so degraded data silently looked healthy.
- `CircuitBreaker.canRequest()` now atomically reserves a half-open probe slot when it admits a request. Previously `canRequest()` only reported "would be allowed"; the slot was incremented later via `trackHalfOpenRequest()`, so concurrent callers could each see "available" and bypass the recovery limit, all probing a failing upstream simultaneously. `trackHalfOpenRequest()` is now a deprecated no-op.
- ServiceClient's retry loop bails out on the first failure when the breaker is HALF_OPEN. Previously a probe with `retries: 2` could hit a still-failing upstream three times before the breaker re-opened, defeating the breaker exactly when the service was most fragile. Half-open probes are now strictly single-attempt; subsequent retries only run once the breaker is fully closed.

---

## 2026-04-05

### Fixed

- Signal deck no longer causes horizontal page scroll on iPhone. Root cause was bare `1fr` grid tracks with implicit `auto` minimum; fixed to `minmax(0, 1fr)` at narrow breakpoints.
- Signals panel stats bar collapses to a 2×2 grid on phone (was 4 cramped columns).
- Environment panel stat cards stack vertically and stream table narrows to 2 columns on phone.
- Map + camera sidebar now stacks to single column at 800px (was 1320px) — no more unusable 78px camera sliver on tablets/phones.
- Main content padding smoothed across breakpoints: 1.5rem → 0.75rem (≤768px) → 0.375rem (≤480px). Was a harsh cliff from 1.5rem to 0.25rem.
- Header tightened at 400px: smaller logo, compact buttons, reduced padding for narrow phones.
- Tip banner wraps gracefully on mobile with reduced padding and font size.

### Added

- TV mode: swipe left/right to navigate between screens on mobile. Map panning and sidebar scrolling are unaffected.

---

## 2026-04-01

### Added

- **TV Mode Refresh v2** — 20-screen carousel (up from 13) with hero/anchor/card screen types
  - Cost of Being Marin hero screen with The Marin Number ($21,110/mo)
  - 311 Photo Wall ("Wall of Grievances") — scrolling grid of complaint photos
  - Daily Life card (cappuccino + grocery basket + gas prices)
  - Lifestyle card (wine index + fitness drop-in prices)
  - Structural Marin card (private school tuition + housing)
  - Marin Driveway card (vehicle registration, EV share, fuel breakdown)
  - Conditions card (weather + AQI + tides)
  - Outdoors card (surf report + Hero Dirt tracker + stream gauges)
- **Map overlays** — Each TV map region shows contextual data pins (311 photos, coffee/gas prices, fitness studios)
- **IDX chyron category** — Index data headlines scroll in the ticker (cappuccino prices, grocery basket, Marin Number, etc.)

### Changed

- **Scroll system replaced** — CSS animation (TvAutoScroll) replaced with JS rAF-driven scroll (TvScroller) that preserves position across carousel cycles
- **Variable screen durations** — Hero screens (22s), anchor screens (18-20s), card screens (12s), map screens (15s)
- **Conditions screen split** — Old grab-bag environmental screen split into focused Conditions + Outdoors cards

---

## 2026-03-31

### Added

- **Strava County-Wide Catalog** — Full Marin segment discovery (2,225 total). Curated 100 ride / 100 run shortlist with override files. Daily leaderboard cron tracks the curated 200.
- **Coffee Index weekly cron** — Automated the coffee price scraper to run weekly (was manual-only, so live sources showed 0/11).

### Changed

- **TV Leaderboards** — Show 20 segments per column (up from 8) with randomized selection. Segments with recent KOM/QOM changes pinned to top. Different smattering each page load.
- **Panel defaults** — "Everything" preset and default panel order now derived from panel registry instead of stale hand-maintained list. New panels (composite, leaderboards, cappuccino, grocery, wine, tuition, fitness, driveway) automatically included. Older localStorage normalized to include newly added panels.

---

## 2026-03-29

### Added

- **Cappuccino Index** — Gas-prices-style map showing cappuccino prices at 12 Marin coffee shops (Equator, Marin Coffee Roasters, Firehouse, Fox & Kit, Philz, Red Whale). Map pins with toggle. Weekly cron.
- **The Bare Essentials** — 12-item Marin grocery basket tracked via Instacart (Vital Farms eggs, Marin Kombucha, Silver Oak cab, collagen, manuka honey, etc.). Weekly cron with sparkline trend.
- **Wine Index** — Premium wine market tracker powered by PlumpJack Shopify API. Category medians for Napa/Sonoma Cab, Burgundy, and Champagne. Staff picks and allocated wines listings. Weekly cron.
- **Marin Private School Tuition Index** — 7 schools across 4 tiers (preschool through high school), shown as percentage of median household income. Cumulative K-12 cost: $698,998. Monthly cron.
- **Fitness Drop-in Index** — Drop-in class prices at 16 studios across yoga ($27-39), pilates ($45-55), cycling ($39), CrossFit ($25), and HIIT ($29). Map pins color-coded by type. Monthly cron.
- **The Marin Driveway** — Vehicle registration data from California DMV. Top makes (Toyota #1, Tesla #3), fuel type breakdown (8.3% EV), fun stats (68 hydrogen fuel cells, 12 Lucids). Monthly cron.
- **Cost of Being Marin** — Composite index with tiered sub-scores (Daily Life, Lifestyle, Housing, Structural). The Marin Number: $21,110/mo ($253,320/yr). Weekly cron.
- **Coffee and Fitness map layers** with toggle controls.

---

## 2026-03-28

### Added

- **Strava KOM Tracker** — Curated Marin cycling and trail segment catalog with live leaderboards, map overlays, TV mode cards, and chyron-ready event data. Expanded seed coverage to 17 cycling segments and 9 running/trail segments across Headlands, Tam, West Marin, and Tennessee Valley classics.

### Fixed

- **Leaderboard panel rendering** — tied Strava ranks no longer break the segment table render, and collapsed cards now surface record holders and segment stats without needing expansion.
- **Strava parser cleanup** — stripped inline HTML from scraped leaderboard times, decoded athlete names safely, and hardened the cron path so deleted/unavailable segments write an empty placeholder while transient Strava failures preserve existing data.
- **TV leaderboard badges** — climb-category labels now match Strava’s category scale and zero-distance placeholders are hidden until real segment stats are available.

---

## 2026-03-24

### Added

- **TV Mode (`/tv`)** — Full-screen, hands-free dashboard for wall-mounted TVs. Six auto-rotating carousel screens (Map & Conditions, News Wire, Safety & Alerts, Camera Wall, Environment, Outdoors & Tides) with 20-second rotation and fade transitions. Scrolling chyron ticker merges 8 data categories. Keyboard shortcuts (arrows, space, R, Escape, F). Cursor auto-hides. Silent 3-minute data refresh. Forced dark theme.
- **Camera Wall screen** — Full-screen grid of all 24 Marin cameras (traffic, scenic, fire) in TV carousel.
- **Environment screen** — Air quality, UV index, active fires, and stream gauges in TV carousel.
- **TV button in header** — Monitor icon in main dashboard header links to `/tv`. Press `M` on the main dashboard to enter TV mode.
- **Pulse stats in TV header** — Temperature, story count, and alert count shown persistently in the TV mode header bar.
- **Map sub-carousel** — Map screen auto-flies through 5 regional views (county overview, Southern Marin, Central Marin, Novato & North, West Marin) every 6 seconds with smooth MapLibre flyTo transitions. Location label overlay shows current region.

### Changed

- **TV Mode v2** — Redesigned carousel: 8 purpose-built screens replacing 6. Geographic camera clusters (Tam & Coast, Central & Highway, West & North) replace generic camera wall. Contextual map sidebar shows per-region weather and nearby stories during flyby. Full-width safety feed with vertical auto-scroll. Combined Conditions & Trails screen with Hero Dirt (single instance). Outdoors & Community two-column headline screen. No panel duplication. Current temperature now reads hourly forecast (actual temp, not daytime high). Military time throughout.
- **Venue GPS coordinates** — Corrected 25 of 30 hardcoded venue coordinates in activity scraper. Worst offenders: Osher Marin JCC (~5km off), Marin Symphony (~3.6km), The Junction (~3.4km), Albert Park/Pacifics (~1.5km).

---

## 2026-03-04

### Added

- **Featured listings & events** — Config-driven newspaper-style classified ads. Inline wire column cards with amber dashed border and horizontal banners between signal deck and news area. Click tracking via Vercel Analytics + persistent Blob counter. Schedule ads by date range, target specific news categories, set priority for weighted selection.

---

## 2026-03-03

### Added

- **Airport Status panel** — SFO and OAK operational status, FAA delay/ground stop alerts, METAR weather conditions (flight category, visibility, ceiling, wind, fog risk), TAF forecast notes for IFR/LIFR periods, and TSA wait times (graceful degradation while API is down).
- **Airport map pins** — SFO, OAK, STS (Santa Rosa), and SJC (San José) shown as color-coded dots on the map (green=on-time, amber=delays, orange=ground-delay, red=ground-stop). Click for status details and aviation weather summary.
- **Santa Rosa Airport (STS)** — Charles M. Schulz–Sonoma County Airport added to airport status panel and map pins with METAR/TAF weather, FAA delays, and TSA wait times.
- **San José Airport (SJC)** — Norman Y. Mineta San José International Airport added to airport status panel and map pins.
- **Pathogen Watch panel** — wastewater pathogen surveillance using CDPH Cal-SuWers CKAN API. Tracks SARS-CoV-2, Influenza A, RSV, and Norovirus across 5 Marin sewersheds with population-weighted county-wide trends, sparklines, and status chips.

### Fixed

- **Settings modal opacity** — modal background changed from transparent `var(--surface)` to near-opaque `rgba(20, 25, 40, 0.95)` so map no longer bleeds through. Added backdrop blur.
- **Gas prices chart x-axis** — history now sorted ascending by timestamp so dates read left-to-right chronologically (was newest-first from API).
- **Pacifics schedule titles** — regex anchored to `imagearray` element boundary to prevent capturing JavaScript URLs into opponent names. Also extracts per-game event URLs for direct linking.

---

## 2026-03-02

### Added

- **Town filter UX overhaul** — larger picker dropdown grouped by geographic region, town filter banner below header, town-aware weather/conditions/gas/EV panels that re-fetch for selected town's coordinates.

### Changed

- Synced panel presets and default order with current panel set.
- Security hardening: CSP nonces, ServiceClient wired into API adapters, deduplicated fire fetch.
- Code quality pass: dead code removal, null safety, consistent patterns.

---

## 2026-03-01

### Added

- **Town boundary highlights** — selecting a town shows its boundary on the map with deep filtering across map markers and panels.
- **Town picker by region** — dropdown grouped into Southern Marin, Central Marin, San Rafael, Novato, San Geronimo Valley, West Marin.
- Town-specific weather using actual town coordinates instead of nearest preset location.

### Changed

- Environment panel moved from right column to middle column under Tides.
- TownPicker dropdown made fully opaque.
- Removed EV station count trend chart (not useful with sparse data).
- Map goes full-width when camera views are expanded.

### Fixed

- Map town chip now clears townFilter store in sync with header picker.
- EV charging stations filtered to show only Marin County.

---

## 2026-02-28

### Added

- **Hide/show toggle for cameras** sidebar.
- **Global town picker** for per-town filtering across the entire dashboard.
- Changelog section added to Community panel (in-app).

---

## 2026-02-27

### Added

- **EV Charging panel** — station locations, connector types, networks, and charging levels with map layer and Vercel cron data pipeline.
- **17 ALERTCalifornia fire cameras** with expandable camera grid. Expand toggle moved to panel header.

### Fixed

- Gas prices cron: add `allowOverwrite` to Vercel Blob put.
- Blob data endpoints: pass auth token for private blob downloads.

---

## 2026-02-26

### Added

- **Gas Prices panel** — station-level fuel prices across Marin County with map layer, price trend chart, cheapest/priciest station lists, and Vercel cron sync.

### Changed

- Swapped Environment and Coastal Conditions (Tides) panel positions for better layout flow.

---

## 2026-02-25

### Added

- **Hero Dirt Tracker V2** — soil-moisture-first model using Open-Meteo observed weather and NWS hourly forecast. Score ring, moisture spectrum bar, trail intel rows, and drying rate.

### Fixed

- CSP blocking Google Fonts and Open-Meteo API.

---

## 2026-02-24

### Added

- Footer, Community panel, feedback modal, and Vercel Analytics.
- OG meta tags for link previews.

---

## 2026-02-23

### Added

- **Vercel-native data ingestion pipeline** — cron endpoints for housing, activity, and police log sync via Vercel Blob storage.

### Fixed

- Blob access (private store) and housing scraper (stream parsing).
- Error handling added to cron endpoints.

---

## 2026-02-22

### Added

- **Full dashboard build** — data adapters, panels, map, cameras, weather, crime & safety, activity verticals, tides, air quality, earthquakes, fire incidents, transit alerts, NPS alerts.
- Server-side API key management, CSP headers, fetch timeouts.

### Fixed

- CSP connect-src for CalFire, Open-Meteo, Socrata domains.
- Transit allowlist, CalFire CORS proxy, article proxy domain handling.
- Geocode 429 rate limiting, stale Mapbox tile cache.
- CSP for ABC7 camera images and Windy webcam iframes.

---

## 2026-02-20

### Added

- Initial scaffold from situation-monitor patterns, rewritten for Marin County.

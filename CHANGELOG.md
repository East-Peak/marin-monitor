# Changelog

All notable changes to Marin Monitor are documented here.

---

## 2026-09-29

### Removed — two dead Marin IJ tag feeds (G0, Stuart approved 2026-09-29)

- `marinij.com/tag/breaking-news/feed/` (Local Wire) and `tag/emergency/feed/` (Crime & Safety) have returned 0 items all year, and the IJ has no populated equivalent. Both are retired; local news comes from `tag/marin-county`, and Crime & Safety keeps the IJ Crime and Fire feeds. With them gone, the only remaining known subsource failures are the Fairfax and Belvedere police 403s (accepted until 2026-12-31).

### Added — sync workflows stay enabled: weekly API keepalive (G0 repair 2)

- **All 8 GitHub sync workflows had been `disabled_inactivity`.** GitHub disables scheduled workflows in a public repo after 60 days without activity. They are re-enabled.
- New `.github/workflows/sync-keepalive.yml`: weekly (Wed 07:23 UTC) plus on demand, `permissions: actions: write` only, no checkout and no commits. It calls the enable API for every sync workflow and itself, tries all of them, and fails the run if any fails. It runs on the same scheduler it protects, so the independent backstop is external: stale data turns `/api/health` 503, and UptimeRobot alerts on that. (GitHub doesn't document that re-enabling resets the timer; this is the pattern established keepalive actions use.)
- `src/lib/server/sync-keepalive.test.ts` pins the cadence, the minimal permissions, error accumulation, and that the list matches every `sync-*.yml` on disk.

### Changed — /api/health: 200 means "no unaccepted failure" (G0 alerting contract)

- **The problem:** G0 leaves Strava stale by design (GS), and the Fairfax and Belvedere police sites answer 403. The strict evaluator returned 503 until every source was fixed, so an external uptime monitor could never see a recovery.
- **The fix does not relabel anything.** Each source keeps its real status, `status` stays `degraded`, and the summary counts are unchanged. A separate `acceptable` flag drives HTTP 200/503. An inventory `ACCEPTED_EXCEPTIONS` entry covers **one exact condition** for one named source or subsource (e.g. Strava _stale_; a missing or unreadable Strava blob still fails). Each entry has a reason, approver, approval time and an exact UTC expiry. Expired, future-approved or incomplete exceptions fail closed. Accepted items show `accepted` (sources) or `acceptedUntil` (subsources) in the public body.
- Accepted until 2026-12-31: Strava Segments + Strava Events (stale), Fairfax + Belvedere Police (403). `check-freshness` still returns 503 whenever anything is degraded, accepted or not.
- Tests: `health/exceptions.test.ts` (exact-condition coverage, expiry, malformed metadata, subsources, empty inventory) and `api/health/health-acceptance.test.ts` (200 while still reporting stale; 503 on an unaccepted failure mode; check-freshness still 503).

### Fixed — Marin IJ local news from a populated feed (G0)

- `marinij.com/tag/news/feed/` has been empty all year. The "Marin Independent Journal" local feed now reads `tag/marin-county/feed/`, the IJ's live Marin tag (10 items; newest 2026-09-28). The IJ's non-tag feeds answer 403 to bots. Removed from the known subsource failures.

### Fixed — federal (NIFC) fires back on the fire map (G0)

- **The NIFC query had been rejected since ArcGIS renamed `attr_POOState` to `POOState`.** ArcGIS answers a bad query with HTTP 200 plus an `error` body, which the adapter read as "no fires". An error body now fails loudly (logged), and the adapter reads the current schema: the point comes from `geometry` (`POOLatitude/POOLongitude` are gone), and acres from `IncidentSize`/`DiscoveryAcres` (`DailyAcres` is gone).
- **The query was also wrong in shape.** It asked for the first 50 year-to-date California incidents and filtered for Marin afterwards; Marin fires were rarely among those 50, and the YearToDate layer almost never marks a fire out. It now queries WFIGS **Current** (active) incidents inside a Marin envelope (~80 km) in WGS84. Live check: 1 active incident near Marin (CHILENO, Marin County, 341 ac).
- NIFC is removed from the health inventory's known subsource failures.

### Fixed — Marin Lately column reads the Substack feed (G0 repair 5b)

- `marinlately.com/feed/` redirected to a dead sfcurrently.com page. The satire column now reads `https://marinlately.substack.com/feed` (200, 10 items). The newest post is from January, so it shows as dated satire, which is honest. The feed proxy allowlist follows the config automatically; the article allowlist is untouched because satire is never enriched.
- Marin Lately is removed from the health inventory's known subsource failures.
- Test: `src/routes/api/feeds/feeds.test.ts` (configured URL; the proxy accepts the Substack feed and rejects the retired one).

### Fixed — Driveway reads the newest DMV release; no more hardcoded 2024 data (G0 repair 5)

- **The DMV retired the fixed resource ID the scraper queried**, and renamed the columns it used (`Zip Code`→`ZIP Code`, `Fuel Type`→`Fuel`, `Number of Vehicles`→`Vehicles`). Every run silently served hardcoded 2024 numbers, with no observation time.
- **Now:** the newest yearly release is resolved through CKAN `package_show` (named `1/1/YYYY …`; the newest must be queryable, with no quiet fallback to last year). The run checks the columns the SQL reads, requires a UUID resource ID before it goes into SQL, and requires a non-empty make aggregate and a Marin total within 15% of the 2024 reference (210,586). Any failure throws: the cron returns 500 and the last-good blob stays. The hardcoded fallback is gone.
- **Fuel labels:** the current release says `Battery Electric`/`Plug-in Hybrid` (the `(BEV)`/`(PHEV)` suffixes are gone), and both forms are mapped, so EVs are no longer lumped into "other".
- Live check (read-only): the 1/1/2026 release has 210,427 Marin vehicles; Toyota 27,246, Honda 11,475, Tesla 8,795; 20,405 battery-electric.
- Tests: `scrapers/driveway.test.ts` (newest-release selection, no older fallback, UUID guard, column names, tolerance, fuel labels, empty makes, CKAN down) and `sync-driveway.test.ts` (failure writes nothing).

### Fixed — EV Charging back on NREL's new host; fails closed on partial scrapes (G0 repair 4)

- **`developer.nrel.gov` no longer resolves.** The API moved to `developer.nlr.gov`, and existing keys carry over. The EV cron had been failing every day since the move.
- **A partial scrape is no longer published as fresh.** The four county tiles overlap for coverage, but the scraper published whatever tiles succeeded. Now any failed, malformed, empty or truncated tile, or zero Marin stations, throws; the cron returns 500 and leaves the last-good blob untouched. Tiles request `limit=all`: the old `limit=200` silently truncated San Rafael (222 stations within 10 mi).
- Tests: `ev-charging.scrape.test.ts` (NLR host + `limit=all`, fresh stamp only for a complete scrape; failed, malformed, empty and truncated tiles throw) and `sync-ev-charging.test.ts` (a failure writes nothing and returns 500; success writes and reports the station count).

### Fixed — Wine Index fails closed instead of publishing empty scrapes (G0 repair 3)

- **A blocked or partial PlumpJack scrape no longer overwrites the blob.** Before, a failed page logged an error and `break`, and the run still wrote whatever it had with a fresh `lastSuccessfulScrapeAt`. Now any failed page (HTTP error, dead proxy, timeout, a non-JSON bot wall), or an empty index category, aborts the run before the write. The last good data and its real observation time stay put, and `/api/health` keeps reporting it stale.
- New `scripts/shared/shopify-collection.mjs` (`fetchShopifyCollection`, `requireNonEmpty`), tested in `src/lib/server/shopify-collection.test.ts`. `proxyFetch` now forwards the caller's abort signal, so timeouts fire through the proxy.

### Changed — the scrape proxy never silently goes direct (G0)

- **`scripts/shared/proxy-fetch.mjs`: a configured proxy is now required.** With `SCRAPE_PROXY_URL` + `SCRAPE_PROXY_SECRET` set, an unreachable or rejecting proxy throws. Before, it quietly fell back to a direct fetch from the GitHub runner, which the target sites block, so a dead proxy looked like a thin but successful scrape. Setting only one of the two variables throws; setting neither fetches direct (local runs).
- **Run ↔ proxy correlation.** Every proxied call sends an `X-Request-Id` UUID and logs `[proxy <id>] <host> -> <upstream status>` in the Actions log. The Mac proxy logs the same ID with host, status and bytes.
- Tests: `src/lib/server/proxy-fetch.test.ts` (envelope passthrough, request ID, success log, unreachable, rejected, half-configured, unconfigured).

### Fixed — scrapers launch Chromium again: one Playwright version (G0 repair 1)

- **Coffee, Cappuccino and Grocery syncs died at browser launch.** Two Playwright versions were in the tree: a direct `playwright@1.61` beside `@playwright/test@1.57`'s own copy. The workflows' `npx playwright install` fetched one browser build and the scripts launched the other.
- Dropped the direct dep. `@playwright/test@^1.61` (resolves 1.63.0) is now the only Playwright, and the three scrapers import `chromium` from it. The workflows install it with `--with-deps chromium`, so a clean runner has the system libraries.
- `src/lib/server/playwright-pin.test.ts` pins it: exactly one resolved `playwright`/`playwright-core` in the lockfile, no direct dep, no `playwright` imports (static or dynamic) in `scripts/`, and every browser-launching sync workflow installs from the pinned package.

## 2026-09-28

### Fixed — fire-cam frames painted the moment a camera slide appears (TV slice 1b)

- **TV: ALERTCalifornia fire-cam tiles are painted as soon as the slide appears.** Before, they sat blank for about 2s.
- **Why they were blank.** Those frames are ~276 KB with `cache-control: max-age=10`, and the warm-up runs ~19s before the slide. Rendering a fresh `<img src>` made Chromium refetch the expired frame even though a decoded copy was still in memory, and keeping the preloaded `Image` object alive was not enough on its own (checked empirically).
- **Fix: mount the decoded element itself.** `preloadImage` now resolves the decoded `HTMLImageElement`. The per-camera last-good cache keeps that element: one per camera, replaced when a newer frame arrives. `TvCameraTile` mounts it directly, so a remount cannot trigger a fetch.
- **New e2e fixture.** It serves a 300 KB frame with `max-age=10` and waits 12s between warm-up and slide. It asserts that every live tile is painted 0.5s after the slide appears and that each frame was fetched exactly once. It fails on the previous build.
- `.prettierignore` and `knip.jsonc` now skip `.superpowers/`, the agent scratch directory (already gitignored).

### Fixed — TV camera tiles no longer flash "Camera offline" (TV slice 1)

- **TV: camera tiles no longer flash 'Camera offline' while loading.** They show the last good frame (marked stale if old), recover automatically, and the next camera slide is preloaded so it appears ready.
- **Ready means decoded.** A new `TvCameraTile` swaps in a frame only after it has loaded _and_ decoded (`image-preload.ts`, 8s timeout, late loads ignored). Preload and display use the same bucketed `?t=` URL (`camera-frame.ts`).
- **Failures degrade instead of blanking.** A tile with a previous frame keeps it and shows "Last frame N min ago" once it's older than max(60s, 3 refresh intervals). "Camera offline" appears only after 2 consecutive failures with no frame ever shown, counted across carousel visits so a dead slow-refresh camera still surfaces as offline. The old error handler set `display:none` forever, so a camera that recovered never came back; recovery is now automatic.
- **Next-slide warm-up.** While any slide is showing, the wallboard preloads the next camera slide's frames (image cams only, max 8) into a small per-camera last-good cache. The tiles mount already showing a frame.
- Windy iframe cameras render exactly as before.

### Fixed — one truthful health evaluator (G0a)

- **`/api/health` now tells the truth and says so with its status code.** It returns **200 only when every source is ok or declared reference data**, and **503** otherwise. Before this it always returned 200, even while 7 of 15 sources were months stale. Generic uptime monitors can now see degradation.
- **One evaluator, one inventory.** New `src/lib/server/health/`:
  - a frozen 20-source inventory: the 15 existing sources plus the 5 composite inputs that were never monitored (Cappuccino, Camp Prices, Dog Walker, Ikon Pass, Rivian Lease);
  - a declared list of known subsource failures (Fairfax/Belvedere police 403s, empty Marin IJ news/breaking/emergency feeds, dead Marin Lately, NIFC `attr_POOState` rename), each with a disposition;
  - a pure, clock-injected `evaluate()` giving per-source `ok | stale | unavailable | reference | unknown`.
    `/api/health` and the daily `check-freshness` cron both use it, and a test proves they classify identically.
- **Timestamps that can't be vouched for are `unknown`, never `ok`:** missing, malformed or impossible (`2026-02-30`), non-ISO, or in the future. Previously NaN ages and future timestamps passed as ok. An explicit `lastSuccessfulScrapeAt`/`lastLiveScrapeAt: null` no longer falls back to `lastUpdated`.
- **`check-freshness` returns 503 when anything is degraded** (was 207, which Vercel treats as success) and still rejects unauthorized calls.
- **Public diagnostics trimmed:** blob keys, subsource problem detail and repair notes now appear only for authenticated (cron-secret) callers.
- **No sources were repaired.** Coffee, Grocery, Wine, EV Charging, both Strava sources, Driveway (hardcoded 2024 fallback) and the stalled composite inputs stay visibly degraded until G0.

## 2026-07-03

### Internal — dead-code gate (knip), no behavior change

- Wired **knip** into `verify` (and therefore CI): dead FILES and unused/missing **dependencies** now fail the gate, so new dead code can't accumulate silently. Config (`knip.jsonc`) gates the low-false-positive classes only; export/type checks are deferred to a later triage. Three false-positive devDependencies (`@typescript-eslint/*` peer-deps, `@types/d3` ambient types) and three false-positive files (two `.d.mts` type companions, the LaunchAgent-invoked `scrape-proxy.mjs`) are baselined with inline notes. Gate proven (exits non-zero on a planted dead file).
- **Removed 4 confirmed-dead files** (Codex-verified zero real importers across 413 files): `src/lib/server/sanity.ts` (unwired price-sanity-bounds helper — never called), and three unused re-export barrels `src/lib/{analysis,components,services}/index.ts` (all imports use direct subpaths). 1417 unit tests green, build green.

## 2026-06-27

### Security — code-scanning (CodeQL)

- **Stack-trace exposure hardening (14 cron sync endpoints + `run-all`).** Every `/api/cron/sync-*` endpoint and the `run-all` aggregator returned the raw internal error string (`err.message`) in their JSON response on failure. Added a shared `cronErrorResponse()` helper that logs the full error (with stack) server-side but returns a generic `{ ok: false, error: 'sync failed' }` — internal details (DB hosts, upstream URLs, stack info) are never echoed to callers. Clears 14 CodeQL `js/stack-trace-exposure` alerts. TDD + Codex-reviewed; 1400 unit tests green, svelte-check clean.
- **Unified HTML→text sanitization (`src/lib/server/html-text.js`).** The scrapers had six duplicated regex copies of `stripHtml`/`decodeEntities`/`cleanHtml`/`stripTags` that CodeQL flagged for `bad-tag-filter` (×3), `double-escaping` (×6), and `incomplete-multi-character-sanitization` (×2) — bypassable tag regexes and `&amp;→&` then `&lt;→<` double-decoding. Replaced with one DOM-based `stripHtml` (linkedom parse → element-boundary whitespace, script/style removal, curly-quote normalization) + a single-pass `decodeEntities` (case-insensitive, code-point-range-guarded). The server scrapers and the standalone `.mjs` sync scripts now share it; `rss.ts` (client-side) uses an equivalent browser-DOM version. Output was already auto-escaped (not exploitable) — this is a robustness/correctness fix. Behaviour preserved (existing scraper tests green); TDD (17 cases) + Codex-reviewed (which caught block-boundary collapse, a `</body>`-truncation edge, and a `RangeError` on malformed numeric entities — all fixed). Clears 11 CodeQL alerts. 1417 unit tests green, svelte-check 0/0.

## 2026-06-21

### Fixed

- The UI now actually loads its intended **Outfit** typeface. `@fontsource-variable/outfit` was installed and referenced in the CSS (`font-family: 'Outfit Variable'`) but never imported, so the app silently rendered in the system fallback font. Added the import to the root layout; verified the font loads (`document.fonts.check` → true).

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

# Strava KOM Tracker -- Design Spec

**Date:** 2026-03-28
**Status:** Approved (revised after Codex review)
**Author:** Stuart Watson + Claude Code
**Reviewer:** Codex

## Overview

A Strava segment leaderboard tracker for Marin Monitor that surfaces cycling and running course records, partial public leaderboards, and KOM/QOM changes across iconic Marin County segments. Integrates into the map, a dedicated panel, the TV mode chyron, and a dedicated TV carousel screen.

## Approach

**Hybrid: Strava OAuth API for discovery/polylines + public page scraping for leaderboard data.**

- Use Strava's `segments/explore` API endpoint for segment discovery, metadata, and encoded polylines. This requires a real Strava athlete account with OAuth bearer tokens (3-legged OAuth, refresh token rotation). Stuart will provide the account.
- Scrape public (unauthenticated) segment pages for leaderboard data the API no longer provides (CR/QOM holders from React props, partial leaderboard from HTML tables).
- Hand-curated seed list is the primary segment source. Explore API supplements discovery but is not exhaustive (max 10 results per bounding box).
- Future enrichment via a Strava subscriber upgrade ($12/mo) on the same account for full leaderboards beyond what public pages expose.

### Data Reality (Verified 2026-03-28)

Public segment pages expose two distinct data layers:

1. **React props (`SegmentDetailsSideBar`):** CR holder (overall, men, women) with athlete ID, name, time, date, activity ID. Local Legend with name and effort count. This data is **reliable and structured**.
2. **HTML leaderboard table:** ~7 visible rows (not 10) with rank gaps where privacy-hidden athletes are omitted. Ranks are non-contiguous. Athlete names vary (full names, initials, emoji/custom display names). This data is **partial and inconsistent**.

### Risk Assessment

- **Technical risk:** Low. ~30 unauthenticated HTTP requests/day for scraping. Strava uses CloudFront CDN with no Cloudflare WAF, no CAPTCHAs, no bot detection on public segment pages.
- **Enforcement risk:** Low. Zero history of legal action against scrapers, zero DMCA takedowns of scraping projects, zero documented account bans for scraping. Le Monde's #StravaLeaks investigation scraped 150+ Secret Service profiles with no consequences.
- **ToS:** Strava's ToS prohibits automated access. This is a technical violation. Mitigation: data is publicly viewable, volume is minimal, project gives Strava free attribution and links.
- **Kill switch:** Feature flag in `$lib/config/panels.ts` to disable all Strava scraping and hide the panel/map layer. Blob data persists but stops updating. Rollback is a config change, not a code revert.

---

## 1. Data Pipeline

### 1a. Strava OAuth Integration

Stuart provides a Strava athlete account. The app registers as a Strava API application (free).

- **OAuth flow:** 3-legged OAuth2. One-time browser-based authorization to grant the app access to the athlete's token.
- **Token storage:** `access_token` and `refresh_token` stored as Vercel environment variables (or Vercel Blob if rotation needs to be persisted across deploys).
- **Token lifecycle:** Access tokens expire after 6 hours. Cron jobs must check expiry and refresh via `POST https://www.strava.com/oauth/token` with the refresh token before making API calls.
- **Scopes needed:** `read` (sufficient for segment explore).
- **Revocation recovery:** If the token is revoked, the cron job logs an error and the kill switch activates. Stuart re-authorizes manually.

### 1b. Segment Catalog

**Primary source: hand-curated seed list** in `$lib/config/strava.ts`.

Each entry: segment ID, name, activity type (ride/run), and optionally a manually sourced polyline.

Seed segments:
- **Cycling:** Hawk Hill (229781), Mt. Tam Hill Climb (678363), Camino Alto (765125), Paradise Dr (582500), Bolinas-Fairfax Rd (2312682), plus ~10 more TBD during implementation.
- **Running:** Dipsea/Steep Ravine (907022), Dipsea Panoramic-Muir Woods (15160205), Tennessee Valley, Miwok Trail, Coastal Trail, plus ~5 more TBD.
- Target: 20-30 segments total.

**Supplemental: Strava Explore API** for polyline enrichment and discovery of segments not in the seed list.

- `GET /api/v3/segments/explore` with `bounds` parameter covering Marin (~37.83,-122.75,38.08,-122.45).
- Returns: segment ID, name, climb category, avg grade, elev difference, distance, start/end latlng, encoded polyline.
- Max 10 results per query. Tile Marin into 4-6 overlapping bounding boxes. Results are popularity-biased, not exhaustive.
- Requires valid bearer token (see 1a).
- Merges into the catalog: if a seed segment is found via explore, its polyline is populated. New non-seed segments found via explore are flagged for manual review, not auto-added.
- Run weekly (Sunday 2am UTC). Segments rarely change.

### 1c. Leaderboard Scraping (Public Pages)

Daily cron fetches `https://www.strava.com/segments/{id}` for each tracked segment. Unauthenticated server-side fetch.

**From React props (`SegmentDetailsSideBar`):**
- CR holder (overall): athlete ID, name, time, date, activity ID, effort ID
- CR holder (men): same fields
- QOM holder (women): same fields
- Segment stats: total attempts, unique athletes

**From HTML leaderboard table:**
- ~7 visible rows with: rank, athlete name, speed/pace, power (cycling), VAM, time, activity link
- Ranks are non-contiguous (privacy-hidden athletes create gaps)
- Activity IDs extracted from time links (stable identifiers for change detection)

**Runtime budget:** 30 fetches with parallel execution (concurrency limit of 5) keeps total runtime under 60 seconds. No randomized delays needed when parallelized -- the staggered concurrency naturally spreads requests. Fits within Vercel's function timeout.

### 1d. Storage (Vercel Blob, private)

```
strava-segments.json                # Catalog: id, name, polyline, category, stats, activity_type
strava-leaderboard-{id}.json        # Per-segment: CR/QOM + visible leaderboard rows
strava-events.json                  # Rolling 30-day change log
```

Follows existing Blob naming convention (flat namespace, prefixed). All blobs private, accessed through API routes only.

### 1e. Change Detection

**CR/QOM changes (high confidence):** Compare current CR/QOM effort IDs against previous snapshot. Effort ID is stable -- immune to name changes, privacy toggles, display name mutations. Generate event:
```typescript
{
  type: 'new_kom' | 'new_qom',
  segmentId: number,
  segmentName: string,
  athlete: string,        // display name at time of detection
  time: string,
  effortId: number,       // stable identifier
  activityId: number,
  previous: { athlete: string, time: string, effortId: number },
  detectedAt: string      // ISO timestamp
}
```

**Leaderboard changes (lower confidence, best-effort):** Compare visible HTML rows by activity ID (extracted from time links). New activity IDs appearing = potential new entries. Activity IDs disappearing = athlete went private or was overtaken. Only surface these in the panel's Recent Activity tab, NOT in the chyron (too noisy/unreliable for a ticker).

Events pruned to 30-day rolling window.

### 1f. Cron Schedule

| Job | Frequency | Cron (UTC) | maxDuration | Pattern |
|-----|-----------|------------|-------------|---------|
| Segment catalog + polylines | Weekly | `0 10 * * 0` (Sun 2am PT) | 60s | Explore API (authed) |
| Leaderboard scrape | Daily | `0 12 * * *` (5am PT) | 60s | Public page fetch (unauthed) |

Add to `vercel.json` crons array. Both handlers export `const config = { maxDuration: 60 }`.

### 1g. API Routes

| Route | Method | Returns |
|-------|--------|---------|
| `/api/data/strava-segments` | GET | Segment catalog (polylines, metadata) |
| `/api/data/strava-leaderboard/[id]` | GET | CR/QOM + visible leaderboard for one segment |
| `/api/data/strava-events` | GET | Recent change events |
| `/api/cron/sync-strava-segments` | GET | Cron: refresh catalog via Explore API |
| `/api/cron/sync-strava-leaderboards` | GET | Cron: scrape all leaderboards |

Data routes follow existing pattern: private Blob read with `BLOB_READ_WRITE_TOKEN`, CDN cache headers, static fallback.

---

## 2. Map Integration

### Toggleable "Segments" Layer

New layer in the map controls panel alongside existing layers (traffic, earthquakes, cameras, fire zones). Off by default (opt-in). Persisted in user settings / localStorage.

Sub-toggles for cycling vs. running segments.

### Zoom-Dependent Rendering

| Zoom Level | Display |
|------------|---------|
| z11 and below | Pin markers at segment start points. Icon indicates cycling (bike) vs. running (shoe). |
| z12-13 | Transition to polylines. Pins fade, route lines appear. |
| z14+ | Full polylines with directional arrows (start to finish). |

MapLibre `minzoom`/`maxzoom` on layers handles transitions natively.

**Polyline availability:** Segments with polylines from the Explore API render as lines. Segments without polylines (explore missed them, or API was unavailable) fall back to pins at start coordinates from the seed config. Graceful degradation, not all-or-nothing.

### Polyline Styling

- **Cycling segments:** Orange/amber lines (Strava cycling color). 3-4px width with slight glow/halo for visibility on dark map.
- **Running segments:** Blue/teal lines. Same width and glow treatment.
- **Hover:** Thicken line + show segment name tooltip.
- **Selected:** Brighter highlight, thicker line.

### Click Interaction

Click a segment (pin or polyline) to open a popup/sidebar card:

- Segment name, distance, elevation gain, climb category
- CR (men): holder name + time
- QOM (women): holder name + time
- Visible leaderboard rows (up to ~7, displayed as-is with actual ranks)
- Total attempts count
- Link to Strava segment page (attribution)

Leaderboard data lazy-loaded on click from `/api/data/strava-leaderboard/{id}`. Only geometry + metadata loaded upfront for the map layer.

Consistent with existing camera and earthquake marker interaction patterns.

---

## 3. Dedicated Panel

### Standalone "Leaderboards" Panel

**Not a NewsPanel.** This is a bespoke component (`LeaderboardsPanel.svelte`) with explicit routing in `WireGrid.svelte`, similar to how `CommunityPanel` is handled. Registered in `panels.ts` for visibility/ordering but rendered via its own component path in WireGrid.

Priority 2 panel (visible but not top row by default).

### Tab Structure

Three tabs:

1. **Cycling** (default) -- Segment cards for cycling segments
2. **Running** -- Segment cards for running/trail segments
3. **Recent Activity** -- Feed of CR/QOM changes + best-effort leaderboard changes

### Segment Cards

Each card shows one segment:

- **Collapsed (default):** Segment name, climb category badge, CR (men) + QOM (women) with holder name and time.
- **Expanded (click):** Visible leaderboard rows (displayed with actual ranks, gaps and all -- this is honest about the data). Total attempts, distance, elevation gain. Link to segment on map (scroll + zoom + highlight). Link to Strava.

Cards sorted by total attempts (most popular first) within each tab. Alternative sort by climb category (HC, Cat 1, 2, 3, 4, uncategorized).

### Recent Activity Tab

Feed of change events, newest first:

- CR/QOM changes with segment name, new holder, time, previous holder (high confidence)
- Leaderboard entry changes (lower confidence, labeled accordingly)
- Events age out after 30 days

### Panel Data Loading

Client-side adapter (`$lib/api/marin/strava.ts`) fetches from `/api/data/strava-segments` and `/api/data/strava-leaderboard/{id}`. Follows existing adapter patterns (e.g., `gas-prices.ts`). Integrates with Stage 3 (tertiary) of the refresh orchestration.

---

## 4. Chyron Integration

### What Hits the Chyron

**Only high-confidence CR/QOM events:**

- **New KOM:** `"NEW KOM: Hawk Hill -- 5:12 by A.B. (prev: 5:17 by J.K.)"`
- **New QOM:** `"NEW QOM: Dipsea Trail -- 22:45 by S.M."`

### What Doesn't

- Leaderboard row changes (too unreliable for a ticker)
- Segments with no change
- Stale events (>48 hours old)

### Integration

Requires code changes to `src/lib/stores/tv.ts`:

- New store or adapter that fetches `/api/data/strava-events` and filters to CR/QOM events within 48 hours
- Add as an input to the `tvTickerItems` derived store (alongside existing safetyNews, localNews, civicNews, alerts)
- New ticker category: `KOM` with badge color (orange for cycling, teal for running)
- Dedup by effort ID to prevent repeat display
- Max 3-4 Strava items in the ticker at a time

---

## 5. TV Mode

### Dedicated Carousel Screen: "Marin Leaderboards"

New screen (screen 13) in the 12-screen TV carousel. Added to `TV_SCREENS` array in `src/lib/config/tv.ts`.

Requires a new screen component in `src/lib/components/tv/screens/`.

### Layout

Two-column split:

- **Left column:** Cycling -- top 3-5 segments by popularity, showing CR + top 3 visible entries each
- **Right column:** Running -- same treatment
- **Footer strip:** Recent CR/QOM events (last 2-3 from events store)

### Behavior

- If more segments than fit on screen, auto-scroll vertically (same pattern as Safety & Alerts TV screen, using `TvAutoScroll`).
- 20-second rotation before carousel advances (matches existing timing).
- 3-minute data refresh (matches existing TV mode refresh cycle).

---

## 6. Backlog / Future Enhancements

### Elevation Profiles

On segment drill-in (map popup or panel expand), show a D3 sparkline of the altitude profile. Source elevation data from decoded polyline coordinates + free DEM API (Open-Meteo Elevation API or MapTiler Terrain). Inspired by VeloViewer's segment profiles. Add after core pipeline is stable.

### Subscriber Enrichment

Upgrade the Strava account to subscriber ($12/mo) for:

- Full leaderboards beyond the ~7 public rows
- Age group / weight class filtering
- Power data for climbs
- Effort history / trends over time
- Richer TV mode with YTD stats and attempt trend charts

### Segment Expansion

- Start with curated 20-30 segments (cycling + running)
- Community submissions for new segments to track
- MTB segments (Corte Madera Ridge, Camp Tamarancho trails)

### Explore API as Auto-Discovery

Once OAuth is stable, explore API could periodically scan for new popular segments and flag them for manual addition to the seed list.

---

## Technical Constraints

- Follows Marin Monitor's existing patterns: Vercel Cron + Blob (private), API route data access, config-driven panels, MapLibre layers, D3 for charts, Svelte 5 runes.
- No per-request LLM calls.
- Caching: segment catalog cached aggressively (weekly refresh), leaderboards cached with 24h TTL, CDN headers on API routes.
- Attribution: all segment data links back to Strava. Strava logo/wordmark where appropriate per their brand guidelines.
- Kill switch: feature flag to disable scraping and hide all Strava UI surfaces.

## Local Development

- Static fallback JSON files in `static/data/` for Strava data (same pattern as activity, police, housing).
- Health endpoint additions: `/api/health` should report Strava Blob freshness alongside existing checks.
- Fixture tests: save representative Strava HTML responses for parser unit tests (guards against HTML structure changes).

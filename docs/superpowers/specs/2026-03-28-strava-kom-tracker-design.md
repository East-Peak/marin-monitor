# Strava KOM Tracker -- Design Spec

**Date:** 2026-03-28
**Status:** Approved
**Author:** Stuart Watson + Claude Code

## Overview

A Strava segment leaderboard tracker for Marin Monitor that surfaces cycling and running course records, top-10 leaderboards, and KOM/QOM changes across iconic Marin County segments. Integrates into the map, a dedicated panel, the TV mode chyron, and a full TV carousel screen.

## Approach

**Approach A: Official API for discovery + public page scraping for leaderboards.**

- Use Strava's `segments/explore` API endpoint (still live, official) for segment discovery, metadata, and encoded polylines.
- Scrape public (unauthenticated) segment pages for top-10 leaderboard data and CR/KOM/QOM holders -- data the API no longer provides since the June 2020 leaderboard endpoint removal.
- No authentication needed for the scraping layer. Public segment pages serve structured JSON in `data-react-props` attributes (React server-rendered), parseable with a simple HTTP GET.
- Future enrichment via a Strava subscriber burner account ($12/mo) if deeper data is desired (full leaderboards, age groups, power data).

### Risk Assessment

- **Technical risk:** Very low. 20-30 unauthenticated HTTP requests/day. Strava uses CloudFront CDN with no Cloudflare WAF, no CAPTCHAs, no bot detection on public segment pages.
- **Enforcement risk:** Very low. Strava has zero history of legal action against scrapers, zero DMCA takedowns of GitHub scraping projects, zero documented account bans for scraping. Le Monde's #StravaLeaks investigation scraped 150+ Secret Service profiles with no consequences. Night-and-day difference from LinkedIn.
- **ToS:** Strava's ToS does prohibit automated access. This is a technical ToS violation. Mitigation: data is publicly viewable, volume is minimal (~30 req/day), project gives Strava free attribution and links.

---

## 1. Data Pipeline

### Segment Discovery (Strava Explore API)

- Register a free Strava API app (OAuth client credentials).
- `GET /api/v3/segments/explore` with bounding box covering Marin County (~37.83,-122.75 to 38.08,-122.45).
- Returns: segment ID, name, climb category, avg grade, elevation difference, distance, start/end latlng, encoded polyline.
- Max 10 results per query -- tile Marin into 4-6 overlapping bounding boxes for full coverage.
- Supplement with a hand-curated seed list of must-have segments:
  - **Cycling:** Hawk Hill (229781), Mt. Tam Hill Climb (678363), Camino Alto (765125), Paradise Dr (582500), Bolinas-Fairfax Rd (2312682), and others TBD.
  - **Running:** Dipsea/Steep Ravine (907022), Dipsea Panoramic-Muir Woods (15160205), Tennessee Valley, Miwok Trail, Coastal Trail, and others TBD.
- Target: 20-30 segments total (15-20 cycling, 8-10 running/trail).
- Run weekly (Sunday night). Segments rarely change.

### Leaderboard Scraping (Public Pages)

- Daily cron (5am Pacific) fetches `https://www.strava.com/segments/{id}` for each tracked segment.
- Unauthenticated server-side fetch. No cookies, no tokens, no auth headers.
- Parse the `SegmentDetailsSideBar` React props JSON from the HTML response.
- Extract per segment:
  - CR holder + time (men)
  - QOM holder + time (women)
  - Top 10 entries: rank, athlete name, time, speed/power (if available)
  - Segment stats: total attempts, distance, elevation gain
- ~30 fetches/day, spread over a few minutes with randomized delays (1-5s between requests).

### Storage (Vercel Blob)

```
strava/
  segments.json              # Catalog: id, name, polyline, category, stats, activity_type
  leaderboards/{id}.json     # Current top 10 + CR/QOM per segment
  events.json                # Rolling 30-day change log
```

- `segments.json` refreshed weekly by the explore API cron.
- `leaderboards/{id}.json` refreshed daily by the scraper cron.
- `events.json` appended to by the scraper when changes are detected; pruned to 30 days.

### Change Detection

Before overwriting a leaderboard file, diff against the previous version:

- **New CR/KOM:** CR holder changed. Generate event: `{ type: 'new_kom', segment, athlete, time, previous_athlete, previous_time, timestamp }`
- **New QOM:** Same as above for women's record.
- **Top-3 shuffle:** Any change in positions 1-3. Generate event: `{ type: 'top3_change', segment, athlete, new_rank, old_rank, timestamp }`
- **New top-10 entry:** Athlete appears in top 10 who wasn't there before. Generate event: `{ type: 'new_entry', segment, athlete, rank, time, timestamp }`

Events are the data source for both the chyron and the panel's Recent Activity tab.

### Cron Schedule

| Job | Frequency | Time | Pattern |
|-----|-----------|------|---------|
| Segment catalog refresh | Weekly | Sunday 2am PT | Strava Explore API |
| Leaderboard scrape | Daily | 5am PT | Public page fetch |

Fits the existing Vercel Cron + Blob architecture (same as housing, police, gas prices, EV).

### API Route

- `GET /api/strava/segments` -- returns segment catalog (polylines, metadata)
- `GET /api/strava/leaderboard/{id}` -- returns top 10 + CR for a segment
- `GET /api/strava/events` -- returns recent change events (for chyron and panel)

---

## 2. Map Integration

### Toggleable "Segments" Layer

New layer in the map controls panel alongside existing layers (traffic, earthquakes, cameras, fire zones). Off by default (opt-in). Persisted in user settings / localStorage.

Sub-toggles for cycling vs. running segments.

### Zoom-Dependent Rendering

| Zoom Level | Display |
|------------|---------|
| z11 and below | Pin markers at segment start points, clustered if dense. Icon indicates cycling (bike) vs. running (shoe). |
| z12-13 | Transition to polylines. Pins fade, route lines appear. |
| z14+ | Full polylines with directional arrows (start to finish). |

MapLibre `minzoom`/`maxzoom` on layers handles transitions natively.

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
- Top 5 condensed (rank, name, time) with "View full top 10" expand
- Total attempts count
- Link to Strava segment page (attribution)

Leaderboard data lazy-loaded on click from `strava/leaderboards/{id}.json` -- only geometry + metadata loaded upfront for the map layer.

Consistent with existing camera and earthquake marker interaction patterns.

---

## 3. Dedicated Panel

### Standalone "Leaderboards" Panel

New panel in the Wire Grid, peer to Crime & Safety, Outdoors, Cycling & Endurance, etc. Priority 2 (visible but not top row by default).

### Tab Structure

Three tabs:

1. **Cycling** (default) -- Segment cards for cycling segments
2. **Running** -- Segment cards for running/trail segments
3. **Recent Activity** -- Feed of KOM/QOM changes and leaderboard shuffles from events.json

### Segment Cards

Each card shows one segment:

- **Collapsed (default):** Segment name, climb category badge, CR (men) + QOM (women) with holder name and time.
- **Expanded (click):** Full top 10 (rank, name, time), total attempts, distance, elevation gain. Link to segment on map (scroll + zoom + highlight). Link to Strava.

Cards sorted by total attempts (most popular first) within each tab. Alternative sort by climb category (HC, Cat 1, 2, 3, 4, uncategorized).

### Recent Activity Tab

Feed of change events, newest first:

- New KOM/QOM entries with segment name, new holder, time, previous holder
- Top-10 position changes
- Events age out after 30 days

### Panel Config

Follows existing panel patterns: collapsible, draggable in edit mode, registered in `src/lib/config/panels.ts`.

---

## 4. Chyron Integration

### What Hits the Chyron

- **New KOM:** `"NEW KOM: Hawk Hill -- 5:12 by A.B. (prev: 5:17 by J.K.)"`
- **New QOM:** `"NEW QOM: Dipsea Trail -- 22:45 by S.M."`
- **Top-3 shakeup:** `"LEADERBOARD: Mt. Tam -- T.R. moves to #1"`

### What Doesn't

- Position changes below top 3 (noise)
- Segments with no change
- Stale events (>48 hours old)

### Integration

- New chyron category alongside the existing 8 (news, weather, safety, etc.)
- Events drawn from `strava/events.json`
- 48-hour TTL for chyron display (leaderboard changes aren't breaking news after two days)
- Max 3-4 chyron items at a time to avoid flooding the ticker
- Cycling vs. running distinguished by prefix label

---

## 5. TV Mode

### Dedicated Carousel Screen: "Marin Leaderboards"

New screen in the 8-screen TV carousel (becomes screen 9, or replaces/augments Outdoors & Community).

### Layout

Two-column split:

- **Left column:** Cycling -- top 3-5 segments by popularity, showing CR + top 3 entries each
- **Right column:** Running -- same treatment
- **Footer strip:** Recent activity ticker (last 2-3 events from events.json)

### Behavior

- If more segments than fit on screen, auto-scroll vertically (same pattern as Safety & Alerts TV screen).
- 20-second rotation before carousel advances (matches existing timing).
- 3-minute data refresh (matches existing TV mode refresh cycle).

---

## 6. Backlog / Future Enhancements

### Elevation Profiles (Post-MVP)

On segment drill-in (map popup or panel expand), show a D3 sparkline of the altitude profile. Source elevation data from decoded polyline coordinates + free DEM API (Open-Meteo Elevation API or MapTiler Terrain). Inspired by VeloViewer's segment profiles. Add after core pipeline is stable.

### Burner Subscriber Enrichment (Post-MVP)

Layer on a Strava subscriber burner account ($12/mo) for:

- Full leaderboards beyond top 10
- Age group / weight class filtering
- Power data for climbs
- Effort history / trends over time
- Richer TV mode with YTD stats and attempt trend charts

### Segment Expansion

- Start with curated 20-30 segments (cycling + running)
- Community submissions for new segments to track
- MTB segments (Corte Madera Ridge, Camp Tamarancho trails)

---

## Technical Constraints

- Follows Marin Monitor's existing patterns: Vercel Cron + Blob, config-driven panels, MapLibre layers, D3 for charts, Svelte 5 runes.
- No per-request LLM calls.
- Caching: segment catalog cached aggressively (weekly refresh), leaderboards cached with 24h TTL.
- Attribution: all segment data links back to Strava. Strava logo/wordmark where appropriate per their brand guidelines.

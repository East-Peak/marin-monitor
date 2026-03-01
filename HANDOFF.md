# Marin Monitor - Handoff

Updated: 2026-03-01
Workspace: `/Users/tammypais/projects/marin-monitor`

## What This Project Is

Marin Monitor is a local situational-awareness dashboard for Marin County.

It combines:

- local news and civic feeds (26 RSS sources)
- official alerts and public-safety data (Sheriff blotter + 10 municipal PD feeds)
- weather, tides, marine, and traffic data
- webcams (Caltrans traffic, Windy scenic, ALERTCalifornia fire) and map overlays
- lifestyle/event verticals for Marin-specific culture and activity
- NWS quantitative precipitation forecasts (rain totals)

The product is intentionally half civic monitor, half local-Marin cultural dashboard. The tone stays observational and local, but the data model should stay operationally useful.

## Current UI Shape

Top section (collapsible signal deck):

- Left column: Marin Map, Cameras (9 cams across 3 tabs: Traffic/Scenic/Fire)
- Middle column: Pulse, Outlooks, Environment
- Right column: Weather, Signals, Coastal Conditions

Dashboard collapse toggle between map and signal deck. Columns stretch flush to equal height.

Wire columns below (responsive grid, auto-fit with no max-width cap):

- Local Wire
- Crime & Safety
- Civic
- Outdoors & Lifestyle
- Marin Lately
- Cycling & Endurance
- Shows & Events
- Sports & Prep
- Fishing
- Farm & Market

Map interaction:

- town click filters the dashboard
- pin click opens a stable inspector drawer
- individual pins and town aggregates both open readable context
- non-news map features can be inspected
- traffic is a single concept that combines congestion + incidents
- map pins are geo-tagged from title only (not description) to prevent false placement

Settings:

- UI zoom/scale (50-150%, CSS zoom, persisted)
- Dashboard collapse (show/hide signal deck, persisted)
- Panel order (drag-and-drop wire columns)
- Preset layouts (quick-switch)

## Core Architecture

Current stack:

- SvelteKit 2
- Svelte 5 runes ($state, $derived, $effect, $props)
- MapLibre GL (base map) + Mapbox (traffic overlay)
- D3 for charts
- static JSON artifacts for supplemental datasets
- `@sveltejs/adapter-static` right now

Important current architectural reality:

- the app still does too much client-side fanout on first load
- hard refresh is slower than it should be
- this is acceptable for current development, but not the final production architecture

Recommended future production architecture:

- move to `@sveltejs/adapter-vercel`
- create a server-side bootstrap payload for the first screen
- use edge caching with `s-maxage` + `stale-while-revalidate`
- dedupe repeated panel fetches
- optionally keep a last-known snapshot for instant first paint

This is the main performance item still open.

## Current Data Model

Canonical content categories:

- `local`, `civic`, `safety`, `outdoors`, `housing`
- `cycling`, `endurance`, `shows`, `prep`, `fishing`, `farm`
- `satire`

Important UI decision:

- `cycling` and `endurance` remain separate ingest categories internally
- the visible UI collapses them into one wire column: `Cycling & Endurance`

That preserves future flexibility without fragmenting the wire grid.

## API Adapters (`src/lib/api/marin/`)

| Adapter                 | Source             | Notes                                     |
| ----------------------- | ------------------ | ----------------------------------------- |
| `rss.ts`                | RSS feeds          | 26 feeds across 11 categories             |
| `nws.ts`                | NWS 7-day forecast | Standard periods                          |
| `nws-hourly.ts`         | NWS hourly + QPF   | Temperature sparkline + daily rain totals |
| `marine.ts`             | NOAA marine/buoy   | Swell height, period, direction           |
| `tides.ts`              | NOAA tides         | Point Reyes + SF Bar                      |
| `sun.ts`                | Sunrise/sunset     | Solar calculations                        |
| `uv.ts`                 | UV index           | OpenUV adapter                            |
| `airnow.ts`             | AirNow AQI         | Air quality index                         |
| `usgs.ts`               | USGS earthquakes   | Recent seismic activity                   |
| `nps.ts`                | NPS alerts         | Point Reyes, Muir Woods, GGNRA            |
| `calfire.ts`            | CAL FIRE incidents | Active fires                              |
| `transit.ts`            | 511 traffic events | Road closures, incidents                  |
| `housing.ts`            | Marin Open Data    | Housing transactions                      |
| `blotter.ts`            | Marin Sheriff      | Crime blotter                             |
| `police-logs.ts`        | Municipal PDs      | 10 departments                            |
| `activity.ts`           | Static JSON        | Supplemental activity data                |
| `streams.ts`            | USGS streamflow    | Water levels                              |
| `article-enrichment.ts` | Content extraction | Article summaries                         |

## Source / Scrape Policy

Current policy is not "no scraping."

Actual policy:

- prefer official APIs, RSS, GTFS, JSON, and other structured feeds first
- if no clean feed exists, low-throughput local public pages may be parsed
- avoid hostile or brittle scraping patterns
- cache aggressively
- do not hammer small local sites
- do not invent precision we do not have
- do not use X/Twitter as the primary backbone if a structured source exists

Practical rule:

- official RSS/API > official structured page > low-throughput community page > social media

## Location / Mapping Decisions

Very important product decision:

- do not fabricate precise map pins
- exact coordinates only when we truly have exact coordinates or a strong address geocode
- otherwise use approximate/town-level placement
- if we cannot honestly place an item, keep it unassigned
- `detectTown()` scans title only (not description/content) to prevent false geo-tagging

Current map/location behavior:

- true story pins when exact or approximated coordinates are available
- town-level aggregate behavior otherwise
- inspector drawer should expose both pinned and unpinned town items

## Traffic Decisions

Traffic model now in use:

- Mapbox Traffic v1 for congestion lines
- 511 for discrete incidents / traffic events
- one visible `Traffic` toggle that controls both

Important env requirement:

- without `VITE_MAPBOX_TOKEN`, the map only shows 511 event points and not corridor congestion

Reference: `docs/traffic-provider-evaluation.md`

## Crime & Safety Decisions

Crime coverage is now broader than newspaper crime RSS.

What is live:

- Marin Sheriff blotter with code translation and map placement when coordinates exist
- 10 municipal/public-safety supplemental feeds (Fairfax, Mill Valley, Ross, Tiburon, Belvedere, Central Marin, Novato, San Rafael, Sausalito PDs)

Reference: `docs/police-coverage.md`

## Camera Sources

9 cameras across 3 categories:

| Category    | Cameras                                          | Type                                  |
| ----------- | ------------------------------------------------ | ------------------------------------- |
| Traffic (4) | 101 at Spencer, SR-1, I-580, Ignacio Blvd        | Caltrans JPEG, 10s refresh            |
| Scenic (3)  | Mt. Tam Summit, Golden Gate Bay View, Muir Beach | ABC7 JPEG + Windy iframe              |
| Fire (2)    | Mt. Tam East, Mt. Tam West                       | ALERTCalifornia CDN JPEG, 10s refresh |

Fire cams use direct snapshot URLs from `cameras.alertcalifornia.org/public-camera-data/` (public CDN, no auth, 1920x1080, near-infrared night vision). Previously used iframe embeds of the full ALERTCalifornia console UI — switched to snapshots for clean rendering.

## Alert Keyword System

`containsAlertKeyword()` in `keywords.ts` uses `hasWholePhrase()` (word-boundary regex) instead of `.includes()`. This prevents false positives:

- "MarinFire" does NOT trigger (no word boundary before "fire")
- "fire on Miller Ave" DOES trigger (proper word boundary)
- Safety hub pages (AlertMarin, MarinFire portals) are removed from the wire

## Weather & Rain Data

Two NWS data paths:

1. **Standard forecast** (`/forecast`): 7-day periods with temperatures, descriptions
2. **Hourly + QPF** (`/forecast/hourly` + `/gridpoints`):
   - Hourly temperature sparkline (24h)
   - Quantitative Precipitation Forecast from raw gridpoints data
   - 6-hour QPF windows in mm, aggregated by local date, converted to inches
   - Shown in WeatherPanel "Peak Rain" card and OutlooksPanel 5-day forecast

## Activity / Culture Vertical Status

### Cycling & Endurance

Sources: B-17/Webscorer, Marinduro, Dipsea, Quad Dipsea, Miwok 100K, Marin Ultra Challenge

### Shows & Events

Sources: Sweetwater, Rancho Nicasio, Mac's, Dance Palace, JCC, Tourist Club, Peri's, Smiley's, KWMR, Seahorse, Symphony, HopMonk, The Junction, libraries, Elks

### Sports & Prep

Sources: Redwood Bark, NorCal MTB, Marin Catholic/Archie Williams/San Rafael athletics, TUHSD, San Rafael Pacifics, Marin Rowing, Marin Highlanders

### Fishing

Sources: CDFW regulations, Point Reyes Light fishing stories

### Farm & Market

Sources: Agricultural Institute of Marin, Point Reyes Farmstead Cheese, Marin Magazine food/market

### Outdoors

Sources: MMWD, Marin IJ Environment, Marin Humane, WildCare, NPS alerts

## Backlog Themes Already Discussed

Worth building later:

- SeeClickFix / civic requests
- surf spots using Open-Meteo + NOAA + NDBC, not Surfline scraping
- faith/community feeds, including St. Paul's Episcopal in downtown San Rafael
- beer / wine / pubs
- hunting / game / public land if enough real Marin signal exists
- Twitter/X fire intelligence feeds (@MarinFireDept, @alertwildfire) as supplemental source
- rowing / sailing may eventually justify a dedicated water-sports family

Explicitly deprioritized / parked:

- broad Strava KOM tracking as a near-term backbone
- Magicseaweed / Surfline API strategy

## Current Open Issues

1. Performance

- still too much first-load client fanout
- hard refresh remains heavier than it should be
- large client chunk warning still exists in build output

2. Crime depth

- uneven municipal data depth
- Central Marin assignment still needs improvement
- OCR is still needed for some PDF-based logs

3. Vertical quality

- Shows & Events needs stronger curation
- Sports & Prep needs more parsed schedules/results and fewer generic hubs
- Fishing and Farm need deeper source coverage

4. UI polish

- wire density is better, but source freshness and quality signals are still underexposed
- some panels remain more decorative than analytical

## Important Product Decisions Already Made

These should be preserved unless there is a strong reason to revisit them:

- `Safety` was renamed to `Crime & Safety`
- `Outdoors` was renamed to `Outdoors & Lifestyle`
- `Cycling` + `Endurance` are one visible wire, not two visible wires
- `Shows` has broadened into `Shows & Events`
- `Prep Sports` has broadened into `Sports & Prep`
- do not fake pin precision on the map
- title-only town detection (not full text) to prevent false geo-tagging
- word-boundary alert keyword matching to prevent false ALERT badges
- inspector drawer is the preferred interaction model for map storytelling
- social media is secondary, not backbone
- official/local sources should win whenever possible
- fire cams use direct CDN snapshots, not iframe embeds
- signal deck is collapsible with persisted state
- UI zoom is user-configurable (50-150%)
- wire columns have no max-width cap (fully responsive)

## Commands

Use these from `/Users/tammypais/projects/marin-monitor`:

```bash
npm run dev
npm run build
npm run preview
npm run check
npm run lint
npm run test:unit
npm run sync:police
npm run sync:activity
npm run traffic:evaluate
```

## Environment Variables

Current relevant env vars:

```bash
VITE_511_API_KEY=...
VITE_NPS_API_KEY=...
VITE_MAPBOX_TOKEN=...
```

Optional:

```bash
VITE_AIRNOW_API_KEY=...
```

## Key Files / Docs

Main page / layout:

- `src/routes/+page.svelte`

Stores / category model:

- `src/lib/stores/news.ts`
- `src/lib/stores/map.ts`
- `src/lib/stores/settings.ts`

Panel config / presets:

- `src/lib/config/panels.ts`
- `src/lib/config/presets.ts`
- `src/lib/config/relevance.ts`
- `src/lib/config/cameras.ts`
- `src/lib/config/feeds.ts`
- `src/lib/config/keywords.ts`

Ingest / adapters:

- `src/lib/api/marin/index.ts`
- `src/lib/api/marin/rss.ts`
- `src/lib/api/marin/nws-hourly.ts`
- `src/lib/api/marin/blotter.ts`
- `src/lib/api/marin/police-logs.ts`
- `src/lib/api/marin/activity.ts`

Static sync scripts:

- `scripts/extract-police-logs.mjs`
- `scripts/extract-activity-feeds.mjs`

Generated datasets:

- `static/data/marin-police-logs.json`
- `static/data/marin-activity.json`

Planning docs:

- `BACKLOG.md`
- `docs/police-coverage.md`
- `docs/traffic-provider-evaluation.md`

## Validation State At Handoff

As of this handoff:

- `npm run sync:activity` passing
- `npm run sync:police` passing
- `npm run check` passing (0 errors, 0 warnings)
- `npm run lint` passing
- `npm run test:unit` passing (103 tests)
- `npm run build` passing

Known non-blocking warning:

- large client chunk warning still appears during build

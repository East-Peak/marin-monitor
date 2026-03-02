# CLAUDE.md — Marin Monitor

## What This Is

Marin Monitor is a local situational-awareness dashboard for Marin County, California.
It aggregates public data, local news, and cultural signals into a map-based interface.

Inspired by [hipcityreg/situation-monitor](https://github.com/hipcityreg/situation-monitor) — same SvelteKit + D3 stack, but focused on Marin instead of global geopolitics.

**Tone:** Half civic dashboard, half Marin inside joke. Neutral, playful, observational. Not investigative journalism, not political advocacy, not breaking news.

## Development Commands

```bash
npm run dev            # Start dev server (localhost:5173)
npm run build          # Build to /build directory
npm run preview        # Preview production build (localhost:4173)
npm run check          # TypeScript type checking
npm run test           # Run Vitest in watch mode
npm run test:unit      # Run unit tests once (103 tests)
npm run test:e2e       # Run Playwright E2E tests
npm run lint           # ESLint + Prettier check
npm run format         # Auto-format with Prettier
npm run sync:activity  # Regenerate static/data/marin-activity.json
npm run sync:police    # Regenerate static/data/marin-police-logs.json
```

## Technology Stack

- **SvelteKit 2.0** with Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`)
- **TypeScript** (strict mode)
- **Tailwind CSS** with dark theme
- **D3.js** (d3-selection, d3-scale, d3-shape) for chart/sparkline rendering
- **MapLibre GL** for base map with Mapbox traffic overlay
- **Vitest** (unit) + **Playwright** (E2E)
- **Vercel adapter** (`@sveltejs/adapter-vercel`) — deploys with server routes

## Project Architecture

### Core Directories (`src/lib/`)

- **`api/marin/`** — Data adapters (RSS, NWS, NWS hourly/QPF, NOAA tides, NOAA marine, AirNow, USGS, NPS, UV, sun, CalFire, transit, housing, activity, blotter, police-logs, article-enrichment)
- **`analysis/`** — Story correlation, narrative tracking, entity extraction
- **`components/`** — Svelte components: layout/, panels/, modals/, common/
- **`config/`** — Configuration-driven: feeds, keywords, towns, map, panels, cameras, presets, relevance, analysis, api
- **`geo/`** — Town geo-tagging, H3 hex grid utilities
- **`services/`** — Resilience layer: CacheManager, CircuitBreaker, RequestDeduplicator, ServiceClient
- **`stores/`** — Svelte stores: news, settings, monitors, refresh orchestration
- **`types/`** — TypeScript interfaces

### Path Aliases

```typescript
$lib        → src/lib
$components → src/lib/components
$stores     → src/lib/stores
$services   → src/lib/services
$config     → src/lib/config
$types      → src/lib/types
```

## Key Architectural Patterns

### Service Layer (`src/lib/services/`)

API adapters call fetch directly (with timeout wrappers). A resilience layer exists in `services/` but is not yet wired into adapters:

- **CacheManager**: Per-service caching with TTL and stale-while-revalidate
- **CircuitBreaker**: Prevents cascading failures from flaky sources
- **RequestDeduplicator**: Prevents concurrent duplicate requests

### Multi-Stage Refresh (`src/lib/stores/refresh.ts`)

Data fetches happen in 3 priority stages:

1. Critical (0ms): Local news, fire/weather alerts
2. Secondary (2s): Air quality, tides, traffic
3. Tertiary (4s): Community, outdoor, civic data

### Configuration-Driven Design (`src/lib/config/`)

- `feeds.ts` — Local RSS sources with verification levels (26 feeds across 11 categories)
- `keywords.ts` — Alert keywords (wildfire, PSPS, evacuation) + town detection (word-boundary matching)
- `towns.ts` — Marin town definitions with coordinates
- `panels.ts` — Panel registry with display order
- `cameras.ts` — Webcam config: Caltrans traffic, Windy scenic, ALERTCalifornia fire (9 cameras, 3 categories)
- `map.ts` — Marin geography, fire zones, landmarks, SMART stations, NWS/tide/earthquake params
- `relevance.ts` — Local-vs-global scoring with strict/mixed source rules and editorial detection
- `presets.ts` — Layout presets for different user modes
- `analysis.ts` — Local correlation topics and narrative patterns

### Dashboard Layout

Top section (collapsible signal deck):

- **Left column**: Marin Map, Cameras
- **Middle column**: Pulse, Outlooks, Environment
- **Right column**: Weather, Signals, Coastal Conditions

Wire columns below (responsive grid, auto-fit):

- Local Wire, Crime & Safety, Civic, Outdoors & Lifestyle, Marin Lately (satire)
- Cycling & Endurance, Shows & Events, Sports & Prep, Farm & Market

### Map Layers

Toggleable layers on the Marin map:

- **Civic** — County announcements, public meetings, agency releases
- **News** — Local media stories, geo-tagged by town
- **Safety** — Fire alerts, emergency announcements, road closures
- **Housing** — Recent transactions, market activity
- **Activity** — Local events, races, community
- **Satire** — Marin Lately "unconfirmed reports" (clearly labeled)
- **Traffic** — Mapbox congestion lines + 511 incident points

### Verification Levels

Every story carries a `verification_level`:

- **Official** — County/city pages, NWS, emergency portals
- **Local Media** — Marin IJ, Point Reyes Light, Pacific Sun, KQED, NBC Bay Area
- **Community** — Marin Humane, WildCare, community organizations
- **Satire** — Marin Lately (displayed with dashed outlines, behind "Enable Vibes" toggle)

### Alert Keywords

`containsAlertKeyword()` uses word-boundary matching (`hasWholePhrase()`) to prevent false positives. "MarinFire" won't trigger, but "fire on Miller Ave" will. Title-only scanning for town detection to prevent false geo-tagging.

## Data Sources

| Source                              | Type       | API Key?   |
| ----------------------------------- | ---------- | ---------- |
| Marin IJ / local news (7 feeds)     | RSS        | No         |
| Point Reyes Light, Pacific Sun      | RSS        | No         |
| Marin Magazine                      | RSS        | No         |
| NBC Bay Area (Marin), KQED          | RSS        | No         |
| City of San Rafael, Town of Fairfax | RSS        | No         |
| Marin County BOS (Granicus)         | RSS        | No         |
| Marin Humane, WildCare              | RSS        | No         |
| MMWD / Marin Water                  | RSS        | No         |
| National Weather Service            | REST       | No         |
| NWS Hourly + QPF (rain totals)      | REST       | No         |
| NOAA Tides (Pt Reyes / SF Bar)      | REST       | No         |
| NOAA Marine (nearshore buoys)       | REST       | No         |
| USGS Earthquakes                    | REST       | No         |
| AirNow AQI                          | REST       | Yes (free) |
| NPS Alerts                          | REST       | Yes (free) |
| 511 Traffic Events                  | REST       | Yes (free) |
| Mapbox Traffic v1                   | Tiles      | Yes        |
| ALERTCalifornia fire cams           | Image CDN  | No         |
| Caltrans CCTV                       | Image      | No         |
| Marin Open Data (Socrata)           | REST       | No         |
| Marin Lately                        | RSS/scrape | No         |
| 20+ activity/event scrapers         | Scrape     | No         |

## Design Constraints

- **No per-request LLM calls.** Keep inference light — scheduled batch jobs only, cached results.
- **No fragile scraping.** Use RSS and documented APIs. Never scrape Zillow.
- **Politically neutral.** No political scoring, ideological narratives, risk ratings, or fraud claims.
- **Satire clearly labeled.** Marin Lately items always marked "Satire / Unconfirmed" with distinct visual treatment.
- **No fake map precision.** Exact coordinates only when we truly have them. Town-level placement otherwise.
- **Low operating cost.** Target ~$70/month total (hosting + APIs + inference).
- **Caching everywhere.** Use ServiceClient with appropriate TTLs for all data fetching.

## Settings

User-configurable via Settings modal:

- **UI Scale** (50-150%) — CSS zoom on document root, persisted to localStorage
- **Dashboard collapse** — Hide/show the signal deck section
- **Panel order** — Drag-and-drop reorder of wire columns
- **Preset layouts** — Quick-switch between curated panel arrangements

## Testing

Unit tests alongside source as `*.test.ts`. E2E tests in `tests/e2e/*.spec.ts`.

## Workflow

- Work in feature branches, not main
- Leave clear commit messages (Tammy reads them for PR review)
- Leave `TODO:` comments for uncertain items

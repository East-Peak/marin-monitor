# CLAUDE.md — Marin Monitor

## What This Is

Marin Monitor is a local situational-awareness dashboard for Marin County, California.
It aggregates public data, local news, and cultural signals into a map-based interface.

Inspired by [hipcityreg/situation-monitor](https://github.com/hipcityreg/situation-monitor) — same SvelteKit + D3 stack, but focused on Marin instead of global geopolitics.

**Tone:** Half civic dashboard, half Marin inside joke. Neutral, playful, observational. Not investigative journalism, not political advocacy, not breaking news.

## Development Commands

```bash
npm run dev          # Start dev server (localhost:5173)
npm run build        # Build to /build directory
npm run preview      # Preview production build (localhost:4173)
npm run check        # TypeScript type checking
npm run test         # Run Vitest in watch mode
npm run test:unit    # Run unit tests once
npm run test:e2e     # Run Playwright E2E tests
npm run lint         # ESLint + Prettier check
npm run format       # Auto-format with Prettier
```

## Technology Stack

- **SvelteKit 2.0** with Svelte 5 runes (`$state`, `$derived`, `$effect`)
- **TypeScript** (strict mode)
- **Tailwind CSS** with dark theme
- **D3.js** for map visualization + H3 hex grid overlay
- **Vitest** (unit) + **Playwright** (E2E)
- **Static adapter** — deploys as pure static site

## Project Architecture

### Core Directories (`src/lib/`)

- **`api/marin/`** — Data adapters for Marin sources (RSS, NWS, Socrata, NOAA tides, AirNow, USGS)
- **`analysis/`** — Story correlation, narrative tracking, entity extraction
- **`components/`** — Svelte components: layout/, panels/, modals/, common/
- **`config/`** — Configuration-driven: feeds, keywords, towns, map, panels
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
All HTTP requests go through `ServiceClient` which integrates:
- **CacheManager**: Per-service caching with TTL and stale-while-revalidate
- **CircuitBreaker**: Prevents cascading failures from flaky sources
- **RequestDeduplicator**: Prevents concurrent duplicate requests

### Multi-Stage Refresh (`src/lib/stores/refresh.ts`)
Data fetches happen in 3 priority stages:
1. Critical (0ms): Local news, fire/weather alerts
2. Secondary (2s): Air quality, tides, traffic
3. Tertiary (4s): Community, outdoor, civic data

### Configuration-Driven Design (`src/lib/config/`)
- `feeds.ts` — Local RSS sources (Marin IJ, Patch, county/city sites, emergency portals)
- `keywords.ts` — Alert keywords (wildfire, PSPS, evacuation) + town detection
- `towns.ts` — Marin town definitions with coordinates
- `panels.ts` — Panel registry with display order
- `map.ts` — Marin geography, town boundaries, fire zones
- `analysis.ts` — Local correlation topics and narrative patterns

### Map Layers (`src/lib/components/panels/MarinMapPanel.svelte`)
Toggleable layers on the Marin map:
- **Civic** — County announcements, public meetings, agency releases
- **News** — Local media stories, geo-tagged by town
- **Safety** — Fire alerts, emergency announcements, road closures
- **Housing** — Recent transactions, market activity
- **Activity** — Strava KOM changes, local events
- **Satire** — Marin Lately "unconfirmed reports" (clearly labeled)

### Verification Levels
Every story carries a `verification_level`:
- **Official** — County/city pages, NWS, emergency portals
- **Local Media** — Marin IJ, SF Chronicle, Patch
- **Community** — Social, NextDoor, scanner mentions
- **Satire** — Marin Lately (displayed with dashed outlines, behind "Enable Vibes" toggle)

## Data Sources (V1)

| Source | Type | API Key? |
|--------|------|----------|
| Marin IJ / local news | RSS | No |
| Marin County emergency portal | RSS | No |
| City news pages (CivicEngage) | RSS | No |
| National Weather Service | REST | No |
| NOAA Tides (Pt Reyes / SF) | REST | No |
| USGS Earthquakes | REST | No |
| AirNow AQI | REST | Yes (free) |
| Marin Open Data (Socrata) | REST | No |
| Strava segments | REST | Yes (free, rate limited) |
| Marin Lately | RSS/scrape | No |

## Design Constraints

- **No per-request LLM calls.** Keep inference light — scheduled batch jobs only, cached results.
- **No fragile scraping.** Use RSS and documented APIs. Never scrape Zillow.
- **Politically neutral.** No political scoring, ideological narratives, risk ratings, or fraud claims.
- **Satire clearly labeled.** Marin Lately items always marked "Satire / Unconfirmed" with distinct visual treatment.
- **Low operating cost.** Target ~$70/month total (hosting + APIs + inference).
- **Caching everywhere.** Use ServiceClient with appropriate TTLs for all data fetching.

## Testing

Unit tests alongside source as `*.test.ts`. E2E tests in `tests/e2e/*.spec.ts`.

## Workflow

- Work in feature branches, not main
- Leave clear commit messages (Tammy reads them for PR review)
- Leave `TODO:` comments for uncertain items

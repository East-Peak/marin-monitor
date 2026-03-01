# Marin Monitor

Local situational awareness for Marin County, California.

Aggregates public data, local news, weather, marine conditions, traffic, and cultural signals into a map-based dashboard. Inspired by [Situation Monitor](https://github.com/hipcityreg/situation-monitor).

Half civic dashboard, half Marin inside joke.

## Stack

- **SvelteKit 2** with Svelte 5 runes
- **TypeScript** (strict)
- **Tailwind CSS** dark theme
- **D3.js** for map + charts
- **MapLibre GL** for base map with Mapbox traffic overlay
- **Vitest** (unit) + **Playwright** (E2E)
- **Static adapter** (`@sveltejs/adapter-static`)

## Quick Start

```bash
npm install
npm run dev            # localhost:5173
```

## Commands

```bash
npm run dev            # Dev server
npm run build          # Production build → /build
npm run preview        # Preview production build
npm run check          # TypeScript type checking
npm run lint           # ESLint + Prettier
npm run format         # Auto-format
npm run test:unit      # Unit tests (103 tests)
npm run test:e2e       # Playwright E2E tests
npm run sync:activity  # Regenerate static/data/marin-activity.json
npm run sync:police    # Regenerate static/data/marin-police-logs.json
```

## Data Sources

| Source | Type | Key? |
|--------|------|------|
| Marin IJ, Point Reyes Light, Pacific Sun, Marin Magazine | RSS | No |
| NBC Bay Area (Marin tag), KQED | RSS | No |
| City of San Rafael, Town of Fairfax | RSS | No |
| Marin County BOS (Granicus) | RSS | No |
| Marin Humane, WildCare | RSS | No |
| MMWD / Marin Water | RSS | No |
| Marin Lately (satire) | RSS | No |
| National Weather Service (hourly + 7-day + QPF) | REST | No |
| NOAA Tides (Point Reyes, SF Bar) | REST | No |
| NOAA Marine (nearshore buoys) | REST | No |
| USGS Earthquakes | REST | No |
| AirNow AQI | REST | Yes (free) |
| NPS Alerts (Pt Reyes, Muir Woods, GGNRA) | REST | Yes (free) |
| 511 Traffic Events | REST | Yes (free) |
| Mapbox Traffic v1 congestion | Vector tiles | Yes |
| Marin County Open Data (Socrata) | REST | No |
| ALERTCalifornia fire cams (Mt Tam) | Image CDN | No |
| Caltrans CCTV (US-101 corridor) | Image | No |
| Windy.com webcams (Tiburon, Muir Beach) | Embed | No |
| 20+ activity/event sources (venues, races, civic) | Scrape/RSS | No |
| Marin Sheriff blotter + 10 municipal PD feeds | RSS/scrape | No |

## Environment Variables

```bash
VITE_511_API_KEY=...       # 511.org traffic events
VITE_NPS_API_KEY=...       # National Park Service alerts
VITE_MAPBOX_TOKEN=...      # Mapbox traffic + base map
VITE_AIRNOW_API_KEY=...    # AirNow AQI (optional)
```

## Architecture

See `CLAUDE.md` for full architecture docs, `HANDOFF.md` for operational context, and `BACKLOG.md` for roadmap.

## License

Private project — East Peak Advisors, LLC.

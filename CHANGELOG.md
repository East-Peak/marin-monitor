# Changelog

All notable changes to Marin Monitor are documented here.

---

## 2026-03-03

### Added
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

# Changelog

All notable changes to Marin Monitor are documented here.

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

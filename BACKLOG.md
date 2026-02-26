# Marin Monitor — Backlog

Living document. Items roughly ordered by priority within each phase.

---

## Phase 1: Get Data Flowing (MVP)

### RSS Adapter + Local Wire
- [ ] Build `src/lib/api/marin/rss.ts` — fetch and parse RSS feeds via CORS proxy
- [ ] Wire up the 6 confirmed-working feeds:
  - Marin IJ (`marinij.com/feed/`)
  - Point Reyes Light (`ptreyeslight.com/feed/`)
  - City of San Rafael (`cityofsanrafael.org/feed/`)
  - Town of Fairfax (`townoffairfaxca.gov/feed/`) — note: domain changed from townoffairfax.org
  - MMWD / Marin Water (`marinwater.org/feed/`)
  - Marin Lately / satire (`marinlately.com/feed/`)
- [ ] Drop dead feeds from config: all 3 Patch feeds, West Marin Feed (domain gone)
- [ ] Move blocked feeds to a "needs proxy or scraping" list: Marin County official (Cloudflare 403), CAL FIRE (Akamai 403)
- [ ] Fix NPS Point Reyes feed URL (returns HTML, not RSS — NPS deprecated feed infra)
- [ ] Add more working city/town feeds as discovered

### NWS Weather Adapter
- [ ] Build `src/lib/api/marin/nws.ts` — NWS forecast + alerts
- [ ] Zones: CAZ505 (coast), CAZ506 (interior valleys), CAZ502 (coastal range)
- [ ] Fire weather zone: CAZ506
- [ ] Alerts endpoint: `api.weather.gov/alerts/active?zone=CAZ505,CAZ506`
- [ ] Forecast endpoint: `api.weather.gov/gridpoints/MTR/{x},{y}/forecast`
- [ ] Build Weather panel component

### Pulse Panel
- [ ] Build `PulsePanel.svelte` — at-a-glance dashboard stats
- [ ] Stories in last 24h, active alerts, AQI, temperature, next tide, last earthquake

### Main Character of Marin
- [ ] Rebuild `src/lib/analysis/main-character.ts` for local use
- [ ] Track: which **town** dominates coverage, which **topic**, which **person/entity**
- [ ] "Main Character of Marin This Week: Fairfax" — fits the playful tone
- [ ] Build `MainCharPanel.svelte`

---

## Phase 2: The Map

### Marin Map with D3
- [ ] Build `MarinMapPanel.svelte` — D3 SVG map of Marin County
- [ ] County boundary from TopoJSON/GeoJSON (Census TIGER data)
- [ ] Town markers with labels
- [ ] Fire zone overlays (Mt. Tam, San Geronimo Valley, etc.)
- [ ] Landmark markers (bridges, peaks, ferry terminals)
- [ ] Toggleable layers: civic, news, safety, housing, activity, satire
- [ ] Story dots on map, colored by category, clickable

### H3 Hex Grid Overlay
- [ ] Add `h3-js` dependency
- [ ] Generate hex grid at resolution 7-8 covering Marin bounds
- [ ] Color hexes by data density per active layer
- [ ] Red hexes where fire/safety alerts cluster
- [ ] Blue for civic, purple for news, pink dashed for satire
- [ ] Tooltip on hex hover showing item count + top headline
- [ ] Inspired by Retard Mode's spatial scoring approach

---

## Phase 3: Real-Time Data Sources

### Surf & Ocean Conditions
- [ ] Build `src/lib/api/marin/surf.ts`
- [ ] **Open-Meteo Marine API** (FREE, no auth, JSON) — wave height, swell, period, direction
  - `marine-api.open-meteo.com/v1/marine?latitude=37.9&longitude=-122.8&hourly=wave_height,swell_wave_height,swell_wave_period`
- [ ] **NOAA NDBC Buoys** (FREE, no auth, text) — ground truth
  - Buoy 46026 (San Francisco): `ndbc.noaa.gov/data/realtime2/46026.txt`
  - Buoy 46013 (Bodega Bay): `ndbc.noaa.gov/data/realtime2/46013.txt`
- [ ] **CDIP Buoy 029** (Point Reyes) — real-time wave spectra via OPeNDAP
  - `thredds.cdip.ucsd.edu/thredds/dodsC/cdip/realtime/029p1_rt.nc.ascii`
- [ ] **NWS High Surf Advisories** — `api.weather.gov/alerts/active?zone=CAZ505&event=High%20Surf%20Advisory`
- [ ] **NWS Marine Forecast** (fog, marine layer) — `tgftp.nws.noaa.gov/data/forecasts/marine/coastal/pz/pzz540.txt`
- [ ] Surfline unofficial API for enrichment only (could break): spotId `5842041f4e65fad6a77089c2` (Bolinas)
- [ ] Build Surf/Ocean panel component — swell height, period, direction, water temp, surf advisory status

### Traffic Cameras
- [ ] Build `src/lib/api/marin/cameras.ts`
- [ ] **Caltrans CCTV** (FREE, no auth, CORS enabled) — goldmine
  - Camera list JSON: `cwwp2.dot.ca.gov/data/d4/cctv/cctvStatusD04.json`
  - Static images (refresh every 5s): direct JPEG URLs
  - HLS streams: `wzmedia.dot.ca.gov/D4/{camera}.stream/playlist.m3u8`
  - 36 cameras in Marin: US-101, I-580, SR-37
- [ ] Filter Marin cameras from District 4 JSON by lat/lon bounds
- [ ] Build traffic camera panel — grid of thumbnail images, click to enlarge
- [ ] Overlay camera locations on Marin map

### Fire Lookout Cameras (Mt. Tam)
- [ ] **ALERTCalifornia** camera network
  - Camera location API: `ops.alertcalifornia.org/api/getCameraDataByLoc` (no auth, returns JSON)
  - Mt Tam East (console ~2192), Mt Tam West (console ~2193)
  - 12 wildfire detection cameras total in Marin County
  - Image access requires the camera console web UI (no public image API)
- [ ] Option A: Link out to camera console pages
- [ ] Option B: Playwright scraping for image capture (fragile, matches CLAUDE.md "no fragile scraping" constraint — evaluate)
- [ ] Display camera locations on map

### Traffic Data & Transit
- [ ] **511.org Traffic Events** (FREE, API token required — register at 511.org)
  - `api.511.org/traffic/events?api_key=[key]` — incidents, closures, construction
  - 60 req/hour
- [ ] **SMART Train** — GTFS-RT via 511.org regional feed
- [ ] **Golden Gate Transit** — GTFS static at `realtime.goldengate.org/gtfsstatic/GTFSTransitData.zip`
- [ ] **Marin Transit** — GTFS static at `marintransit.gov/data/google_transit.zip`; real-time via Swiftly (need API key from Marin Transit)
- [ ] Build Traffic panel — active incidents, road closures, transit status

### Air Quality
- [ ] Build `src/lib/api/marin/airquality.ts`
- [ ] **AirNow API** (FREE, API key required — register at airnowapi.org)
  - `airnowapi.org/aq/observation/latLong/current?latitude=37.97&longitude=-122.53&distance=25&API_KEY=[key]`
- [ ] Display AQI in Pulse panel and on map
- [ ] Color coding: green/yellow/orange/red/purple

### Tides
- [ ] Build `src/lib/api/marin/tides.ts`
- [ ] **NOAA CO-OPS** (FREE, no auth)
  - Point Reyes station 9415020
  - San Francisco station 9414290
  - `api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=9415020&product=predictions&datum=MLLW&time_zone=lst_ldt&units=english&format=json`
- [ ] Display next high/low in Pulse panel

### Earthquakes
- [ ] Build `src/lib/api/marin/earthquakes.ts`
- [ ] **USGS** (FREE, no auth) — already in service registry
  - `earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=37.97&longitude=-122.53&maxradiuskm=100&minmagnitude=2.0&limit=10`
- [ ] Display on map + in Pulse panel

---

## Phase 4: Deep Features

### Housing Data
- [ ] Research: ATTOM API for property transactions (paid — ~$100/mo?)
- [ ] **Marin County Socrata** — limited: aggregate tax revenue only, no parcel-level data
  - Code enforcement cases: `data.marincounty.gov/resource/ti2m-gwng.json`
  - Property tax collected: `data.marincounty.gov/resource/tezz-bbg4.json`
- [ ] Zillow/Redfin — explicitly off-limits per CLAUDE.md (no scraping)
- [ ] Build Housing panel with whatever data is available

### Strava KOM Tracking
- [ ] Strava API (FREE tier, rate limited) — track segment KOM changes on local trails
- [ ] Mt. Tam, Camino Alto, Paradise Loop, Bolinas Ridge segments
- [ ] "KOM changed on Camino Alto" as an activity-layer event

### PG&E PSPS Monitoring
- [ ] No clean API exists
- [ ] Best proxy: NWS Red Flag Warnings via `api.weather.gov`
- [ ] Could monitor Simon Willison's `pge-outages` scraper data as a secondary signal
- [ ] Outage map scraping is fragile — probably skip per design constraints

### Fog Tracker
- [ ] NWS marine forecast text parsing for fog mentions
- [ ] NWS Area Forecast Discussion (AFD) from MTR office: `api.weather.gov/products/types/AFD/locations/MTR`
- [ ] "Marine layer burning off by noon" — classic Marin data point
- [ ] Could be a fun small panel or Pulse stat

### Crime Data
- [ ] Marin County Socrata has crime data but only for specific neighborhoods (Sleepy Hollow, Oak Crest)
- [ ] Not county-wide — limited utility
- [ ] May need to find other sources or skip for V1

---

## Someday / Maybe

- [ ] Marin Humane Society — lost pets feed?
- [ ] School closures / district announcements RSS
- [ ] Local event calendars (community centers, libraries)
- [ ] Marin magazine or Marin Scope RSS if available
- [ ] Tip jar integration (Stripe) — monetization per blueprint
- [ ] Local sponsor ad slots — per blueprint revenue model
- [ ] Batch LLM summarization of daily news (scheduled, cached — no per-request inference)
- [ ] Mobile-responsive layout optimization
- [ ] PWA support for phone home screen
- [ ] Email digest — daily/weekly summary

---

## Dead Ends (don't bother)

- **Patch RSS** — all endpoints return 404, they killed RSS
- **West Marin Feed** — domain doesn't resolve
- **NPS RSS feeds** — infrastructure deprecated, returns HTML
- **Google Maps traffic API** — paid, prohibits scraping
- **PG&E PSPS API** — doesn't exist, scraping is fragile
- **Zillow/Redfin scraping** — explicitly prohibited
- **FamilySearch API** — not relevant and not approving projects anyway
- **MagicSeaweed** — acquired by Surfline and shut down in 2023

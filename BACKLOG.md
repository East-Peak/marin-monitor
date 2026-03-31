# Marin Monitor — Backlog

Updated: 2026-03-31

## Current Snapshot

### Completed recently

- [x] Marin county data ingest in place (RSS + NWS + NOAA tides + USGS quakes + NPS + 511 transit + housing dataset)
- [x] Map panel implemented with towns, layers, hover/click interactions, and town-level filtering
- [x] Weather panel with temperature sparkline, hourly forecast, sunrise/sunset, and QPF rain totals
- [x] Outlooks panel with 5-day weather (including rain amounts), 5-day swell, and summary highlight cards
- [x] Cameras panel with 3 category tabs (Traffic/Scenic/Fire), 9 cameras including ALERTCalifornia fire cams
- [x] Housing panel implemented from static extracted dataset
- [x] Relevance filter and local enrichment (town/topic/alert tagging) with word-boundary matching
- [x] Pulse panel implemented (stories, alerts, temp, next tide, last quake, last refresh)
- [x] Category panel visual differentiation added (safety/civic/outdoors/satire)
- [x] Responsive weather chart redraw on resize
- [x] Quality baseline restored (`npm run check`, `npm run test:unit`, `npm run lint` all passing)
- [x] Traffic overlay implemented with Mapbox congestion + 511 traffic events
- [x] Crime & Safety expanded beyond newspapers (Marin Sheriff blotter + 10 municipal public-safety feeds)
- [x] New wire-style verticals added: Cycling & Endurance, Shows & Events, Sports & Prep, Fishing, Farm & Market
- [x] Supplemental static activity sync implemented at `static/data/marin-activity.json`
- [x] False ALERT badge fix (word-boundary matching in `containsAlertKeyword()`)
- [x] False geo-tagging fix (title-only `detectTown()` scanning)
- [x] SMART train stations expanded from 2 to 6 with verified GPS coordinates
- [x] UI zoom/scale setting (50-150%) with localStorage persistence
- [x] Fully responsive wire columns (no max-width cap)
- [x] Collapsible signal deck with persisted state
- [x] Dashboard rebalanced (Environment moved to middle column, stretch-flush columns)
- [x] ALERTCalifornia fire cams switched from iframe to direct JPEG snapshots (10s auto-refresh)
- [x] WildCare (discoverwildcare.org) added as RSS feed source

## Next Sprint (Highest Priority)

### 1) Pre-Launch Quality

- [ ] Adversarial testing pass — identify and fix remaining edge cases
- [ ] Verify all data sources are live and returning content
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Mobile responsiveness audit (< 768px)
- [ ] Performance profiling — largest contentful paint, bundle size

### 2) Performance / Production Architecture

- [ ] Move from static-only first-load fanout toward cached server/bootstrap payloads
- [ ] Reduce duplicate panel fetches (weather/tides/marine/housing)
- [ ] Add edge caching / stale-while-revalidate strategy for production
- [ ] Add a fast first-paint snapshot path for hard refreshes

### 3) Crime & Safety Depth

- [ ] Improve Central Marin town assignment from road/place hints without inventing false precision
- [ ] Add OCR or better extraction for Fairfax / Mill Valley / Ross document logs
- [ ] Evaluate Community Crime Map / vendor-backed sources only if official sources remain too shallow
- [ ] Decide which blotter-derived spikes should surface in Pulse / Signals

### 4) Vertical Expansion / Quality

- [ ] Tighten Shows & Events density / curation window so venue calendars stay useful instead of noisy
- [ ] Add more real event/result sources for Cycling & Endurance
- [ ] Expand Fishing with CDFW news, expanded keywords, Marin IJ filter
- [ ] Decide whether Faith & Community becomes a real column or stays parked until a reliable feed exists

### 5) UI Polish Pass

- [ ] Tighten map controls and tooltip hierarchy (larger hit areas, richer context in hover)
- [ ] Improve mobile density and readability under 768px
- [ ] Surface per-source freshness and error states in UI
- [ ] Add a small diagnostic/dev panel for source latency + failures

### 6) Coffee Index Coverage

- [ ] Keep Red Whale visible on the map/panel while price sourcing remains unresolved
- [ ] Find a reliable current-price source or manual fallback for Red Whale Coffee in San Rafael
- [ ] Add 1-2 more Central Marin coffee shops with public priced menus, starting with Aroma Cafe in San Rafael
- [ ] Evaluate Fairfax / Greenbrae additions only if they expose current prices or we accept curated fallback entries

## Parked / Deferred

- [ ] PG&E PSPS direct monitoring (no reliable public API)
- [ ] Paid housing data vendors unless business case is confirmed
- [ ] Re-introduce Custom Monitors panel after core layout/data work stabilizes
- [ ] SeeClickFix / civic requests integration
- [ ] Feedback / bug / feature form that emails operator on launch
- [ ] Church / faith community live feeds and calendars
- [ ] Beer / wine / pubs vertical
- [ ] Hunting / game / public land vertical if there is enough real Marin signal
- [ ] Surf spots using Open-Meteo + NOAA + NDBC, not Surfline scraping
- [ ] Twitter/X fire intelligence feeds (@MarinFireDept, @alertwildfire, @CAL_FIRE)

## Constraints / Guardrails

- No per-request LLM calls
- Prefer official APIs / RSS / structured feeds first
- Low-throughput local public pages may be parsed when no clean feed exists
- Avoid brittle or hostile scraping patterns; cache aggressively and stay polite
- Politically neutral framing
- Satire always clearly labeled
- No fake map pin precision
- Static site deployment target (no backend/db)

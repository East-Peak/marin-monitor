# Sprint 1: Server Bootstrap + Page Split

## Problem

The main dashboard is fully client-rendered with 20+ API fanout on first load. The route file (+page.svelte) is 1,193 lines mixing orchestration, layout editing, and panel composition. The Codex architecture review rated the performance architecture RED and code complexity YELLOW.

## Goals

1. Server-side bootstrap for weather + earthquakes (fast first paint with CDN caching)
2. Split +page.svelte from ~1,200 lines to ~400-500 lines
3. Establish panel data ownership rule: parents fetch, panels render

## Constraints

**`loadAllNews` CANNOT run server-side** because:
- `parseRssXml` in `rss.ts` uses `DOMParser` (browser-only API)
- All RSS/transit/police fetches use relative URLs (`/api/feeds?url=...`) which don't resolve in `+page.server.ts`
- `enrichItemsForRelevance` uses `DOMParser` for article text extraction

News data stays client-side for Sprint 1. Replacing `DOMParser` with a Node-compatible XML parser (e.g., `fast-xml-parser`) is a Sprint 2 prerequisite for full server-side news rendering.

**What CAN run server-side:**
- `fetchWeather` — NWS API uses absolute URLs (`https://api.weather.gov/...`) via `serviceClient`
- `fetchEarthquakes` — USGS API uses absolute URLs (`https://earthquake.usgs.gov/...`)
- `fetchHourlyForecast` — NWS hourly API, same absolute URL pattern

## Design

### 1. Server-Side Bootstrap (Weather + Earthquakes Only)

#### New: `src/routes/+page.server.ts`

```typescript
import type { ServerLoadEvent } from '@sveltejs/kit';

export async function load({ setHeaders }: ServerLoadEvent) {
  // Only fetch data that uses external absolute URLs (no DOMParser, no relative fetches)
  const { fetchWeather } = await import('$lib/api/marin');
  const { fetchEarthquakes } = await import('$lib/api/marin');
  const { fetchHourlyForecast } = await import('$lib/api/marin/nws-hourly');

  setHeaders({
    'Cache-Control': 's-maxage=120, stale-while-revalidate=300'
  });

  const [weather, earthquakes, hourly] = await Promise.allSettled([
    fetchWeather(37.9735, -122.5311),  // Central Marin default
    fetchEarthquakes(),
    fetchHourlyForecast()
  ]);

  return {
    bootstrap: {
      weather: weather.status === 'fulfilled' ? weather.value : null,
      earthquakes: earthquakes.status === 'fulfilled' ? earthquakes.value : [],
      hourly: hourly.status === 'fulfilled' ? hourly.value : [],
      timestamp: Date.now()
    }
  };
}
```

Note: `serviceClient` is a module-level singleton. Its in-memory cache may be shared across requests in a warm Vercel function. This is acceptable for read-only weather/earthquake data (no user-specific state).

#### Modified: `src/routes/+layout.ts`

Remove `export const ssr = false`. The app becomes SSR-capable. Routes that need client-only rendering (`/tv`) already have their own `+page.ts` with `ssr = false`.

#### Modified: `src/routes/+page.svelte`

Receive server data via props and hydrate on mount:

```typescript
let { data } = $props();  // from +page.server.ts

// Weather state — hydrate from server bootstrap, then auto-refresh
let weatherForecast = $state(data.bootstrap?.weather?.forecast ?? []);
let weatherAlerts = $state(data.bootstrap?.weather?.alerts ?? []);
let earthquakesRaw = $state(data.bootstrap?.earthquakes ?? []);
let earthquakeItems = $state(
  data.bootstrap?.earthquakes
    ? earthquakesToNewsItems(data.bootstrap.earthquakes)
    : []
);
```

News still loads client-side in `onMount` via `loadAllNews(true)`. Weather is available immediately from the server payload. Auto-refresh takes over for both after initial load.

---

### 2. Split +page.svelte

Extract components into `src/lib/components/dashboard/` (conventional SvelteKit pattern, consistent with existing `src/lib/components/` structure).

#### 2a. `src/lib/components/dashboard/LayoutEditMode.svelte`

**What:** The entire drag-and-drop grid editor: types, constants, state, handlers, and template.

**Props:**
```typescript
interface Props {
  weatherForecast: (WeatherData & { name: string })[];
  weatherAlerts: FireWeatherAlert[];
  weatherLoading: boolean;
  weatherError: string | null;
  userLocation: LocationPreset;
  earthquakeItems: NewsItem[];
  earthquakesRaw: EarthquakeData[];
  allNewsItems: NewsItem[];
}
```

**Extracts from +page.svelte:** Lines 72-102 (types/constants), 130-298 (edit state + handlers), 484-583 (template), ~150 lines of associated CSS.

**Size reduction:** ~250 lines.

#### 2b. `src/lib/components/dashboard/SignalDeck.svelte`

**What:** The 3-column signal deck panel layout (left: pulse/conditions/airport/wastewater/signals; middle: weather/outlooks/tides/environment; right: housing/gas/ev).

**Props:**
```typescript
interface Props {
  weatherForecast: (WeatherData & { name: string })[];
  weatherAlerts: FireWeatherAlert[];
  weatherLoading: boolean;
  weatherError: string | null;
  userLocation: LocationPreset;
  earthquakesRaw: EarthquakeData[];
  allNewsItems: NewsItem[];
}
```

The component imports `settings` store directly for `dashboardExpanded` and `isPanelVisible` — these are global settings, not data props. Self-fetching panels (ConditionsPanel, EnvironmentPanel, etc.) continue to self-fetch for now (Sprint 2 will address this).

**Extracts from +page.svelte:** Lines 636-733 (template) + associated CSS.

**Size reduction:** ~100 lines.

#### 2c. `src/lib/components/dashboard/MapStage.svelte`

**What:** The map + cameras top section with expand/collapse toggle.

**Props:**
```typescript
interface Props {
  earthquakeItems: NewsItem[];
}
```

The component imports `settings` store directly for `camerasExpanded`, `camerasHidden`, `isPanelEnabled`, and the toggle callbacks.

**Extracts from +page.svelte:** Lines 585-621 (template) + associated CSS.

**Size reduction:** ~40 lines.

#### 2d. `src/lib/components/dashboard/WireGrid.svelte`

**What:** The 9-column news wire grid + community panel.

**Props:**
```typescript
interface Props {
  onFeedback: (type: string) => void;
}
```

Imports `settings` store directly for panel visibility. Wire column definitions come from the new config file.

**Extracts from +page.svelte:** Lines 742-756 (template).

**Size reduction:** ~20 lines.

#### 2e. `src/lib/config/wire-columns.ts`

**What:** Static wire column config (panelId, category, title) currently inline in +page.svelte lines 118-128. Pure data, no dependencies.

#### 2f. `src/lib/config/edit-grid.ts`

**What:** Edit grid types (EditableTileId, TileLayout, TileDefinition), constants (columns, rows, height, gap), and defaultEditLayout. Currently inline in +page.svelte lines 72-126.

---

### 3. Panel Data Ownership Rule

**Rule:** Panels receive data as props. Parents (page, TV wallboard) own fetching.

**Exception:** Panels that fetch highly specialized data only they use (ConditionsPanel/Hero Dirt, EnvironmentPanel/streams) can self-fetch but must cache aggressively.

**Applied incrementally:** Not a one-time rewrite. For Sprint 1, the server bootstrap handles weather and earthquakes. News stays client-side. Panel self-fetching stays for now (Sprint 2 tech debt).

---

### File Structure

```
NEW:
  src/routes/+page.server.ts                          -- server-side weather/earthquake bootstrap
  src/lib/components/dashboard/LayoutEditMode.svelte   -- drag-and-drop grid editor
  src/lib/components/dashboard/SignalDeck.svelte        -- 3-column panel deck
  src/lib/components/dashboard/MapStage.svelte          -- map + cameras top section
  src/lib/components/dashboard/WireGrid.svelte          -- news wire grid
  src/lib/config/wire-columns.ts                        -- wire column definitions
  src/lib/config/edit-grid.ts                           -- edit grid types + constants

MODIFIED:
  src/routes/+page.svelte           -- reduced from ~1200 to ~400-500 lines, hydrate from server data
  src/routes/+layout.ts             -- remove ssr = false (enable SSR)

NOT MODIFIED:
  src/lib/api/marin/load-all.ts     -- stays client-side only for Sprint 1
```

---

### Future Work (Sprint 2)

- Replace `DOMParser` in `rss.ts` and `article-enrichment.ts` with `fast-xml-parser` or `linkedom`
- Move `loadAllNews` to server-side once DOMParser dependency is removed
- Full server-side first paint with all news data
- Panel data ownership cleanup (self-fetching panels move to props)

---

### Acceptance Criteria

- [ ] Weather data renders on first paint (from server, not loading spinner)
- [ ] `npm run build` succeeds with SSR enabled
- [ ] +page.svelte is under 500 lines
- [ ] Layout edit mode works identically (drag, resize, persist, reset)
- [ ] Signal deck renders identically (all panels, responsive collapse)
- [ ] Wire grid renders identically (9 columns, community panel)
- [ ] News data loads client-side in onMount (same as before, with loading spinners)
- [ ] Auto-refresh still works after initial server hydration
- [ ] TV mode still works (ssr = false on /tv route)
- [ ] All 159 existing tests pass
- [ ] Main dashboard visually identical before and after
- [ ] Vercel CDN caches the bootstrap payload (verify Cache-Control header)

# Sprint 1: Server Bootstrap + Page Split

## Problem

The main dashboard is fully client-rendered with 20+ API fanout on first load. The route file (+page.svelte) is 1,193 lines mixing orchestration, layout editing, and panel composition. The Codex architecture review rated the performance architecture RED and code complexity YELLOW.

## Goals

1. Server-side bootstrap payload for fast first paint with CDN caching
2. Split +page.svelte from ~1,200 lines to ~400-500 lines
3. Establish panel data ownership rule: parents fetch, panels render

## Design

### 1. Server-Side Bootstrap

#### New: `src/routes/+page.server.ts`

```typescript
export async function load() {
  const { loadAllNews } from '$lib/api/marin/load-all';
  const { fetchWeather } from '$lib/api/marin';
  const { fetchHourlyForecast } from '$lib/api/marin/nws-hourly';

  const [newsResult, weather, hourly] = await Promise.allSettled([
    loadAllNews(false),
    fetchWeather(37.9735, -122.5311),  // Central Marin default
    fetchHourlyForecast()
  ]);

  return {
    bootstrap: {
      earthquakeNews: newsResult.status === 'fulfilled' ? newsResult.value.earthquakeNews : [],
      earthquakesRaw: newsResult.status === 'fulfilled' ? newsResult.value.earthquakesRaw : [],
      weather: weather.status === 'fulfilled' ? weather.value : null,
      hourly: hourly.status === 'fulfilled' ? hourly.value : [],
      timestamp: Date.now()
    }
  };
}
```

Response headers (via `+page.server.ts` or hooks): `Cache-Control: s-maxage=120, stale-while-revalidate=300`.

The `loadAllNews` function already populates news stores server-side. The bootstrap payload carries weather and earthquake data that `+page.svelte` currently fetches client-side.

#### Modified: `src/routes/+layout.ts`

Remove `export const ssr = false`. The app becomes SSR-capable. Routes that need client-only rendering (`/tv`) already have their own `+page.ts` with `ssr = false`.

#### Modified: `src/routes/+page.svelte`

On mount, hydrate from server payload instead of fetching:

```typescript
let { data } = $props();  // from +page.server.ts

onMount(() => {
  // Hydrate from server bootstrap
  if (data.bootstrap) {
    earthquakeItems = data.bootstrap.earthquakeNews;
    earthquakesRaw = data.bootstrap.earthquakesRaw;
    if (data.bootstrap.weather) {
      weatherForecast = data.bootstrap.weather.forecast;
      weatherAlerts = data.bootstrap.weather.alerts;
    }
    // News stores already populated by loadAllNews on server
  }

  // Start auto-refresh for subsequent updates (same as before)
  refresh.setupAutoRefresh(handleRefresh);
});
```

First paint gets real data from CDN. Auto-refresh takes over for live updates.

#### Caveat: loadAllNews on server

`loadAllNews` calls `news.setItems()` which writes to a Svelte store. During SSR, stores are scoped per-request in SvelteKit, so this is safe. The store state serializes to the client via SvelteKit's built-in hydration. However, `enrichLocations` (which uses `DOMParser`) must be skipped on the server. Add a `browser` guard:

```typescript
if (enrichedItems.length > 0 && browser) {
  void news.enrichLocations(result.category);
}
```

Import `browser` from `$app/environment` in `load-all.ts`.

---

### 2. Split +page.svelte

Extract these components. Each has a clean interface and no cross-dependencies with other extracted components.

#### 2a. `src/routes/(dashboard)/LayoutEditMode.svelte`

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

**Extracts:** Lines 72-102 (types/constants), 130-298 (edit state + handlers), 484-583 (template), and ~150 lines of associated CSS.

**Size reduction:** ~250 lines from +page.svelte.

#### 2b. `src/routes/(dashboard)/SignalDeck.svelte`

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
  isPanelVisible: (id: PanelId) => boolean;
}
```

**Extracts:** Lines 636-733 (template) + associated CSS.

**Size reduction:** ~100 lines.

#### 2c. `src/routes/(dashboard)/MapStage.svelte`

**What:** The map + cameras top section with expand/collapse toggle.

**Props:**
```typescript
interface Props {
  earthquakeItems: NewsItem[];
  isPanelVisible: (id: PanelId) => boolean;
  camerasExpanded: boolean;
  camerasHidden: boolean;
}
```

**Extracts:** Lines 585-621 (template) + associated CSS.

**Size reduction:** ~40 lines.

#### 2d. `src/routes/(dashboard)/WireGrid.svelte`

**What:** The 9-column news wire grid + community panel.

**Props:**
```typescript
interface Props {
  isPanelVisible: (id: PanelId) => boolean;
  onFeedback: (type: string) => void;
}
```

**Extracts:** Lines 742-756 (template). Wire column definitions move to config.

**Size reduction:** ~20 lines.

#### 2e. `src/lib/config/wire-columns.ts`

**What:** Static wire column config (panelId, category, title) currently inline in +page.svelte lines 118-128. Pure data, no dependencies.

#### 2f. `src/lib/config/edit-grid.ts`

**What:** Edit grid types (EditableTileId, TileLayout, TileDefinition), constants (columns, rows, height, gap), and defaultEditLayout. Currently inline in +page.svelte lines 72-126.

---

### 3. Panel Data Ownership Rule

**Rule:** Panels receive data as props. Parents (page, TV wallboard) own fetching.

**Exception:** Panels that fetch highly specialized data only they use (ConditionsPanel/Hero Dirt, EnvironmentPanel/streams) can self-fetch but must cache aggressively.

**Applied incrementally:** Not a one-time rewrite. As we touch panels, we move them to props. For Sprint 1, the server bootstrap handles the major data (news, weather, earthquakes). Panel self-fetching stays for now but is acknowledged as tech debt for Sprint 2.

---

### File Structure

```
NEW:
  src/routes/+page.server.ts                    -- server-side bootstrap loader
  src/routes/(dashboard)/LayoutEditMode.svelte   -- drag-and-drop grid editor
  src/routes/(dashboard)/SignalDeck.svelte        -- 3-column panel deck
  src/routes/(dashboard)/MapStage.svelte          -- map + cameras top section
  src/routes/(dashboard)/WireGrid.svelte          -- news wire grid
  src/lib/config/wire-columns.ts                  -- wire column definitions
  src/lib/config/edit-grid.ts                     -- edit grid types + constants

MODIFIED:
  src/routes/+page.svelte           -- reduced from ~1200 to ~400-500 lines
  src/routes/+layout.ts             -- remove ssr = false
  src/lib/api/marin/load-all.ts     -- add browser guard for enrichLocations

DELETED:
  (nothing deleted)
```

---

### Acceptance Criteria

- [ ] First page load serves real data from CDN (not loading spinners)
- [ ] `npm run build` succeeds with SSR enabled
- [ ] +page.svelte is under 500 lines
- [ ] Layout edit mode works identically (drag, resize, persist, reset)
- [ ] Signal deck renders identically (all panels, responsive collapse)
- [ ] Wire grid renders identically (9 columns, community panel)
- [ ] Auto-refresh still works after initial server hydration
- [ ] TV mode still works (ssr = false on /tv route)
- [ ] All 159 existing tests pass
- [ ] Main dashboard visually identical before and after

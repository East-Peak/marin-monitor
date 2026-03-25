# Sprint 1: Server Bootstrap + Page Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-side weather/earthquake bootstrap with CDN caching, and split +page.svelte from ~1,200 lines to ~400-500 lines by extracting dashboard sections into focused components.

**Architecture:** Create `+page.server.ts` to pre-fetch weather/earthquake data server-side with `s-maxage` caching. Extract 4 presentation components (LayoutEditMode, SignalDeck, MapStage, WireGrid) and 2 config files from +page.svelte. Enable SSR globally while keeping /tv client-only.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Tailwind CSS, Vercel adapter

**Spec:** `docs/superpowers/specs/2026-03-24-sprint1-server-bootstrap-page-split.md`

---

## File Structure

```
NEW:
  src/routes/+page.server.ts                              — server bootstrap (weather + earthquakes)
  src/lib/components/dashboard/LayoutEditMode.svelte       — drag-and-drop grid editor (~300 lines)
  src/lib/components/dashboard/SignalDeck.svelte            — 3-column panel deck (~120 lines)
  src/lib/components/dashboard/MapStage.svelte              — map + cameras top section (~60 lines)
  src/lib/components/dashboard/WireGrid.svelte              — news wire grid (~40 lines)
  src/lib/config/wire-columns.ts                            — wire column definitions (~15 lines)
  src/lib/config/edit-grid.ts                               — edit grid types + constants (~60 lines)

MODIFIED:
  src/routes/+page.svelte      — reduced to ~400-500 lines (orchestration shell)
  src/routes/+layout.ts        — remove ssr = false

NOT MODIFIED:
  src/routes/tv/+page.ts       — already has ssr = false
  src/lib/api/marin/load-all.ts — stays client-side only
```

---

## Task 1: Extract Config Files

**Files:**
- Create: `src/lib/config/wire-columns.ts`
- Create: `src/lib/config/edit-grid.ts`

Pure data extractions with zero risk. No template changes.

- [ ] **Step 1: Create wire-columns.ts**

Extract the `wireColumns` array from +page.svelte lines 119-129:

```typescript
// src/lib/config/wire-columns.ts
import type { PanelId } from '$lib/config';
import type { NewsCategory } from '$lib/types';

export const WIRE_COLUMNS: { panelId: PanelId; category: NewsCategory; title: string }[] = [
  { panelId: 'local-wire', category: 'local', title: 'Local Wire' },
  { panelId: 'safety', category: 'safety', title: 'Crime & Safety' },
  { panelId: 'civic', category: 'civic', title: 'Civic' },
  { panelId: 'outdoors', category: 'outdoors', title: 'Outdoors & Lifestyle' },
  { panelId: 'satire', category: 'satire', title: 'Marin Lately (satire)' },
  { panelId: 'cycling', category: 'cycling', title: 'Cycling & Endurance' },
  { panelId: 'shows', category: 'shows', title: 'Shows & Events' },
  { panelId: 'prep', category: 'prep', title: 'Sports & Prep' },
  { panelId: 'farm', category: 'farm', title: 'Farm & Market' }
];
```

- [ ] **Step 2: Create edit-grid.ts**

Extract types, constants, and default layout from +page.svelte lines 73-117:

```typescript
// src/lib/config/edit-grid.ts
export type EditableTileId =
  | 'map' | 'cameras' | 'pulse' | 'narrative'
  | 'weather' | 'tides' | 'housing' | 'forecast'
  | 'pattern' | 'surf' | 'marine';

export type TileLayout = { x: number; y: number; w: number; h: number };
export type TileDefinition = { id: EditableTileId; title: string; visible: boolean };

export const EDIT_LAYOUT_KEY = 'marin-monitor:layout-edit:v1';
export const EDIT_GRID_COLUMNS = 12;
export const EDIT_GRID_ROWS = 18;
export const EDIT_ROW_HEIGHT = 72;
export const EDIT_GAP = 8;

export const DEFAULT_EDIT_LAYOUT: Record<EditableTileId, TileLayout> = {
  map: { x: 1, y: 1, w: 9, h: 4 },
  cameras: { x: 10, y: 1, w: 3, h: 4 },
  pulse: { x: 1, y: 5, w: 3, h: 3 },
  narrative: { x: 1, y: 8, w: 3, h: 5 },
  weather: { x: 4, y: 5, w: 5, h: 4 },
  housing: { x: 9, y: 5, w: 4, h: 4 },
  tides: { x: 9, y: 9, w: 4, h: 4 },
  pattern: { x: 1, y: 13, w: 3, h: 3 },
  forecast: { x: 4, y: 9, w: 5, h: 4 },
  surf: { x: 4, y: 13, w: 2, h: 3 },
  marine: { x: 9, y: 13, w: 4, h: 3 }
};
```

- [ ] **Step 3: Update +page.svelte to import from new config files**

Replace inline definitions with imports. Remove the `wireColumns` const, the type definitions, and the `defaultEditLayout` const. Replace with:

```typescript
import { WIRE_COLUMNS } from '$lib/config/wire-columns';
import {
  type EditableTileId, type TileLayout, type TileDefinition,
  EDIT_LAYOUT_KEY, EDIT_GRID_COLUMNS, EDIT_GRID_ROWS, EDIT_ROW_HEIGHT, EDIT_GAP,
  DEFAULT_EDIT_LAYOUT
} from '$lib/config/edit-grid';
```

Update all references: `wireColumns` -> `WIRE_COLUMNS`, `defaultEditLayout` -> `DEFAULT_EDIT_LAYOUT`.

- [ ] **Step 4: Type check + commit**

```bash
cd /Users/tammypais/projects/marin-monitor
npm run check 2>&1 | grep "Error:"
git add src/lib/config/wire-columns.ts src/lib/config/edit-grid.ts src/routes/+page.svelte
git commit -m "refactor: extract wire-columns and edit-grid config from +page.svelte"
git push origin main
```

---

## Task 2: Extract WireGrid Component

**Files:**
- Create: `src/lib/components/dashboard/WireGrid.svelte`
- Modify: `src/routes/+page.svelte`

The simplest extraction. Move the wire grid template section into its own component.

- [ ] **Step 1: Create WireGrid.svelte**

Read +page.svelte to find the exact wire grid template (the `.news-area` / `.wire-grid` section and the Community panel below it). Create the component importing settings for panel visibility and WIRE_COLUMNS for the column definitions. Accept an `onFeedback` callback prop.

- [ ] **Step 2: Replace the wire grid section in +page.svelte with `<WireGrid>`**

- [ ] **Step 3: Type check + commit**

```bash
npm run check 2>&1 | grep "Error:"
git add src/lib/components/dashboard/WireGrid.svelte src/routes/+page.svelte
git commit -m "refactor: extract WireGrid component from +page.svelte"
git push origin main
```

---

## Task 3: Extract MapStage Component

**Files:**
- Create: `src/lib/components/dashboard/MapStage.svelte`
- Modify: `src/routes/+page.svelte`

Move the map + cameras top section. The component imports `settings` directly for camera toggle state.

- [ ] **Step 1: Create MapStage.svelte**

Read +page.svelte to find the `.top-stage` section (map + cameras), the `.expanded-cameras-stage`, and the camera hide/show toggle. Extract into a component that receives `earthquakeItems` as a prop and imports `settings` for camera state.

- [ ] **Step 2: Replace in +page.svelte with `<MapStage>`**

- [ ] **Step 3: Move associated CSS to the new component**

- [ ] **Step 4: Type check + commit**

```bash
npm run check 2>&1 | grep "Error:"
git add src/lib/components/dashboard/MapStage.svelte src/routes/+page.svelte
git commit -m "refactor: extract MapStage component from +page.svelte"
git push origin main
```

---

## Task 4: Extract SignalDeck Component

**Files:**
- Create: `src/lib/components/dashboard/SignalDeck.svelte`
- Modify: `src/routes/+page.svelte`

Move the 3-column signal deck. This is ~100 lines of template + associated CSS. The component receives weather/earthquake data as props and imports `settings` for panel visibility and dashboard collapse state.

- [ ] **Step 1: Create SignalDeck.svelte**

Read +page.svelte to find the `.signal-layout` section (3-column grid with all signal deck panels). Extract into a component with props for weather data, earthquake data, location, loading state, and error state. Import `settings` and `allNewsItems` from stores.

- [ ] **Step 2: Replace in +page.svelte with `<SignalDeck>`**

- [ ] **Step 3: Move associated CSS (`.signal-layout`, `.signal-column`, `.signal-card`, responsive breakpoints)**

- [ ] **Step 4: Type check + commit**

```bash
npm run check 2>&1 | grep "Error:"
git add src/lib/components/dashboard/SignalDeck.svelte src/routes/+page.svelte
git commit -m "refactor: extract SignalDeck component from +page.svelte"
git push origin main
```

---

## Task 5: Extract LayoutEditMode Component

**Files:**
- Create: `src/lib/components/dashboard/LayoutEditMode.svelte`
- Modify: `src/routes/+page.svelte`

The largest extraction (~250 lines). Move all layout-edit state, handlers, and the edit grid template. The component receives panel data as props for rendering panels inside the editable tiles.

- [ ] **Step 1: Create LayoutEditMode.svelte**

Read +page.svelte carefully. Extract:
- Edit state: `editMode`, `editLayout`, `dragState`, `editGridEl` (lines 131-140)
- All edit functions: `cloneDefaultLayout`, `loadSavedEditLayout`, `persistEditLayout`, `resetEditLayout`, `clampTile`, `updateTileLayout`, `beginDrag`, `handleDragMove`, `endDrag`, `tileStyle`
- The editable tiles derived computation
- The entire `{#if editMode}` template branch including the toolbar and grid
- All `.layout-edit-*` CSS classes

The component receives props for: `weatherForecast`, `weatherAlerts`, `weatherLoading`, `weatherError`, `userLocation`, `earthquakeItems`, `earthquakesRaw`, `allNewsItems` (needed to render panels inside the editable tiles).

Import config from `$lib/config/edit-grid`.

- [ ] **Step 2: Replace the edit mode branch in +page.svelte**

Replace the entire `{#if editMode}...{:else}` conditional with:
```svelte
{#if editMode}
  <LayoutEditMode {weatherForecast} {weatherAlerts} {weatherLoading} {weatherError} {userLocation} {earthquakeItems} {earthquakesRaw} allNewsItems={$allNewsItems} />
{:else}
  <!-- normal dashboard view -->
{/if}
```

- [ ] **Step 3: Remove all edit-mode state and functions from +page.svelte**

The `editMode` flag stays in +page.svelte (it's toggled by URL param check in onMount). Everything else moves to the component.

- [ ] **Step 4: Move all `.layout-edit-*` CSS to the new component**

- [ ] **Step 5: Type check + commit**

```bash
npm run check 2>&1 | grep "Error:"
git add src/lib/components/dashboard/LayoutEditMode.svelte src/routes/+page.svelte
git commit -m "refactor: extract LayoutEditMode component from +page.svelte (~250 lines)"
git push origin main
```

---

## Task 6: Server-Side Bootstrap

**Files:**
- Create: `src/routes/+page.server.ts`
- Modify: `src/routes/+layout.ts`
- Modify: `src/routes/+page.svelte`

Enable SSR and add server-side weather/earthquake pre-fetch with CDN caching.

- [ ] **Step 1: Modify +layout.ts — remove `ssr = false`**

Change to:
```typescript
export const prerender = false;
```

Remove the `export const ssr = false;` line entirely.

- [ ] **Step 2: Create +page.server.ts**

```typescript
import type { ServerLoadEvent } from '@sveltejs/kit';

export async function load({ setHeaders }: ServerLoadEvent) {
  setHeaders({
    'Cache-Control': 's-maxage=120, stale-while-revalidate=300'
  });

  try {
    const [{ fetchWeather }, { fetchEarthquakes }, { fetchHourlyForecast }] = await Promise.all([
      import('$lib/api/marin'),
      import('$lib/api/marin'),
      import('$lib/api/marin/nws-hourly')
    ]);

    const [weather, earthquakes, hourly] = await Promise.allSettled([
      fetchWeather(37.9735, -122.5311),
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
  } catch {
    return { bootstrap: null };
  }
}
```

- [ ] **Step 3: Modify +page.svelte to hydrate from server data**

Add `$props()` to receive server data. Initialize weather/earthquake state from bootstrap:

```typescript
import { earthquakesToNewsItems } from '$lib/api/marin';

let { data } = $props();

// Hydrate from server bootstrap (weather + earthquakes)
let weatherForecast = $state(data?.bootstrap?.weather?.forecast ?? []);
let weatherAlerts = $state(data?.bootstrap?.weather?.alerts ?? []);
let weatherLoading = $state(!data?.bootstrap?.weather);
let weatherError = $state<string | null>(null);
let earthquakeItems = $state(
  data?.bootstrap?.earthquakes?.length
    ? earthquakesToNewsItems(data.bootstrap.earthquakes)
    : []
);
let earthquakesRaw = $state(data?.bootstrap?.earthquakes ?? []);
```

In `onMount`, skip the initial weather fetch if we already have server data:
```typescript
if (!data?.bootstrap?.weather) {
  await loadWeather();
}
```

News still loads client-side via `loadAllNews(true)` in onMount (unchanged).

- [ ] **Step 4: Verify SSR works — type check + build**

```bash
npm run check 2>&1 | grep "Error:"
npm run build 2>&1 | tail -10
```

The build must succeed with SSR enabled. Check for any browser-only API usage in imports that now run server-side.

- [ ] **Step 5: Run tests**

```bash
npm run test:unit 2>&1 | tail -10
```

All 159 tests must pass.

- [ ] **Step 6: Commit**

```bash
git add src/routes/+page.server.ts src/routes/+layout.ts src/routes/+page.svelte
git commit -m "feat: add server-side weather/earthquake bootstrap with CDN caching, enable SSR"
git push origin main
```

---

## Task 7: Verification + Line Count

- [ ] **Step 1: Count lines in +page.svelte**

```bash
wc -l src/routes/+page.svelte
```

Target: under 500 lines.

- [ ] **Step 2: Full build + test**

```bash
npm run check 2>&1 | grep "Error:"
npm run build 2>&1 | tail -5
npm run test:unit 2>&1 | tail -5
```

- [ ] **Step 3: Visual verification**

Start dev server and verify:
- Main dashboard looks identical
- Weather data appears immediately (not loading spinner) on first load
- Layout edit mode works (drag, resize, persist)
- Signal deck responsive collapse works
- Wire grid shows all 9 columns
- TV mode still works at /tv
- M key shortcut works

- [ ] **Step 4: Commit changelog**

```bash
# Update CHANGELOG.md with refactoring notes
git add CHANGELOG.md
git commit -m "docs: Sprint 1 refactor — server bootstrap, page split, line count reduction"
git push origin main
```

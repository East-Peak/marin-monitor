# TV Carousel v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the TV carousel from 6 duplicative screens to 8 purpose-built screens with geographic camera clusters, a contextual map sidebar, vertical auto-scroll, and zero panel duplication.

**Architecture:** Replace 4 existing screen components with 6 new ones. Add a reusable `TvAutoScroll` vertical scroll wrapper and a `TvCameraClusterScreen` reusable camera grid. Extend `TvMapFlyer` with an `onViewChange` callback to drive a contextual `TvMapSidebar` showing per-region weather and stories. Add `tvCluster` field to camera config for geographic grouping. Update TvWallboard screen routing.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Tailwind CSS, MapLibre GL, existing panel components + stores

**Spec:** `docs/superpowers/specs/2026-03-24-tv-carousel-v2-design.md`

---

## File Structure

```
MODIFIED:
  src/lib/config/tv.ts                    -- new TvScreenId type, TV_SCREENS array (8 screens), TvCameraCluster type
  src/lib/config/cameras.ts               -- add tvCluster field to CameraConfig, assign all 24 cameras
  src/lib/components/tv/TvWallboard.svelte -- new screen imports + routing, remove old screen imports
  src/lib/components/tv/TvMapFlyer.svelte  -- add onViewChange callback prop
  src/lib/components/tv/screens/SafetyScreen.svelte  -- remove CamerasPanel, full-width, add TvAutoScroll
  src/lib/components/tv/screens/NewsWireScreen.svelte -- wrap content in TvAutoScroll
  src/lib/components/tv/index.ts           -- update barrel exports

NEW:
  src/lib/components/tv/TvAutoScroll.svelte              -- vertical auto-scroll wrapper (~40 lines)
  src/lib/components/tv/TvMapSidebar.svelte              -- contextual weather + stories sidebar (~100 lines)
  src/lib/components/tv/screens/TvMapScreen.svelte       -- map + contextual sidebar (~80 lines)
  src/lib/components/tv/screens/TvCameraClusterScreen.svelte -- reusable camera grid (~90 lines)
  src/lib/components/tv/screens/TvConditionsScreen.svelte    -- AQI/tides/streams/Hero Dirt (~50 lines)
  src/lib/components/tv/screens/TvCommunityScreen.svelte     -- outdoors + civic headlines (~60 lines)

DELETED:
  src/lib/components/tv/screens/CameraWallScreen.svelte
  src/lib/components/tv/screens/EnvironmentScreen.svelte
  src/lib/components/tv/screens/OutdoorsScreen.svelte
  src/lib/components/tv/screens/MapConditionsScreen.svelte
```

---

## Task 1: Config Updates (tv.ts + cameras.ts)

**Files:**
- Modify: `src/lib/config/tv.ts`
- Modify: `src/lib/config/cameras.ts`

Update both config files: new screen IDs/types for the 8-screen carousel, and add `tvCluster` assignments to all 24 cameras.

- [ ] **Step 1: Update tv.ts**

Read `src/lib/config/tv.ts`. Replace the `TvScreenId` type and `TV_SCREENS` array. Add `TvCameraCluster` type. Keep all other exports unchanged (TickerItem, CATEGORY_COLORS, TV_MAP_VIEWS, etc.).

New `TvScreenId`:
```typescript
export type TvScreenId =
  | 'map-explorer'
  | 'news-wire'
  | 'safety'
  | 'cameras-tam-coast'
  | 'cameras-central-highway'
  | 'cameras-west-north'
  | 'conditions'
  | 'community';
```

New `TV_SCREENS`:
```typescript
export const TV_SCREENS: TvScreenConfig[] = [
  { id: 'map-explorer', name: 'Map Explorer', description: 'Live map with regional flyby and contextual sidebar', durationMs: 30_000 },
  { id: 'news-wire', name: 'News Wire', description: 'Local headlines', durationMs: 20_000 },
  { id: 'safety', name: 'Safety & Alerts', description: 'Crime and safety with auto-scroll', durationMs: 20_000 },
  { id: 'cameras-tam-coast', name: 'Tam & Coast', description: 'Mt Tam ridgeline and coastal cameras', durationMs: 20_000 },
  { id: 'cameras-central-highway', name: 'Central & Highway', description: '101 corridor and central Marin cameras', durationMs: 20_000 },
  { id: 'cameras-west-north', name: 'West & North', description: 'West Marin and Novato hill cameras', durationMs: 20_000 },
  { id: 'conditions', name: 'Conditions & Trails', description: 'AQI, tides, streams, Hero Dirt', durationMs: 20_000 },
  { id: 'community', name: 'Outdoors & Community', description: 'Outdoor and civic news', durationMs: 20_000 }
];
```

Add camera cluster type (below the existing exports, before CATEGORY_COLORS):
```typescript
/** Geographic camera clusters for TV mode */
export type TvCameraCluster = 'tam-coast' | 'central-highway' | 'west-north';

export const TV_CAMERA_CLUSTERS: { id: TvCameraCluster; label: string }[] = [
  { id: 'tam-coast', label: 'Tam & Coast' },
  { id: 'central-highway', label: 'Central & Highway' },
  { id: 'west-north', label: 'West & North' }
];
```

Remove `CAROUSEL_DEFAULT_DURATION_MS` if it still exists (no longer needed since each screen has its own `durationMs`).

- [ ] **Step 2: Update cameras.ts**

Read `src/lib/config/cameras.ts`. Add `tvCluster?: TvCameraCluster` to the `CameraConfig` interface. Import the type from tv.ts. Then add `tvCluster` to every camera entry:

**tam-coast cluster:**
- `alert-tam-east` -> `tvCluster: 'tam-coast'`
- `alert-tam-west` -> `tvCluster: 'tam-coast'`
- `abc7-tam` -> `tvCluster: 'tam-coast'`
- `alert-muir-beach` -> `tvCluster: 'tam-coast'`
- `windy-muir` -> `tvCluster: 'tam-coast'`
- `alert-wolfback-ridge` -> `tvCluster: 'tam-coast'`
- `alert-bolinas` -> `tvCluster: 'tam-coast'`
- `windy-tiburon` -> `tvCluster: 'tam-coast'`

**central-highway cluster:**
- `caltrans-spencer` -> `tvCluster: 'central-highway'`
- `caltrans-sr1` -> `tvCluster: 'central-highway'`
- `caltrans-580` -> `tvCluster: 'central-highway'`
- `caltrans-ignacio` -> `tvCluster: 'central-highway'`
- `alert-san-pedro` -> `tvCluster: 'central-highway'`
- `alert-san-rafael-hill` -> `tvCluster: 'central-highway'`
- `alert-big-rock` -> `tvCluster: 'central-highway'`
- `alert-big-rock-2` -> `tvCluster: 'central-highway'`

**west-north cluster:**
- `alert-barnabe-east` -> `tvCluster: 'west-north'`
- `alert-barnabe-west` -> `tvCluster: 'west-north'`
- `alert-black-mtn` -> `tvCluster: 'west-north'`
- `alert-vision` -> `tvCluster: 'west-north'`
- `alert-burdell` -> `tvCluster: 'west-north'`
- `alert-burdell-2` -> `tvCluster: 'west-north'`
- `alert-mt-burdell-south` -> `tvCluster: 'west-north'`
- `alert-league-221` -> `tvCluster: 'west-north'`

- [ ] **Step 3: Type check**

Run: `cd /Users/tammypais/projects/marin-monitor && npm run check 2>&1 | grep "Error:"`

Expected: May show errors in TvWallboard.svelte referencing old screen IDs — that's expected and will be fixed in Task 8.

- [ ] **Step 4: Commit**

```bash
git add src/lib/config/tv.ts src/lib/config/cameras.ts
git commit -m "feat(tv-v2): update screen config to 8 screens, add geographic camera clusters"
```

---

## Task 2: TvAutoScroll Component

**Files:**
- Create: `src/lib/components/tv/TvAutoScroll.svelte`

A reusable vertical auto-scroll wrapper — the vertical equivalent of the chyron's horizontal scroll.

- [ ] **Step 1: Create TvAutoScroll.svelte**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    speed?: number; // pixels per second, default 30
  }

  let { children, speed = 30 }: Props = $props();

  let containerEl = $state<HTMLDivElement | null>(null);
  let contentEl = $state<HTMLDivElement | null>(null);
  let needsScroll = $state(false);
  let duration = $state(60);

  onMount(() => {
    checkOverflow();
    const observer = new ResizeObserver(checkOverflow);
    if (containerEl) observer.observe(containerEl);
    if (contentEl) observer.observe(contentEl);
    return () => observer.disconnect();
  });

  function checkOverflow() {
    if (!containerEl || !contentEl) return;
    const contentHeight = contentEl.scrollHeight;
    const containerHeight = containerEl.clientHeight;
    needsScroll = contentHeight > containerHeight;
    if (needsScroll) {
      duration = contentHeight / speed;
    }
  }
</script>

<div bind:this={containerEl} class="h-full overflow-hidden relative">
  {#if needsScroll}
    <div
      class="auto-scroll-track"
      style="animation-duration: {duration}s;"
    >
      <div bind:this={contentEl}>
        {@render children()}
      </div>
      <div aria-hidden="true">
        {@render children()}
      </div>
    </div>
  {:else}
    <div bind:this={contentEl}>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .auto-scroll-track {
    animation: auto-scroll-vertical linear infinite;
  }
  .auto-scroll-track:hover {
    animation-play-state: paused;
  }
  @keyframes auto-scroll-vertical {
    0% { transform: translateY(0); }
    100% { transform: translateY(-50%); }
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/tv/TvAutoScroll.svelte
git commit -m "feat(tv-v2): add TvAutoScroll vertical auto-scroll wrapper"
```

---

## Task 3: TvCameraClusterScreen Component

**Files:**
- Create: `src/lib/components/tv/screens/TvCameraClusterScreen.svelte`

Reusable camera grid — used by all 3 camera screens. Full-viewport grid of cameras filtered by `tvCluster`.

- [ ] **Step 1: Create TvCameraClusterScreen.svelte**

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { CAMERAS } from '$lib/config/cameras';
  import { TV_CAMERA_CLUSTERS, type TvCameraCluster } from '$lib/config/tv';

  interface Props {
    clusterId: TvCameraCluster;
  }

  let { clusterId }: Props = $props();

  const clusterLabel = $derived(
    TV_CAMERA_CLUSTERS.find((c) => c.id === clusterId)?.label ?? clusterId
  );

  const cameras = $derived(CAMERAS.filter((c) => c.tvCluster === clusterId));

  // Auto-refresh image timestamps
  let timestamps = $state<Record<string, number>>({});
  let refreshTimers: ReturnType<typeof setInterval>[] = [];

  onMount(() => {
    for (const cam of cameras) {
      if (cam.type === 'image' && cam.refreshInterval) {
        timestamps[cam.id] = Date.now();
        const timer = setInterval(() => {
          timestamps[cam.id] = Date.now();
        }, cam.refreshInterval * 1000);
        refreshTimers.push(timer);
      }
    }
  });

  onDestroy(() => {
    refreshTimers.forEach(clearInterval);
  });

  function imageUrl(cam: typeof CAMERAS[0]): string {
    const ts = timestamps[cam.id];
    return ts ? `${cam.url}?t=${ts}` : cam.url;
  }
</script>

<div class="h-full flex flex-col p-2">
  <h2 class="text-xl font-bold text-gray-100 mb-2 px-2">{clusterLabel}</h2>
  <div class="flex-1 grid grid-cols-4 gap-2 min-h-0">
    {#each cameras as cam (cam.id)}
      <div class="relative bg-gray-800 rounded overflow-hidden min-h-0">
        {#if cam.type === 'image'}
          <img
            src={imageUrl(cam)}
            alt={cam.name}
            class="w-full h-full object-cover"
            loading="eager"
          />
        {:else if cam.type === 'iframe'}
          <iframe
            src={cam.url}
            title={cam.name}
            class="w-full h-full border-0"
            loading="eager"
            allow="autoplay"
          ></iframe>
        {/if}
        <div class="absolute top-0 left-0 right-0 flex justify-between items-start p-1.5 pointer-events-none">
          <span class="text-xs font-medium text-white bg-black/60 px-1.5 py-0.5 rounded">{cam.name}</span>
          <span class="text-xs text-gray-300 bg-black/60 px-1.5 py-0.5 rounded">{cam.location}</span>
        </div>
        <div class="absolute bottom-0 right-0 p-1.5 pointer-events-none">
          <span class="text-[10px] text-gray-400 bg-black/60 px-1 py-0.5 rounded">{cam.source}</span>
        </div>
      </div>
    {/each}
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/tv/screens/TvCameraClusterScreen.svelte
git commit -m "feat(tv-v2): add TvCameraClusterScreen reusable geographic camera grid"
```

---

## Task 4: TvMapSidebar + TvMapFlyer onViewChange

**Files:**
- Create: `src/lib/components/tv/TvMapSidebar.svelte`
- Modify: `src/lib/components/tv/TvMapFlyer.svelte`

Add the contextual sidebar and the callback mechanism for the map flyby.

- [ ] **Step 1: Add onViewChange to TvMapFlyer**

Read `src/lib/components/tv/TvMapFlyer.svelte`. Add an `onViewChange` callback prop. Call it whenever the sub-view changes (in `flyToView`).

Changes to the Props interface:
```typescript
interface Props {
  active: boolean;
  onViewChange?: (view: typeof TV_MAP_VIEWS[0]) => void;
}

let { active, onViewChange }: Props = $props();
```

In the `flyToView` function, after setting `currentLabel`, add:
```typescript
onViewChange?.(view);
```

- [ ] **Step 2: Create TvMapSidebar.svelte**

```svelte
<script lang="ts">
  import type { NewsItem } from '$lib/types';

  interface Props {
    regionLabel: string;
    weather: { temp: number; wind: string; shortForecast: string } | null;
    stories: NewsItem[];
    alerts: NewsItem[];
    loading: boolean;
  }

  let { regionLabel, weather, stories, alerts, loading }: Props = $props();

  function relativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
</script>

<div class="h-full flex flex-col bg-gray-900/95 border-l border-gray-700/50 overflow-y-auto">
  <div class="p-4 border-b border-gray-800/50">
    <h3 class="text-sm font-bold text-gray-400 uppercase tracking-wide">{regionLabel}</h3>
    {#if loading}
      <p class="text-sm text-gray-500 mt-2">Loading weather...</p>
    {:else if weather}
      <div class="mt-2">
        <span class="text-3xl font-bold text-gray-100">{weather.temp}&deg;F</span>
        <p class="text-sm text-gray-300 mt-1">{weather.shortForecast}</p>
        <p class="text-xs text-gray-500">{weather.wind}</p>
      </div>
    {/if}
  </div>

  {#if alerts.length > 0}
    <div class="p-4 border-b border-gray-800/50 space-y-2">
      {#each alerts.slice(0, 3) as alert (alert.id)}
        <div class="bg-red-900/30 border border-red-700/50 rounded p-2">
          <span class="text-[10px] font-bold text-red-400 uppercase">Alert</span>
          <p class="text-xs text-gray-200 mt-0.5 line-clamp-2">{alert.title}</p>
        </div>
      {/each}
    </div>
  {/if}

  {#if stories.length > 0}
    <div class="p-4 flex-1 space-y-2">
      <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Nearby</h4>
      {#each stories.slice(0, 5) as item (item.id)}
        <div class="bg-gray-800/40 rounded p-2 border border-gray-700/30">
          <p class="text-sm text-gray-200 line-clamp-2">{item.title}</p>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-[10px] text-gray-500">{item.source}</span>
            <span class="text-[10px] text-gray-600">{relativeTime(item.timestamp)}</span>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="p-4 flex-1">
      <p class="text-xs text-gray-600">No pinned stories in this area</p>
    </div>
  {/if}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/tv/TvMapFlyer.svelte src/lib/components/tv/TvMapSidebar.svelte
git commit -m "feat(tv-v2): add TvMapSidebar contextual panel and TvMapFlyer onViewChange callback"
```

---

## Task 5: TvMapScreen (replaces MapConditionsScreen)

**Files:**
- Create: `src/lib/components/tv/screens/TvMapScreen.svelte`

The map explorer with contextual sidebar. Composes MapContainer + MapDataLayer + TvMapFlyer + TvMapSidebar. Fetches per-region weather when the flyby view changes.

- [ ] **Step 1: Create TvMapScreen.svelte**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { MapContainer, MapDataLayer, MapControls, MapTooltip } from '$lib/components/map';
  import TvMapFlyer from '$lib/components/tv/TvMapFlyer.svelte';
  import TvMapSidebar from '$lib/components/tv/TvMapSidebar.svelte';
  import { fetchFireIncidents } from '$lib/api/marin';
  import { fetchHourlyForecast } from '$lib/api/marin/nws-hourly';
  import type { HourlyPeriod } from '$lib/api/marin/nws-hourly';
  import type { FireIncident } from '$lib/api/marin/calfire';
  import { allNewsItems, alerts as alertsStore } from '$lib/stores';
  import type { TvMapView } from '$lib/config/tv';
  import type { NewsItem } from '$lib/types';

  interface Props {
    earthquakeItems: NewsItem[];
    active?: boolean;
  }

  let { earthquakeItems, active = true }: Props = $props();

  let fireIncidents = $state<FireIncident[]>([]);

  // Sidebar state
  let regionLabel = $state('Marin County');
  let sidebarWeather = $state<{ temp: number; wind: string; shortForecast: string } | null>(null);
  let sidebarStories = $state<NewsItem[]>([]);
  let sidebarAlerts = $state<NewsItem[]>([]);
  let weatherLoading = $state(false);

  // Weather cache: regionId -> { data, fetchedAt }
  const weatherCache = new Map<string, { data: { temp: number; wind: string; shortForecast: string }; fetchedAt: number }>();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  onMount(async () => {
    try {
      fireIncidents = await fetchFireIncidents();
    } catch {
      // Silent fail
    }
  });

  async function handleViewChange(view: TvMapView) {
    regionLabel = view.label;

    // Filter stories by proximity to view center
    const lat = view.center[1];
    const lon = view.center[0];
    const radius = view.zoom < 11 ? 0.15 : 0.05;

    const nearby = $allNewsItems.filter((item) => {
      if (typeof item.lat !== 'number' || typeof item.lon !== 'number') return false;
      return Math.abs(item.lat - lat) < radius && Math.abs(item.lon - lon) < radius;
    });

    sidebarStories = nearby.filter((i) => !i.isAlert).slice(0, 5);
    sidebarAlerts = nearby.filter((i) => i.isAlert).slice(0, 3);

    // Fetch weather (cached)
    const cached = weatherCache.get(view.id);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      sidebarWeather = cached.data;
      return;
    }

    weatherLoading = true;
    try {
      const hourly = await fetchHourlyForecast(lat, lon);
      if (hourly.length > 0) {
        const current = hourly[0];
        const data = {
          temp: current.temperature,
          wind: `${current.windSpeed}`,
          shortForecast: current.shortForecast ?? ''
        };
        sidebarWeather = data;
        weatherCache.set(view.id, { data, fetchedAt: Date.now() });
      }
    } catch {
      // Keep last good data
    } finally {
      weatherLoading = false;
    }
  }
</script>

<div class="flex h-full gap-0" style="min-height: 0;">
  <div class="flex-1 min-w-0 min-h-0 relative" style="height: 100%;">
    <MapContainer>
      <MapDataLayer earthquakes={earthquakeItems} {fireIncidents} />
      <MapControls />
      <MapTooltip />
      <TvMapFlyer {active} onViewChange={handleViewChange} />
    </MapContainer>
  </div>
  <div class="w-72 shrink-0">
    <TvMapSidebar
      {regionLabel}
      weather={sidebarWeather}
      stories={sidebarStories}
      alerts={sidebarAlerts}
      loading={weatherLoading}
    />
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/tv/screens/TvMapScreen.svelte
git commit -m "feat(tv-v2): add TvMapScreen with contextual sidebar showing per-region weather and stories"
```

---

## Task 6: TvConditionsScreen + TvCommunityScreen

**Files:**
- Create: `src/lib/components/tv/screens/TvConditionsScreen.svelte`
- Create: `src/lib/components/tv/screens/TvCommunityScreen.svelte`

- [ ] **Step 1: Create TvConditionsScreen.svelte**

```svelte
<script lang="ts">
  import EnvironmentPanel from '$lib/components/panels/EnvironmentPanel.svelte';
  import TidesPanel from '$lib/components/panels/TidesPanel.svelte';
  import ConditionsPanel from '$lib/components/panels/ConditionsPanel.svelte';
</script>

<div class="flex h-full gap-2 p-2">
  <div class="flex-1 min-w-0 flex flex-col gap-2">
    <div class="shrink-0">
      <EnvironmentPanel />
    </div>
    <div class="flex-1 min-h-0">
      <TidesPanel />
    </div>
  </div>
  <div class="w-80 shrink-0 overflow-y-auto">
    <ConditionsPanel />
  </div>
</div>
```

- [ ] **Step 2: Create TvCommunityScreen.svelte**

```svelte
<script lang="ts">
  import { outdoorsNews, civicNews } from '$lib/stores';

  const outdoorItems = $derived($outdoorsNews.items.slice(0, 8));
  const civicItems = $derived($civicNews.items.slice(0, 8));

  function relativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
</script>

<div class="h-full p-6 overflow-hidden">
  <div class="grid grid-cols-2 gap-6 h-full">
    <div>
      <h2 class="text-2xl font-bold text-gray-100 mb-4">Outdoors & Lifestyle</h2>
      <div class="space-y-3">
        {#each outdoorItems as item (item.id)}
          <div class="bg-gray-800/60 rounded-lg p-3 border border-gray-700/50">
            <h3 class="text-base font-medium text-gray-100 line-clamp-2">{item.title}</h3>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-xs text-gray-400">{item.source}</span>
              <span class="text-xs text-gray-500">{relativeTime(item.timestamp)}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
    <div>
      <h2 class="text-2xl font-bold text-gray-100 mb-4">Civic</h2>
      <div class="space-y-3">
        {#each civicItems as item (item.id)}
          <div class="bg-gray-800/60 rounded-lg p-3 border border-gray-700/50">
            <h3 class="text-base font-medium text-gray-100 line-clamp-2">{item.title}</h3>
            <div class="flex items-center gap-2 mt-1">
              <span class="text-xs text-gray-400">{item.source}</span>
              <span class="text-xs text-gray-500">{relativeTime(item.timestamp)}</span>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/tv/screens/TvConditionsScreen.svelte src/lib/components/tv/screens/TvCommunityScreen.svelte
git commit -m "feat(tv-v2): add TvConditionsScreen and TvCommunityScreen"
```

---

## Task 7: Update SafetyScreen + NewsWireScreen

**Files:**
- Modify: `src/lib/components/tv/screens/SafetyScreen.svelte`
- Modify: `src/lib/components/tv/screens/NewsWireScreen.svelte`

- [ ] **Step 1: Rewrite SafetyScreen**

Read `src/lib/components/tv/screens/SafetyScreen.svelte`. Remove CamerasPanel import. Make full-width. Wrap the feed in `TvAutoScroll`. Show more items (increase from 8 to 20 since we have full width now).

```svelte
<script lang="ts">
  import { safetyNews, alerts } from '$lib/stores';
  import TvAutoScroll from '$lib/components/tv/TvAutoScroll.svelte';

  const safetyItems = $derived($safetyNews.items.slice(0, 20));
  const activeAlerts = $derived($alerts.slice(0, 6));

  function relativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }
</script>

<div class="h-full flex flex-col p-4">
  <h2 class="text-2xl font-bold text-gray-100 mb-4 shrink-0">Crime & Safety</h2>

  {#if activeAlerts.length > 0}
    <div class="mb-4 space-y-2 shrink-0">
      {#each activeAlerts as alert (alert.id)}
        <div class="bg-red-900/30 border border-red-700/50 rounded-lg p-3">
          <span class="text-xs font-bold text-red-400 uppercase">Alert</span>
          <p class="text-sm text-gray-200 mt-1">{alert.title}</p>
        </div>
      {/each}
    </div>
  {/if}

  <div class="flex-1 min-h-0">
    <TvAutoScroll>
      <div class="grid grid-cols-2 gap-3 p-1">
        {#each safetyItems as item (item.id)}
          <div class="bg-gray-800/60 rounded-lg p-3 border border-gray-700/50">
            <div class="flex justify-between items-start">
              <h3 class="text-base font-medium text-gray-100 line-clamp-2">{item.title}</h3>
              <span class="text-xs text-gray-500 shrink-0 ml-2">{relativeTime(item.timestamp)}</span>
            </div>
            <span class="text-xs text-gray-400">{item.source}</span>
          </div>
        {/each}
      </div>
    </TvAutoScroll>
  </div>
</div>
```

- [ ] **Step 2: Add TvAutoScroll to NewsWireScreen**

Read `src/lib/components/tv/screens/NewsWireScreen.svelte`. Wrap the grid in `TvAutoScroll`. Increase items from 10 to 16.

Replace the outer div structure:
```svelte
<script lang="ts">
  import { localNews } from '$lib/stores';
  import TvAutoScroll from '$lib/components/tv/TvAutoScroll.svelte';

  const items = $derived($localNews.items.slice(0, 16));

  function relativeTime(ts: number): string {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }
</script>

<div class="h-full flex flex-col p-6">
  <h2 class="text-2xl font-bold text-gray-100 mb-4 shrink-0">Local News Wire</h2>
  <div class="flex-1 min-h-0">
    <TvAutoScroll>
      <div class="grid grid-cols-2 gap-4">
        {#each items as item (item.id)}
          <div class="bg-gray-800/60 rounded-lg p-4 border border-gray-700/50">
            <div class="flex items-center gap-2 mb-2">
              <span class="text-xs font-medium px-2 py-0.5 rounded bg-gray-700 text-gray-300">
                {item.source}
              </span>
              <span class="text-xs text-gray-500">{relativeTime(item.timestamp)}</span>
            </div>
            <h3 class="text-lg font-semibold text-gray-100 leading-snug line-clamp-3">{item.title}</h3>
            {#if item.description}
              <p class="text-sm text-gray-400 mt-1 line-clamp-2">{item.description}</p>
            {/if}
          </div>
        {/each}
      </div>
    </TvAutoScroll>
  </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/tv/screens/SafetyScreen.svelte src/lib/components/tv/screens/NewsWireScreen.svelte
git commit -m "feat(tv-v2): rewrite SafetyScreen full-width, add TvAutoScroll to Safety + NewsWire"
```

---

## Task 8: Update TvWallboard + Delete Old Screens

**Files:**
- Modify: `src/lib/components/tv/TvWallboard.svelte`
- Delete: `src/lib/components/tv/screens/CameraWallScreen.svelte`
- Delete: `src/lib/components/tv/screens/EnvironmentScreen.svelte`
- Delete: `src/lib/components/tv/screens/OutdoorsScreen.svelte`
- Delete: `src/lib/components/tv/screens/MapConditionsScreen.svelte`

- [ ] **Step 1: Update TvWallboard imports and screen routing**

Read `src/lib/components/tv/TvWallboard.svelte`. Replace the screen imports and the screen routing in the template.

**Replace imports (lines 7-12):**
```typescript
  import TvMapScreen from './screens/TvMapScreen.svelte';
  import NewsWireScreen from './screens/NewsWireScreen.svelte';
  import SafetyScreen from './screens/SafetyScreen.svelte';
  import TvCameraClusterScreen from './screens/TvCameraClusterScreen.svelte';
  import TvConditionsScreen from './screens/TvConditionsScreen.svelte';
  import TvCommunityScreen from './screens/TvCommunityScreen.svelte';
```

**Replace screen routing in the template** (the `{#each TV_SCREENS}` block):
```svelte
    {#each TV_SCREENS as screen, i (screen.id)}
      <TvScreen active={carouselIdx === i}>
        {#if screen.id === 'map-explorer'}
          <TvMapScreen {earthquakeItems} active={carouselIdx === i} />
        {:else if screen.id === 'news-wire'}
          <NewsWireScreen />
        {:else if screen.id === 'safety'}
          <SafetyScreen />
        {:else if screen.id === 'cameras-tam-coast'}
          <TvCameraClusterScreen clusterId="tam-coast" />
        {:else if screen.id === 'cameras-central-highway'}
          <TvCameraClusterScreen clusterId="central-highway" />
        {:else if screen.id === 'cameras-west-north'}
          <TvCameraClusterScreen clusterId="west-north" />
        {:else if screen.id === 'conditions'}
          <TvConditionsScreen />
        {:else if screen.id === 'community'}
          <TvCommunityScreen />
        {/if}
      </TvScreen>
    {/each}
```

Also clean up state that the old MapConditionsScreen needed but TvMapScreen now handles internally:
- Remove `let weatherForecast` and `let weatherAlerts` state declarations
- Remove `WeatherData` and `FireWeatherAlert` from the type imports
- In `loadWeather()`, remove `weatherForecast = data.forecast` and `weatherAlerts = data.alerts` — keep ONLY the hourly fetch for the header temp display
- Remove `fetchWeather` from the `$lib/api/marin` import (no longer needed in wallboard)
- Keep `earthquakeItems` state + the earthquake fetch in `loadNews()` — TvMapScreen still receives it as a prop
- Keep `hourlyPeriods` + `currentTemp` — used by the header stats bar

- [ ] **Step 2: Delete old screen files**

```bash
cd /Users/tammypais/projects/marin-monitor
rm src/lib/components/tv/screens/CameraWallScreen.svelte
rm src/lib/components/tv/screens/EnvironmentScreen.svelte
rm src/lib/components/tv/screens/OutdoorsScreen.svelte
rm src/lib/components/tv/screens/MapConditionsScreen.svelte
```

- [ ] **Step 3: Update barrel export**

Read `src/lib/components/tv/index.ts` and ensure it exports the correct components. It should export:
```typescript
export { default as TvScreen } from './TvScreen.svelte';
export { default as TvChyron } from './TvChyron.svelte';
export { default as TvWallboard } from './TvWallboard.svelte';
```

- [ ] **Step 4: Type check**

Run: `cd /Users/tammypais/projects/marin-monitor && npm run check 2>&1 | grep "Error:"`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/tv/TvWallboard.svelte src/lib/components/tv/index.ts
git rm src/lib/components/tv/screens/CameraWallScreen.svelte src/lib/components/tv/screens/EnvironmentScreen.svelte src/lib/components/tv/screens/OutdoorsScreen.svelte src/lib/components/tv/screens/MapConditionsScreen.svelte
git commit -m "feat(tv-v2): wire up 8-screen carousel, delete old screen components"
```

---

## Task 9: Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Type check**

Run: `cd /Users/tammypais/projects/marin-monitor && npm run check 2>&1 | tail -3`
Expected: 0 errors (warnings OK)

- [ ] **Step 2: Build**

Run: `cd /Users/tammypais/projects/marin-monitor && npm run build 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Unit tests**

Run: `cd /Users/tammypais/projects/marin-monitor && npm run test:unit 2>&1 | tail -10`
Expected: All existing tests pass (no changes to tested code)

- [ ] **Step 4: Fix any issues, commit**

If fixes needed:
```bash
git add -A
git commit -m "fix(tv-v2): resolve build/type issues"
```

---

## Task 10: Push + Changelog

- [ ] **Step 1: Push**

```bash
cd /Users/tammypais/projects/marin-monitor && git push origin main
```

- [ ] **Step 2: Update CHANGELOG.md**

Add under the existing 2026-03-24 section:

```markdown
### Changed
- **TV Mode v2** — Redesigned carousel with 8 purpose-built screens. Geographic camera clusters (Tam & Coast, Central & Highway, West & North) replace the generic camera wall. Contextual map sidebar shows per-region weather and nearby stories during flyby. Full-width safety feed with vertical auto-scroll. Combined Conditions & Trails screen with Hero Dirt (single instance). Outdoors & Community two-column headline screen.
```

- [ ] **Step 3: Update src/lib/config/changelog.ts**

Update the existing TV Mode entry description.

- [ ] **Step 4: Commit and push**

```bash
git add CHANGELOG.md src/lib/config/changelog.ts
git commit -m "docs: update changelog for TV carousel v2"
git push origin main
```

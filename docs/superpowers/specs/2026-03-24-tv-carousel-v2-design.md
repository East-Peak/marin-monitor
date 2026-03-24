# TV Carousel v2 — Screen Redesign Spec

## Problem

The current TV carousel has duplication (cameras on two screens, Hero Dirt on two screens), underpopulated screens, and layout issues (content overflows viewport with scrollbars, camera thumbnails too small). The screens need a holistic redesign where every screen fills the viewport, earns its place, and has no panel duplication.

## Design

### 8 Carousel Screens

#### Screen 1: Map Explorer (30s)
The map with regional flyby sub-carousel (county overview -> Southern Marin -> Central Marin -> Novato & North -> West Marin, 6s per sub-view).

**Contextual sidebar** -- as the map flies to each region:
- Weather updates to that region's hourly forecast (current temp, wind, short forecast)
- Top 3-4 pinned stories visible in the current viewport shown as headline cards
- Active alerts for that area surface at the top

This is the hero/flagship screen. Gets 30s to complete the full flyby cycle.

**Components:** Custom `TvMapScreen` composing MapContainer + MapDataLayer + MapControls + TvMapFlyer + new `TvMapSidebar` (replaces static WeatherPanel).

#### Screen 2: News Wire (20s)
Local headlines in a 2-column grid. Keep as-is -- it's working well.

**Components:** `NewsWireScreen` (existing, unchanged).

#### Screen 3: Safety & Alerts (20s, auto-scroll)
Full-width, no camera sidebar. Alerts pinned at top in red banner cards. Crime/safety feed below.

If the feed exceeds the viewport height, it **auto-scrolls vertically** -- slow CSS animation (similar to chyron but vertical), continuous, no scrollbar visible. Content duplicated and scrolls 50% for seamless loop.

**Components:** Rewrite `SafetyScreen` -- remove CamerasPanel import, full-width layout, add vertical auto-scroll.

#### Screen 4: Tam & Coast Cameras (20s)
Geographic cluster: cameras looking at the Mt Tamalpais and coastline corridor.

**Cameras (8):**
- Mt. Tam East (fire, ALERTCalifornia)
- Mt. Tam West (fire, ALERTCalifornia)
- Mt. Tamalpais Summit (scenic, ABC7)
- Muir Beach (fire, ALERTCalifornia)
- Muir Beach (scenic, Windy -- auto-load iframe or fallback)
- Wolfback Ridge (fire, ALERTCalifornia)
- Bolinas (fire, ALERTCalifornia)
- Golden Gate & Bay View (scenic, Windy -- auto-load iframe or fallback)

Full-screen grid, 4 per row x 2 rows. Big thumbnails filling the viewport. Auto-refreshing. Label overlay shows camera name + location.

**Components:** New `TvCameraClusterScreen` -- a reusable component that accepts a cluster ID and renders the matching cameras in a full-viewport grid.

#### Screen 5: Central Marin & Highway (20s)
Geographic cluster: cameras covering the populated 101 corridor and central ridgelines.

**Cameras (8):**
- 101 at Spencer Ave (traffic, Caltrans)
- 101 at SR-1 (traffic, Caltrans)
- 101 at I-580 (traffic, Caltrans)
- 101 at Ignacio Blvd (traffic, Caltrans)
- San Pedro (fire, ALERTCalifornia)
- San Rafael Hill (fire, ALERTCalifornia)
- Big Rock (fire, ALERTCalifornia)
- Big Rock 2 (fire, ALERTCalifornia)

Same full-screen grid layout as Screen 4. 4 per row x 2 rows.

**Components:** Same `TvCameraClusterScreen` with different cluster ID.

#### Screen 6: West Marin & North (20s)
Geographic cluster: cameras covering rural West Marin, Point Reyes, and the Novato hills.

**Cameras (8):**
- Barnabe East (fire, ALERTCalifornia)
- Barnabe West (fire, ALERTCalifornia)
- Black Mountain (fire, ALERTCalifornia)
- Vision (fire, ALERTCalifornia)
- Burdell (fire, ALERTCalifornia)
- Burdell 2 (fire, ALERTCalifornia)
- Mt. Burdell South (fire, ALERTCalifornia)
- League 221 (fire, ALERTCalifornia)

Same full-screen grid layout. 4 per row x 2 rows.

**Components:** Same `TvCameraClusterScreen` with different cluster ID.

#### Screen 7: Conditions & Trails (20s)
Combined environment + trail conditions in one dense screen:
- **Top row:** AQI card + UV card + Active Fires card (3 stat cards)
- **Middle:** Tides chart (from TidesPanel)
- **Bottom-left:** Stream gauges table
- **Bottom-right:** Hero Dirt Tracker (single instance, not duplicated)

This is the "what are conditions like right now" screen.

**Components:** New `TvConditionsScreen` composing EnvironmentPanel data (AQI/UV/fires/streams) + TidesPanel + ConditionsPanel (Hero Dirt). May need to extract sub-components or pass data as props rather than embedding full panels if they don't fit the layout.

#### Screen 8: Outdoors & Community (20s)
Two columns of headline cards:
- **Left column:** Outdoors & Lifestyle news (from `outdoorsNews` store)
- **Right column:** Civic news (from `civicNews` store)

Clean, text-focused -- well-formatted headline cards with source badges and timestamps.

**Components:** New `TvCommunityScreen` -- two-column layout reading from `outdoorsNews` and `civicNews` stores.

---

### Camera Clustering Config

Add a `tvCluster` field to the camera config (additive -- existing `category`/`subRegion` fields stay for the main dashboard):

```typescript
export type TvCameraCluster = 'tam-coast' | 'central-highway' | 'west-north';

// Added to CameraConfig interface:
tvCluster?: TvCameraCluster;
```

Each camera gets assigned to exactly one TV cluster based on geography/view direction:

| Cluster | Label | Cameras | Theme |
|---------|-------|---------|-------|
| `tam-coast` | Tam & Coast | Tam East/West, Tam Summit, Muir Beach x2, Wolfback, Bolinas, Golden Gate Bay | Mountain ridgeline + coastline |
| `central-highway` | Central & Highway | Spencer, SR-1, I-580, Ignacio, San Pedro, SR Hill, Big Rock x2 | Populated corridor + central peaks |
| `west-north` | West & North | Barnabe E/W, Black Mtn, Vision, Burdell x2, Burdell South, League 221 | Rural hills + pastoral views |

The `TvCameraClusterScreen` component filters cameras by `tvCluster` and renders them in a responsive grid.

---

### TV Camera Screen Component

`TvCameraClusterScreen` is a **single reusable component** used by all 3 camera screens:

```typescript
interface Props {
  clusterId: TvCameraCluster;
  title: string;
}
```

It:
- Filters `CAMERAS` by `tvCluster === clusterId`
- Renders a CSS grid filling the viewport (`grid-template-columns: repeat(auto-fit, minmax(300px, 1fr))`)
- Each cell: camera image (full cell width), name overlay top-left, location overlay top-right, source badge bottom-right
- Auto-refreshes images on `refreshInterval` with cache-busting query param
- For `type === 'iframe'` cameras (Windy): render the iframe directly with `loading="eager"` in TV mode, or show a fallback card with the camera name + "Live stream" label if the iframe fails

---

### Cross-Cutting: Auto-Scroll for Overflow

Any screen where content may exceed the viewport height (Safety, News Wire) uses **vertical auto-scroll**:
- Slow continuous scroll (~30px/s)
- Content duplicated (`[...items, ...items]`, scroll 50%) for seamless loop
- No visible scrollbar (`overflow: hidden`)
- Hover pauses the animation

This is the vertical equivalent of the chyron's horizontal scroll.

---

### Cross-Cutting: Windy Iframe Handling

The 2 Windy cameras (Golden Gate Bay View, Muir Beach scenic) use `type: 'iframe'` and show "Click to load" on the main dashboard. For TV mode:
- Render the iframe with `loading="eager"` so it auto-loads without interaction
- If the iframe fails to load within 5s, show a fallback card: camera name, location, "Stream unavailable" in gray text
- The Windy iframes are webcam streams, not static images, so they provide real-time video when loaded

---

### Config Changes

Update `src/lib/config/tv.ts`:

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

Total cycle time: 30 + (7 x 20) = 170 seconds = ~2.8 minutes per full rotation.

---

### Map Explorer Contextual Sidebar -- Data Flow

Each `TvMapView` in the config gets extended with weather coordinates:

```typescript
export interface TvMapView {
  id: string;
  label: string;
  center: [number, number]; // map camera [lon, lat]
  zoom: number;
  duration: number;
  weatherLat: number;      // lat for weather fetch
  weatherLon: number;      // lon for weather fetch
}
```

`TvMapFlyer` emits a callback (`onViewChange`) when the sub-view changes. The parent `TvMapScreen` receives it and:
1. Fetches hourly weather for the new region's lat/lon (cached per region ID)
2. Filters `allNewsItems` to items whose lat/lon falls within ~0.05 degrees of the view center
3. Renders the sidebar with region-specific weather + visible stories + any active alerts

Weather is cached per region so we don't re-fetch on every carousel cycle.

---

### What Gets Removed

- `CameraWallScreen.svelte` -- replaced by 3x `TvCameraClusterScreen`
- `EnvironmentScreen.svelte` -- merged into `TvConditionsScreen`
- `OutdoorsScreen.svelte` -- replaced by `TvCommunityScreen`
- `MapConditionsScreen.svelte` -- replaced by `TvMapScreen`
- Camera sidebar from Safety screen
- Hero Dirt duplication (appears only on Conditions screen)
- ExpandedCamerasPanel reuse in TV mode

### What's Kept Unchanged

- `NewsWireScreen.svelte` -- working well
- `TvChyron.svelte` -- working well
- `TvScreen.svelte` -- fade transition wrapper
- `TvWallboard.svelte` -- carousel controller (updated for new screen IDs)
- Chyron ticker + header stats bar
- Main dashboard -- completely untouched

---

### File Structure

```
MODIFIED:
  src/lib/config/tv.ts                    -- new screen IDs, camera cluster config
  src/lib/config/cameras.ts               -- add tvCluster field to CameraConfig + assignments
  src/lib/components/tv/TvWallboard.svelte -- new screen routing, map sidebar data flow
  src/lib/components/tv/TvMapFlyer.svelte  -- add onViewChange callback

NEW:
  src/lib/components/tv/screens/TvMapScreen.svelte           -- map + contextual sidebar
  src/lib/components/tv/screens/TvCameraClusterScreen.svelte -- reusable camera grid
  src/lib/components/tv/screens/TvConditionsScreen.svelte    -- AQI/tides/streams/Hero Dirt
  src/lib/components/tv/screens/TvCommunityScreen.svelte     -- outdoors + civic headlines
  src/lib/components/tv/TvMapSidebar.svelte                  -- contextual weather + stories
  src/lib/components/tv/TvAutoScroll.svelte                  -- vertical auto-scroll wrapper

DELETED:
  src/lib/components/tv/screens/CameraWallScreen.svelte
  src/lib/components/tv/screens/EnvironmentScreen.svelte
  src/lib/components/tv/screens/OutdoorsScreen.svelte
  src/lib/components/tv/screens/MapConditionsScreen.svelte
  src/lib/components/tv/screens/PulseScreen.svelte (already deleted)
```

---

### Acceptance Criteria

- [ ] 8 screens rotate with correct per-screen durations (30s map, 20s others)
- [ ] No panel appears on more than one screen
- [ ] Hero Dirt appears only on Conditions screen
- [ ] 3 camera screens show geographic clusters filling the viewport
- [ ] Camera grids are purpose-built with big thumbnails, no dead space
- [ ] Windy iframes auto-load in TV mode (no "Click to load")
- [ ] Safety screen auto-scrolls when content overflows (no scrollbar)
- [ ] Map sidebar updates weather and stories per flyby region
- [ ] Every screen fills the viewport -- no dead space, no visible scrollbars
- [ ] Camera clustering uses geographic/view-direction logic, not operational categories
- [ ] Existing main dashboard is completely unchanged
- [ ] All existing keyboard shortcuts still work

# TV Mode Refresh v2 — Design Spec

**Date:** 2026-04-01
**Status:** Approved

## Goals

1. Fix broken scroll behavior (content restarts from top on every carousel cycle)
2. Add new indices to TV mode (Coffee, Grocery, Wine, Tuition, Fitness, Driveway, Cost of Being Marin)
3. Add 311/FixItMarin photo wall as a hero screen
4. Enrich map screens with data overlays
5. Rework the environmental/conditions grab-bag into focused screens
6. Fill chyron gaps with index headlines
7. Optimize all screens for TV-style viewport (large text, high contrast, readable from 10-15 feet)

## Design Principles

- **Ambient + party trick:** Scannable at a glance but rewards attention. Big type, high contrast, moments of delight.
- **Screens earn their airtime.** Some things are hero screens, some get grouped, some are just chyron fodder.
- **TV-optimized viewport.** Content designed for landscape 16:9 at viewing distance. No mouse interaction assumed.
- **Thematic clustering without block machinery.** Screen order creates implicit thematic groups, but the carousel is still a simple ordered list with variable durations.

## Approach

Smart Carousel with Hero Moments (Approach C with thematic ordering from B). Three screen types with distinct visual weight and duration:

- **HERO** (22s) — Single dominant visual, minimal chrome, reads from 15 feet
- **ANCHOR** (18-20s) — Proven existing layouts (news grid, camera grid, leaderboard columns)
- **CARD** (12s) — 2-3 data blocks side by side, TV-optimized typography, dense but scannable
- **MAP** (15s) — Existing map regions with new data overlays

## Screen Inventory (20 screens, ~5:25 cycle)

### Cluster: The Map (~75s)

| # | ID | Type | Duration | Content |
|---|-----|------|----------|---------|
| 1 | map-county | MAP | 15s | County overview with 311 pins + alert badges + AQI |
| 2 | map-south | MAP | 15s | South Marin with gas/coffee price pins |
| 3 | map-central | MAP | 15s | Central Marin with fitness/EV pins |
| 4 | map-north | MAP | 15s | Novato & North with local story pins |
| 5 | map-west | MAP | 15s | West Marin with trail/surf conditions |

Max 2-3 overlay types per map to avoid clutter. Overlays drawn from already-loaded data. Sidebar remains (weather + nearby stories).

### Cluster: News & Safety (~40s)

| # | ID | Type | Duration | Content |
|---|-----|------|----------|---------|
| 6 | news-wire | ANCHOR | 20s | Local News Wire, 2-column grid |
| 7 | safety | ANCHOR | 20s | Crime & Safety + active alerts |

### Cluster: Eyes on Marin (~54s)

| # | ID | Type | Duration | Content |
|---|-----|------|----------|---------|
| 8 | cameras-tam | ANCHOR | 18s | Mt Tam & coastal cameras |
| 9 | cameras-central | ANCHOR | 18s | 101 corridor cameras |
| 10 | cameras-west | ANCHOR | 18s | West Marin & Novato cameras |

### Cluster: Cost of Living (~46s)

| # | ID | Type | Duration | Content |
|---|-----|------|----------|---------|
| 11 | composite | HERO | 22s | "The Marin Number" $21,110/mo hero stat, 4 tier cards with sparklines, sub-index summary strip |
| 12 | daily-life | CARD | 12s | Cappuccino ($5.75) + Grocery Basket ($187) + Gas ($5.89) |
| 13 | lifestyle | CARD | 12s | Wine Index (category medians) + Fitness (drop-in range by type) |

### Cluster: Structural Marin (~24s)

| # | ID | Type | Duration | Content |
|---|-----|------|----------|---------|
| 14 | structural | CARD | 12s | School Tuition (4 tiers + K-12 cumulative) + Housing |
| 15 | driveway | CARD | 12s | Top makes, EV %, fuel breakdown, notable stats |

### Cluster: The Wall of Grievances (~22s)

| # | ID | Type | Duration | Content |
|---|-----|------|----------|---------|
| 16 | 311-photos | HERO | 22s | 3-column scrolling grid of 311 complaint photos with captions (type, street, time ago). Photos only (skip no-photo complaints). Loads all photo-bearing complaints from last 7 days. TvScroller continues from saved position across carousel cycles. Fallback: if fewer than 6 photos, use 2-column layout; if fewer than 3, use single-column. If zero photos, skip this screen in the carousel. |

### Cluster: Community & Sport (~40s)

| # | ID | Type | Duration | Content |
|---|-----|------|----------|---------|
| 17 | community | ANCHOR | 20s | Outdoors + Civic dual-column |
| 18 | leaderboards | ANCHOR | 20s | Strava KOM/QOM cycling + running columns |

### Cluster: Conditions (~24s)

| # | ID | Type | Duration | Content |
|---|-----|------|----------|---------|
| 19 | conditions | CARD | 12s | Weather (temp, hi/lo, wind) + AQI (PM2.5, ozone) + Tides (next high/low) |
| 20 | outdoors | CARD | 12s | Surf report (Bolinas/Stinson) + Hero Dirt tracker + Stream gauges (3 creeks with bar sparklines) |

## Map Overlays

| Map Screen | Overlay Data | Visual Treatment |
|------------|-------------|-----------------|
| map-county | 311 complaint pins, active alerts, AQI | Photo thumbnails, pulsing alert badges, corner AQI badge |
| map-south | Coffee shop price pins, cheapest gas, safety incidents | "$5.75" label pins, green/red price labels, dot pins |
| map-central | Fitness studio pins, EV charging, 311 complaints | Color-coded by activity type, connector icons, photo thumbnails |
| map-north | Local news story pins, gas stations, community events | Headline tooltips, price labels, calendar dots |
| map-west | Surf conditions, trail status, stream gauge levels | Wave height badge, green/yellow/red dots, water level badges |

## Scroll System: TvScroller

Replace `TvAutoScroll` (CSS animation) and the conditions custom `setInterval` timer with a unified JS scroll controller.

### How it works

1. **Screen becomes active:** Check scroll position store for saved `scrollTop`. If found, jump to saved position. Start `requestAnimationFrame` loop: `scrollTop += speed * deltaTime`.
2. **Screen becomes inactive:** Save current `scrollTop` to store (keyed by screen ID). Cancel rAF loop.
3. **Reaching bottom:** Pause briefly, then wrap to top smoothly.
4. **Data refresh (every 3 min):** If content height changed significantly, reset scroll to 0. Otherwise preserve position.

### Config

- Default speed: ~30px/sec (tunable per screen)
- At 1080p: one full viewport of scroll per ~36 seconds
- Across two visits to a 20s screen, most content visible

### Scroll state store

```typescript
// In-memory store (resets on page reload, which happens every 6 hours)
Map<screenId, { scrollTop: number, timestamp: number }>
```

### Components affected

All scrolling screens migrate from TvAutoScroll to TvScroller:
- NewsWireScreen, SafetyScreen, TvCommunityScreen, TvLeaderboardsScreen
- New: Tv311PhotoWall
- TvConditionsScreen custom timer also replaced

## Chyron Updates

### New ticker category: IDX (Index Updates)

Added alongside existing WX, FI, EQ, GG, PD, LW, CV, 311, KOM categories.

Example items:
- `IDX  Cappuccino Index: $5.75 avg -- up $0.15 this week`
- `IDX  Grocery Basket: $187.42 for 12 items -- down 1.1%`
- `IDX  Napa Cab median: $89 -- Wine Index up 3.2%`
- `IDX  The Marin Number: $21,110/mo ($253,320/yr)`
- `IDX  Private school K-12: $698,998 cumulative`
- `IDX  Marin EV share: 8.3% -- 68 hydrogen fuel cells registered`

Rules:
- Max 4-5 IDX items per ticker rotation (rotate which indices appear each refresh)
- Prefer items with notable delta over static values
- Normal status (not elevated/critical) -- informational, not urgent
- Neutral badge color, distinct from alert colors
- Weather alerts and fire incidents still dominate when present

## Component Changes

### New components
- `TvScroller.svelte` — Replaces TvAutoScroll + conditions timer
- `Tv311PhotoWall.svelte` — Hero screen, scrolling photo grid
- `TvCompositeHero.svelte` — Hero screen, The Marin Number
- `TvDailyLifeCard.svelte` — Card, coffee + grocery + gas
- `TvLifestyleCard.svelte` — Card, wine + fitness
- `TvStructuralCard.svelte` — Card, tuition + driveway
- `TvConditionsCard.svelte` — Card, weather + AQI + tides
- `TvOutdoorsCard.svelte` — Card, surf + dirt + streams

### Modified components
- `TvWallboard.svelte` — New screen list, variable durations, scroll state store, index data loading
- `TvMapScreen.svelte` — Data overlay layers per region
- `TvMapSidebar.svelte` — Overlay legend/badges
- `tv.ts` (config) — New screen entries, IDX ticker category, screen type/duration map
- `tv.ts` (store) — Index ticker items, scroll position store

### Removed components
- `TvAutoScroll.svelte` — Replaced by TvScroller
- `TvConditionsScreen.svelte` — Split into TvConditionsCard + TvOutdoorsCard

### Unchanged components
- `TvChyron.svelte` — Same marquee, more items
- `TvScreen.svelte` — Same wrapper
- `TvWallboardHeader.svelte` — Same header (dot count increases to 20)
- `TvCameraClusterScreen.svelte` — Same 3 clusters
- `TvLeaderboardsScreen.svelte` — Migrates to TvScroller
- `NewsWireScreen.svelte` — Migrates to TvScroller
- `SafetyScreen.svelte` — Migrates to TvScroller
- `TvCommunityScreen.svelte` — Migrates to TvScroller

## Data Loading

Existing 3-minute refresh cycle adds fetches for: composite, cappuccino, grocery-basket, wine-index, fitness, school-tuition, driveway, gas-prices endpoints. All are thin JSON fetches to `/api/data/*` (blob-backed, CDN-cached). ~8 additional small requests per refresh cycle.

## What stays the same

- Carousel tick mechanism (1s interval, elapsed time check)
- Keyboard controls (arrows, space, R, F, M/Escape)
- 3-minute data refresh, 6-hour page reload
- Persistent map (single WebGL context)
- Chyron CSS marquee animation (no scroll state issue)
- Camera cluster screens (3 clusters, unchanged)

## Decisions

- **Citizen adapter:** Deferred to backlog. API returns near-zero volume for Marin and response format has drifted. Not worth wiring up now.
- **Block transitions:** Not implemented. Thematic ordering of screens achieves 80% of the benefit without block-level state management. Title cards between clusters can be added later if desired.
- **Scroll persistence:** In-memory only (not localStorage). Resets on the 6-hour page reload, which is fine.

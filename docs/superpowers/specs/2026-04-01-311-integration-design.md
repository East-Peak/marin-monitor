# 311 (FixItMarin) Integration Design

**Date:** 2026-04-01
**Status:** Approved
**Data source:** SeeClickFix API (free, public, no auth)

## Overview

Add FixItMarin (SeeClickFix) as a first-class data source with its own map layer (`311`), wire column, photo-rich cards, map pin click with photo previews, and chyron ticker items. The adapter (`seeclickfix.ts`) and `NewsItem` image fields (`imageUrl`, `thumbnailUrl`) already exist.

## Map Layer: `311`

- **Color:** orange `#ff6b35` — single color for all 311 pins regardless of category
- **Pin label** (zoom 12+): English category + street snippet (e.g. "Dumping · Lincoln Ave")
- **Click inspector:** category, address, description, status badge (OPEN/ACKNOWLEDGED/CLOSED), photo (800x600) if available — this is the only place photos render
- **Hover:** standard MapLibre hover state (enlarged pin + stroke glow), same pattern as coffee/gas/fitness
- **Toggle:** independent layer in MapControls, labeled "311"
- **Town filter:** respects existing town filter store

## Wire Column: "311"

- **New `NewsCategory`:** `'311'`
- **New `PanelId`:** `'311'`
- Uses standard `NewsPanel` component (same as every other wire column)
- No inline photos — photos appear only on map pin click inspector
- Cards show: category + street snippet, town, relative time, source attribution

## Chyron

- **New `TickerCategory`:** `'311'`
- All new issues feed the ticker
- Badge text: `311`
- Format: "{Category} reported · {street}, {town}"

## Data Flow

```
SeeClickFix API v2 (direct fetch on refresh, no cron/blob)
  → seeclickfix.ts adapter (exists, change category to '311')
  → NewsItem[] with imageUrl/thumbnailUrl (exists)
  → news store → 311 wire column (ThreeOneOnePanel.svelte)
  → map store → 311 map layer pins (MapDataLayer.svelte)
  → tv ticker store → chyron (tvTickerItems)
```

## Files to Modify

| File                                                | Change                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `src/lib/types/index.ts`                            | Add `'311'` to `NewsCategory` and `MapLayer`                                         |
| `src/lib/types/map.ts`                              | Add `'311-report'` to `MapFeatureKind`                                               |
| `src/lib/config/panels.ts`                          | Add `'311'` to `PanelId`, `PANELS`, `CURATED_PANEL_ORDER`                            |
| `src/lib/config/wire-columns.ts`                    | Add `{ panelId: '311', category: '311', title: '311' }`                              |
| `src/lib/config/map.ts`                             | Add `'311': '#ff6b35'` to `LAYER_COLORS`                                             |
| `src/lib/config/tv.ts`                              | Add `'311'` to `TickerCategory`, add color to `CATEGORY_COLORS`                      |
| `src/lib/stores/map.ts`                             | Add `'311'` to `ALL_LAYERS`, add `'311': '311'` to `CATEGORY_TO_LAYER`               |
| `src/lib/stores/tv.ts`                              | Add 311 filter to `tvTickerItems` derived store                                      |
| `src/lib/api/marin/load-all.ts`                     | Wire `fetchSeeClickFixIssues()` into `'311'` category                                |
| `src/lib/api/marin/seeclickfix.ts`                  | Change `category: 'civic'` to `category: '311'`                                      |
| `src/lib/components/map/MapDataLayer.svelte`        | Add GeoJSON source, circle/hit/label layers, click/hover handlers, data subscription |
| `src/lib/components/map/MapControls.svelte`         | Add `'311'` to `LAYER_LABELS` and `LAYER_ORDER`                                      |
| `src/lib/components/map/MapFeatureInspector.svelte` | Add `'311-report'` case with photo rendering                                         |

## Existing Code to Reuse

- `src/lib/api/marin/seeclickfix.ts` — adapter already built, just change category
- `src/lib/api/marin/index.ts` — export already exists
- `NewsItem.imageUrl` / `NewsItem.thumbnailUrl` — fields already on the type

## Out of Scope

- Category-colored pins (single orange for all — revisit if volume grows)
- Spatial clustering / deduplication (revisit when >15 issues/day)
- Test data filtering ("Canal Alliance Training" submissions)
- Cron/blob storage (direct API fetch is fine at current volume)

# TV Mode Refresh v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the TV carousel with 20 screens (hero/anchor/card types), JS-driven scroll that preserves position across cycles, 7 new index screens, a 311 photo wall, map data overlays, and index headlines in the chyron.

**Architecture:** Smart Carousel with variable-duration screens. Replace CSS-animation scroll (`TvAutoScroll`) with a JS `requestAnimationFrame` controller (`TvScroller`) that saves scroll position per screen. New screens follow three visual templates: HERO (22s, dominant visual), ANCHOR (18-20s, proven layouts), CARD (12s, dense data). All index data fetched from existing `/api/data/*` blob endpoints.

**Tech Stack:** SvelteKit 2.0, Svelte 5 runes, TypeScript, Tailwind CSS, MapLibre GL

**Spec:** `docs/superpowers/specs/2026-04-01-tv-refresh-v2-design.md`

**Note:** The spec's component list says "TvStructuralCard — tuition + driveway" but the approved screen inventory (which takes precedence) defines structural as tuition + housing and driveway as a separate card. This plan follows the screen inventory.

---

## File Structure

### New files

| File                                                    | Responsibility                                   |
| ------------------------------------------------------- | ------------------------------------------------ |
| `src/lib/components/tv/TvScroller.svelte`               | JS-driven scroll with rAF, position save/restore |
| `src/lib/stores/tv-scroll.ts`                           | Scroll position store (Map keyed by screen ID)   |
| `src/lib/components/tv/screens/TvCompositeHero.svelte`  | "The Marin Number" hero screen                   |
| `src/lib/components/tv/screens/TvDailyLifeCard.svelte`  | Coffee + Grocery + Gas card                      |
| `src/lib/components/tv/screens/TvLifestyleCard.svelte`  | Wine + Fitness card                              |
| `src/lib/components/tv/screens/TvStructuralCard.svelte` | Tuition + Housing card                           |
| `src/lib/components/tv/screens/TvDrivewayCard.svelte`   | Vehicle registration card                        |
| `src/lib/components/tv/screens/Tv311PhotoWall.svelte`   | Scrolling 311 complaint photos                   |
| `src/lib/components/tv/screens/TvConditionsCard.svelte` | Weather + AQI + Tides card                       |
| `src/lib/components/tv/screens/TvOutdoorsCard.svelte`   | Surf + Dirt + Streams card                       |
| `src/lib/stores/tv-scroll.test.ts`                      | Tests for scroll position store                  |
| `src/lib/config/tv.test.ts`                             | Tests for TV config validation                   |
| `src/lib/stores/tv.test.ts`                             | Tests for IDX ticker items                       |

### Modified files

| File                                                        | Changes                                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/lib/config/tv.ts`                                      | New screen entries, `ScreenType` type, variable durations, `IDX` ticker category |
| `src/lib/stores/tv.ts`                                      | Add IDX ticker items from index data                                             |
| `src/lib/components/tv/TvWallboard.svelte`                  | New screen list, index data loading, variable durations, render new screens      |
| `src/lib/components/tv/TvWallboardHeader.svelte`            | Support 20 dots                                                                  |
| `src/lib/components/tv/screens/NewsWireScreen.svelte`       | TvAutoScroll → TvScroller                                                        |
| `src/lib/components/tv/screens/SafetyScreen.svelte`         | TvAutoScroll → TvScroller                                                        |
| `src/lib/components/tv/screens/TvCommunityScreen.svelte`    | TvAutoScroll → TvScroller                                                        |
| `src/lib/components/tv/screens/TvLeaderboardsScreen.svelte` | TvAutoScroll → TvScroller                                                        |
| `src/lib/components/tv/screens/TvMapScreen.svelte`          | Accept + render overlay data per region                                          |

### Removed files

| File                                                      | Reason                                       |
| --------------------------------------------------------- | -------------------------------------------- |
| `src/lib/components/tv/TvAutoScroll.svelte`               | Replaced by TvScroller                       |
| `src/lib/components/tv/screens/TvConditionsScreen.svelte` | Split into TvConditionsCard + TvOutdoorsCard |

---

## Task 1: TvScroller Component + Scroll State Store

Build the JS-driven scroll replacement for TvAutoScroll.

**Files:**

- Create: `src/lib/stores/tv-scroll.ts`
- Create: `src/lib/stores/tv-scroll.test.ts`
- Create: `src/lib/components/tv/TvScroller.svelte`

- [ ] **Step 1: Create the scroll position store**

```typescript
// src/lib/stores/tv-scroll.ts
const scrollPositions = new Map<string, { scrollTop: number; timestamp: number }>();

export function saveScrollPosition(screenId: string, scrollTop: number): void {
	scrollPositions.set(screenId, { scrollTop, timestamp: Date.now() });
}

export function getScrollPosition(screenId: string): number {
	return scrollPositions.get(screenId)?.scrollTop ?? 0;
}

export function resetScrollPosition(screenId: string): void {
	scrollPositions.delete(screenId);
}

export function resetAllScrollPositions(): void {
	scrollPositions.clear();
}
```

- [ ] **Step 2: Write tests for the scroll store**

```typescript
// src/lib/stores/tv-scroll.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
	saveScrollPosition,
	getScrollPosition,
	resetScrollPosition,
	resetAllScrollPositions
} from './tv-scroll';

describe('tv-scroll store', () => {
	beforeEach(() => {
		resetAllScrollPositions();
	});

	it('returns 0 for unknown screen', () => {
		expect(getScrollPosition('unknown')).toBe(0);
	});

	it('saves and retrieves scroll position', () => {
		saveScrollPosition('news-wire', 150);
		expect(getScrollPosition('news-wire')).toBe(150);
	});

	it('overwrites previous position', () => {
		saveScrollPosition('safety', 100);
		saveScrollPosition('safety', 250);
		expect(getScrollPosition('safety')).toBe(250);
	});

	it('resets individual screen position', () => {
		saveScrollPosition('safety', 100);
		resetScrollPosition('safety');
		expect(getScrollPosition('safety')).toBe(0);
	});

	it('resets all positions', () => {
		saveScrollPosition('safety', 100);
		saveScrollPosition('news-wire', 200);
		resetAllScrollPositions();
		expect(getScrollPosition('safety')).toBe(0);
		expect(getScrollPosition('news-wire')).toBe(0);
	});
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/stores/tv-scroll.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 4: Create TvScroller component**

```svelte
<!-- src/lib/components/tv/TvScroller.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { saveScrollPosition, getScrollPosition } from '$lib/stores/tv-scroll';

	interface Props {
		screenId: string;
		active: boolean;
		speed?: number;
		children: Snippet;
	}

	let { screenId, active, speed = 30, children }: Props = $props();

	let containerEl: HTMLDivElement | null = $state(null);
	let contentEl: HTMLDivElement | null = $state(null);
	let needsScroll = $state(false);
	let rafId: number | null = null;
	let lastFrameTime: number | null = null;
	let pausedAtBottom = false;
	let pauseTimeout: ReturnType<typeof setTimeout> | null = null;

	function getMaxScroll(): number {
		if (!containerEl || !contentEl) return 0;
		return Math.max(0, contentEl.scrollHeight - containerEl.clientHeight);
	}

	function checkOverflow(): void {
		const maxScroll = getMaxScroll();
		needsScroll = maxScroll > 10;
	}

	function startScrolling(): void {
		if (rafId !== null) return;

		// Restore saved position
		const saved = getScrollPosition(screenId);
		if (containerEl && saved > 0) {
			const maxScroll = getMaxScroll();
			containerEl.scrollTop = Math.min(saved, maxScroll);
		}

		lastFrameTime = null;
		pausedAtBottom = false;

		function tick(now: number): void {
			if (!active) return;
			if (!containerEl) return;

			if (lastFrameTime === null) {
				lastFrameTime = now;
				rafId = requestAnimationFrame(tick);
				return;
			}

			if (pausedAtBottom) {
				rafId = requestAnimationFrame(tick);
				return;
			}

			const deltaMs = now - lastFrameTime;
			lastFrameTime = now;

			// Cap delta to prevent jumps after tab-switch
			const cappedDelta = Math.min(deltaMs, 100);
			const pxToScroll = speed * (cappedDelta / 1000);

			const maxScroll = getMaxScroll();
			if (maxScroll <= 0) {
				rafId = requestAnimationFrame(tick);
				return;
			}

			const newTop = containerEl.scrollTop + pxToScroll;

			if (newTop >= maxScroll) {
				containerEl.scrollTop = maxScroll;
				pausedAtBottom = true;
				pauseTimeout = setTimeout(() => {
					if (containerEl) containerEl.scrollTop = 0;
					pausedAtBottom = false;
					lastFrameTime = null;
				}, 2000);
			} else {
				containerEl.scrollTop = newTop;
			}

			rafId = requestAnimationFrame(tick);
		}

		rafId = requestAnimationFrame(tick);
	}

	function stopScrolling(): void {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		if (pauseTimeout !== null) {
			clearTimeout(pauseTimeout);
			pauseTimeout = null;
		}
		lastFrameTime = null;
		pausedAtBottom = false;

		// Save position
		if (containerEl) {
			saveScrollPosition(screenId, containerEl.scrollTop);
		}
	}

	$effect(() => {
		if (active && needsScroll) {
			startScrolling();
		} else {
			stopScrolling();
		}
	});

	// Check overflow when content changes
	$effect(() => {
		if (!contentEl) return;

		const observer = new ResizeObserver(() => {
			const prevNeeded = needsScroll;
			checkOverflow();

			// If content height changed significantly while inactive, consider resetting
			if (active && needsScroll && !prevNeeded && containerEl) {
				containerEl.scrollTop = 0;
				saveScrollPosition(screenId, 0);
			}
		});

		observer.observe(contentEl);
		checkOverflow();

		return () => observer.disconnect();
	});

	onMount(() => {
		return () => stopScrolling();
	});
</script>

<div bind:this={containerEl} class="h-full w-full overflow-hidden">
	<div bind:this={contentEl}>
		{@render children()}
	</div>
</div>
```

- [ ] **Step 5: Run TypeScript check**

Run: `cd /Users/tammypais/projects/marin-monitor && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -E '(Error|TvScroller)' | head -20`
Expected: No errors in TvScroller.svelte

- [ ] **Step 6: Commit**

```bash
cd /Users/tammypais/projects/marin-monitor
git add src/lib/stores/tv-scroll.ts src/lib/stores/tv-scroll.test.ts src/lib/components/tv/TvScroller.svelte
git commit -m "feat(tv): add TvScroller component with JS-driven scroll and position persistence"
```

---

## Task 2: TV Config Updates

Add new screen definitions, screen types, variable durations, and IDX ticker category.

**Files:**

- Modify: `src/lib/config/tv.ts`
- Create: `src/lib/config/tv.test.ts`

- [ ] **Step 1: Write config validation tests**

```typescript
// src/lib/config/tv.test.ts
import { describe, it, expect } from 'vitest';
import { TV_SCREENS, CATEGORY_COLORS } from './tv';
import type { TickerCategory } from './tv';

describe('TV config', () => {
	it('has 20 screens', () => {
		expect(TV_SCREENS).toHaveLength(20);
	});

	it('all screens have positive duration', () => {
		for (const screen of TV_SCREENS) {
			expect(screen.durationMs).toBeGreaterThan(0);
		}
	});

	it('all screen IDs are unique', () => {
		const ids = TV_SCREENS.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('map screens have 15s duration', () => {
		const maps = TV_SCREENS.filter((s) => s.screenType === 'map');
		for (const m of maps) {
			expect(m.durationMs).toBe(15000);
		}
	});

	it('hero screens have 22s duration', () => {
		const heroes = TV_SCREENS.filter((s) => s.screenType === 'hero');
		for (const h of heroes) {
			expect(h.durationMs).toBe(22000);
		}
	});

	it('card screens have 12s duration', () => {
		const cards = TV_SCREENS.filter((s) => s.screenType === 'card');
		for (const c of cards) {
			expect(c.durationMs).toBe(12000);
		}
	});

	it('IDX category has a color', () => {
		expect(CATEGORY_COLORS['IDX' as TickerCategory]).toBeDefined();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/config/tv.test.ts`
Expected: FAIL — currently 13 screens, no `screenType` field, no IDX category

- [ ] **Step 3: Update TV config with new screens and types**

Update `src/lib/config/tv.ts`:

Add `ScreenType` and `IDX` to types:

```typescript
export type ScreenType = 'map' | 'hero' | 'anchor' | 'card';

export type TickerCategory =
	| 'WX'
	| 'PD'
	| 'LW'
	| 'FI'
	| 'EQ'
	| 'TD'
	| 'GG'
	| 'CV'
	| 'KOM'
	| '311'
	| 'IDX';
```

Add `screenType` to `TvScreenConfig`:

```typescript
export interface TvScreenConfig {
	id: TvScreenId;
	name: string;
	description: string;
	durationMs: number;
	screenType: ScreenType;
	mapViewId?: string;
}
```

Update `TvScreenId` to include all 20 screens:

```typescript
export type TvScreenId =
	| 'map-county'
	| 'map-south'
	| 'map-central'
	| 'map-north'
	| 'map-west'
	| 'news-wire'
	| 'safety'
	| 'cameras-tam-coast'
	| 'cameras-central-highway'
	| 'cameras-west-north'
	| 'composite'
	| 'daily-life'
	| 'lifestyle'
	| 'structural'
	| 'driveway'
	| '311-photos'
	| 'community'
	| 'leaderboards'
	| 'conditions'
	| 'outdoors';
```

Replace the `TV_SCREENS` array with all 20 screens in thematic cluster order, each with `screenType` and correct `durationMs`:

```typescript
export const TV_SCREENS: TvScreenConfig[] = [
	// Cluster: The Map
	{
		id: 'map-county',
		name: 'Marin County',
		description: 'County overview',
		durationMs: 15_000,
		screenType: 'map',
		mapViewId: 'county'
	},
	{
		id: 'map-south',
		name: 'South Marin',
		description: 'Mill Valley, Sausalito, Tiburon',
		durationMs: 15_000,
		screenType: 'map',
		mapViewId: 'south'
	},
	{
		id: 'map-central',
		name: 'Central Marin',
		description: 'San Rafael, San Anselmo, Larkspur',
		durationMs: 15_000,
		screenType: 'map',
		mapViewId: 'central'
	},
	{
		id: 'map-north',
		name: 'North Marin',
		description: 'Novato & North',
		durationMs: 15_000,
		screenType: 'map',
		mapViewId: 'north'
	},
	{
		id: 'map-west',
		name: 'West Marin',
		description: 'Point Reyes, Bolinas, Nicasio',
		durationMs: 15_000,
		screenType: 'map',
		mapViewId: 'west'
	},
	// Cluster: News & Safety
	{
		id: 'news-wire',
		name: 'Local News Wire',
		description: 'Latest local news',
		durationMs: 20_000,
		screenType: 'anchor'
	},
	{
		id: 'safety',
		name: 'Crime & Safety',
		description: 'Safety alerts and incidents',
		durationMs: 20_000,
		screenType: 'anchor'
	},
	// Cluster: Eyes on Marin
	{
		id: 'cameras-tam-coast',
		name: 'Mt Tam & Coast',
		description: 'Coastal and mountain cameras',
		durationMs: 18_000,
		screenType: 'anchor'
	},
	{
		id: 'cameras-central-highway',
		name: 'Central & 101',
		description: 'Highway and central cameras',
		durationMs: 18_000,
		screenType: 'anchor'
	},
	{
		id: 'cameras-west-north',
		name: 'West & North',
		description: 'West Marin and Novato cameras',
		durationMs: 18_000,
		screenType: 'anchor'
	},
	// Cluster: Cost of Living
	{
		id: 'composite',
		name: 'Cost of Being Marin',
		description: 'The Marin Number',
		durationMs: 22_000,
		screenType: 'hero'
	},
	{
		id: 'daily-life',
		name: 'Daily Life',
		description: 'Coffee, groceries, gas',
		durationMs: 12_000,
		screenType: 'card'
	},
	{
		id: 'lifestyle',
		name: 'Lifestyle',
		description: 'Wine and fitness',
		durationMs: 12_000,
		screenType: 'card'
	},
	// Cluster: Structural Marin
	{
		id: 'structural',
		name: 'Structural Marin',
		description: 'Tuition and housing',
		durationMs: 12_000,
		screenType: 'card'
	},
	{
		id: 'driveway',
		name: 'The Marin Driveway',
		description: 'Vehicle registration',
		durationMs: 12_000,
		screenType: 'card'
	},
	// Cluster: Wall of Grievances
	{
		id: '311-photos',
		name: 'Fix It Marin',
		description: '311 complaints with photos',
		durationMs: 22_000,
		screenType: 'hero'
	},
	// Cluster: Community & Sport
	{
		id: 'community',
		name: 'Community',
		description: 'Outdoors and civic',
		durationMs: 20_000,
		screenType: 'anchor'
	},
	{
		id: 'leaderboards',
		name: 'Strava Leaderboards',
		description: 'KOM and QOM records',
		durationMs: 20_000,
		screenType: 'anchor'
	},
	// Cluster: Conditions
	{
		id: 'conditions',
		name: 'Conditions',
		description: 'Weather, AQI, tides',
		durationMs: 12_000,
		screenType: 'card'
	},
	{
		id: 'outdoors',
		name: 'Outdoors',
		description: 'Surf, trails, streams',
		durationMs: 12_000,
		screenType: 'card'
	}
];
```

Add IDX to `CATEGORY_COLORS`:

```typescript
export const CATEGORY_COLORS: Record<TickerCategory, string> = {
	// ... existing colors ...
	IDX: '#6366f1' // indigo — neutral, distinct from alert colors
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/config/tv.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Run full test suite to check for regressions**

Run: `cd /Users/tammypais/projects/marin-monitor && npm run test:unit`
Expected: All tests pass. Some existing code may reference old screen IDs or count — fix any compilation errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/tammypais/projects/marin-monitor
git add src/lib/config/tv.ts src/lib/config/tv.test.ts
git commit -m "feat(tv): update config with 20 screens, screen types, variable durations, IDX category"
```

---

## Task 3: IDX Ticker Store Updates

Add index data headlines to the chyron ticker.

**Files:**

- Modify: `src/lib/stores/tv.ts`
- Create: `src/lib/stores/tv.test.ts`

- [ ] **Step 1: Write tests for IDX ticker items**

```typescript
// src/lib/stores/tv.test.ts
import { describe, it, expect } from 'vitest';
import { buildIdxTickerItems } from './tv';
import type { CompositeData } from '$lib/types/composite';
import type { CoffeeData } from '$lib/types/coffee';
import type { GroceryBasketData } from '$lib/types/grocery';

describe('buildIdxTickerItems', () => {
	it('returns empty array when all data is null', () => {
		const items = buildIdxTickerItems({});
		expect(items).toEqual([]);
	});

	it('builds composite ticker item with Marin Number', () => {
		const composite: CompositeData = {
			current: {
				timestamp: '2026-04-01',
				tiers: [],
				compositeScore: 100,
				marinNumber: { total: 21110, items: [], annualized: 253320 }
			},
			history: []
		};
		const items = buildIdxTickerItems({ composite });
		const marinItem = items.find((i) => i.text.includes('Marin Number'));
		expect(marinItem).toBeDefined();
		expect(marinItem!.badge).toBe('IDX');
		expect(marinItem!.text).toContain('$21,110');
	});

	it('builds cappuccino ticker item with median price', () => {
		const cappuccino: CoffeeData = {
			current: {
				timestamp: '2026-04-01',
				shopCount: 12,
				medianPrice: 5.75,
				avgPrice: 5.8,
				minPrice: 4.5,
				maxPrice: 7.0,
				shops: []
			},
			history: []
		};
		const items = buildIdxTickerItems({ cappuccino });
		const coffeeItem = items.find((i) => i.text.includes('Cappuccino'));
		expect(coffeeItem).toBeDefined();
		expect(coffeeItem!.text).toContain('$5.75');
	});

	it('caps at 5 IDX items', () => {
		const cappuccino: CoffeeData = {
			current: {
				timestamp: '2026-04-01',
				shopCount: 12,
				medianPrice: 5.75,
				avgPrice: 5.8,
				minPrice: 4.5,
				maxPrice: 7.0,
				shops: []
			},
			history: []
		};
		const grocery: GroceryBasketData = {
			current: {
				timestamp: '2026-04-01',
				totalCheapest: 187,
				totalExpensive: 245,
				itemsFound: 12,
				items: []
			},
			history: []
		};
		// Even with many sources, should cap at 5
		const items = buildIdxTickerItems({
			cappuccino,
			grocery,
			composite: {
				current: {
					timestamp: '2026-04-01',
					tiers: [],
					compositeScore: 100,
					marinNumber: { total: 21110, items: [], annualized: 253320 }
				},
				history: []
			}
		});
		expect(items.length).toBeLessThanOrEqual(5);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/stores/tv.test.ts`
Expected: FAIL — `buildIdxTickerItems` not exported yet

- [ ] **Step 3: Implement buildIdxTickerItems and integrate into tvTickerItems**

Add to `src/lib/stores/tv.ts`:

```typescript
import type { CompositeData } from '$lib/types/composite';
import type { CoffeeData } from '$lib/types/coffee';
import type { GroceryBasketData } from '$lib/types/grocery';
import type { WineIndexData } from '$lib/types/wine';
import type { FitnessData } from '$lib/types/fitness';
import type { SchoolIndexData } from '$lib/types/school';
import type { DrivewayData } from '$lib/types/driveway';
import type { GasPriceData } from '$lib/types/gas';

interface IndexDataSources {
	composite?: CompositeData | null;
	cappuccino?: CoffeeData | null;
	grocery?: GroceryBasketData | null;
	wine?: WineIndexData | null;
	fitness?: FitnessData | null;
	tuition?: SchoolIndexData | null;
	driveway?: DrivewayData | null;
	gas?: GasPriceData | null;
}

const MAX_IDX_ITEMS = 5;

function fmt(n: number): string {
	return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtPrice(n: number): string {
	return `$${n.toFixed(2)}`;
}

export function buildIdxTickerItems(sources: IndexDataSources): TickerItem[] {
	const items: TickerItem[] = [];
	const now = Date.now();

	if (sources.composite?.current) {
		const mn = sources.composite.current.marinNumber;
		items.push({
			id: `idx-composite`,
			badge: 'IDX' as TickerCategory,
			category: 'IDX' as TickerCategory,
			text: `The Marin Number: $${fmt(mn.total)}/mo ($${fmt(mn.annualized)}/yr)`,
			timestamp: now,
			status: 'normal'
		});
	}

	if (sources.cappuccino?.current?.medianPrice) {
		items.push({
			id: `idx-cappuccino`,
			badge: 'IDX' as TickerCategory,
			category: 'IDX' as TickerCategory,
			text: `Cappuccino Index: ${fmtPrice(sources.cappuccino.current.medianPrice)} median across ${sources.cappuccino.current.shopCount} shops`,
			timestamp: now,
			status: 'normal'
		});
	}

	if (sources.grocery?.current?.totalCheapest) {
		items.push({
			id: `idx-grocery`,
			badge: 'IDX' as TickerCategory,
			category: 'IDX' as TickerCategory,
			text: `Grocery Basket: ${fmtPrice(sources.grocery.current.totalCheapest)} for ${sources.grocery.current.itemsFound} items`,
			timestamp: now,
			status: 'normal'
		});
	}

	if (sources.wine?.current?.categories?.length) {
		const napa = sources.wine.current.categories.find((c) => c.category === 'napa-sonoma');
		if (napa?.medianPrice) {
			items.push({
				id: `idx-wine`,
				badge: 'IDX' as TickerCategory,
				category: 'IDX' as TickerCategory,
				text: `Wine Index: Napa/Sonoma Cab median ${fmtPrice(napa.medianPrice)}`,
				timestamp: now,
				status: 'normal'
			});
		}
	}

	if (sources.gas?.current?.avgRegular) {
		items.push({
			id: `idx-gas`,
			badge: 'IDX' as TickerCategory,
			category: 'IDX' as TickerCategory,
			text: `Gas: ${fmtPrice(sources.gas.current.avgRegular)} avg regular across ${sources.gas.current.stationCount} stations`,
			timestamp: now,
			status: 'normal'
		});
	}

	if (sources.tuition?.current) {
		items.push({
			id: `idx-tuition`,
			badge: 'IDX' as TickerCategory,
			category: 'IDX' as TickerCategory,
			text: `Private School K-12: $${fmt(sources.tuition.current.cumulativeK12)} cumulative`,
			timestamp: now,
			status: 'normal'
		});
	}

	if (sources.driveway?.current) {
		const evEntry = sources.driveway.current.fuelBreakdown.find(
			(f) => f.fuelType === 'battery-electric'
		);
		if (evEntry) {
			items.push({
				id: `idx-driveway`,
				badge: 'IDX' as TickerCategory,
				category: 'IDX' as TickerCategory,
				text: `Marin EV share: ${evEntry.pct.toFixed(1)}% — ${fmt(sources.driveway.current.funStats.hydrogen)} hydrogen fuel cells`,
				timestamp: now,
				status: 'normal'
			});
		}
	}

	if (sources.fitness?.current?.medianPrice) {
		items.push({
			id: `idx-fitness`,
			badge: 'IDX' as TickerCategory,
			category: 'IDX' as TickerCategory,
			text: `Fitness Drop-in: ${fmtPrice(sources.fitness.current.medianPrice)} median across ${sources.fitness.current.studioCount} studios`,
			timestamp: now,
			status: 'normal'
		});
	}

	// Rotate: use minute-of-hour to offset which items we pick
	const offset = new Date().getMinutes() % Math.max(1, items.length);
	const rotated = [...items.slice(offset), ...items.slice(0, offset)];
	return rotated.slice(0, MAX_IDX_ITEMS);
}
```

The existing `tvTickerItems` derived store needs to accept index data and append IDX items. Since `tvTickerItems` is a derived store that reads from Svelte stores, and index data will be passed from TvWallboard via a writable store, add a new writable store:

```typescript
import { writable } from 'svelte/store';

export const tvIndexData = writable<IndexDataSources>({});
```

Then in the existing `tvTickerItems` derived store, append IDX items:

```typescript
// At the end of the existing tvTickerItems derivation, before the fallback:
const idxSources = get(tvIndexData);
const idxItems = buildIdxTickerItems(idxSources);
items.push(...idxItems);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/tammypais/projects/marin-monitor && npx vitest run src/lib/stores/tv.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Run full test suite**

Run: `cd /Users/tammypais/projects/marin-monitor && npm run test:unit`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
cd /Users/tammypais/projects/marin-monitor
git add src/lib/stores/tv.ts src/lib/stores/tv.test.ts
git commit -m "feat(tv): add IDX ticker category with index data headlines in chyron"
```

---

## Task 4: Migrate Existing Screens from TvAutoScroll to TvScroller

Swap all existing TvAutoScroll usage to TvScroller.

**Files:**

- Modify: `src/lib/components/tv/screens/NewsWireScreen.svelte`
- Modify: `src/lib/components/tv/screens/SafetyScreen.svelte`
- Modify: `src/lib/components/tv/screens/TvCommunityScreen.svelte`
- Modify: `src/lib/components/tv/screens/TvLeaderboardsScreen.svelte`
- Delete: `src/lib/components/tv/TvAutoScroll.svelte`

- [ ] **Step 1: Add `screenId` and `active` props to TvScreen wrapper**

The TvScreen wrapper component needs to pass `active` status down. Currently it conditionally renders via `{#if active}`. Each screen inside needs to receive `screenId` for TvScroller. The simplest approach: pass `screenId` as a prop directly to each screen component, and `active` (which TvScreen already has).

Update each screen to accept and forward these props to TvScroller.

- [ ] **Step 2: Migrate NewsWireScreen**

In `src/lib/components/tv/screens/NewsWireScreen.svelte`:

Replace the TvAutoScroll import and usage:

```svelte
<!-- Before -->
<script lang="ts">
	import TvAutoScroll from '../TvAutoScroll.svelte';
	// ...
</script>
<TvAutoScroll>
	<!-- grid content -->
</TvAutoScroll>

<!-- After -->
<script lang="ts">
	import TvScroller from '../TvScroller.svelte';

	interface Props {
		active?: boolean;
	}

	let { active = true }: Props = $props();
	// ... existing derived data
</script>
<TvScroller screenId="news-wire" {active}>
	<!-- same grid content -->
</TvScroller>
```

- [ ] **Step 3: Migrate SafetyScreen**

Same pattern in `src/lib/components/tv/screens/SafetyScreen.svelte`:

Replace `TvAutoScroll` with `TvScroller`, add `active` prop, use `screenId="safety"`.

- [ ] **Step 4: Migrate TvCommunityScreen**

Same pattern in `src/lib/components/tv/screens/TvCommunityScreen.svelte`:

Replace `TvAutoScroll` with `TvScroller`, add `active` prop, use `screenId="community"`.

- [ ] **Step 5: Migrate TvLeaderboardsScreen**

This screen has **two** TvAutoScroll instances (cycling and running columns). Replace both:

```svelte
<!-- Before -->
<TvAutoScroll speed={12}>
	<!-- cycling column -->
</TvAutoScroll>
<TvAutoScroll speed={12}>
	<!-- running column -->
</TvAutoScroll>

<!-- After -->
<TvScroller screenId="leaderboards-cycling" {active} speed={12}>
	<!-- cycling column -->
</TvScroller>
<TvScroller screenId="leaderboards-running" {active} speed={12}>
	<!-- running column -->
</TvScroller>
```

Add `active` prop to TvLeaderboardsScreen.

- [ ] **Step 6: Update TvWallboard to pass `active` prop to each screen**

In `src/lib/components/tv/TvWallboard.svelte`, where screens are rendered inside `<TvScreen>`, pass `active` to child screen components. This requires threading the active state. The cleanest approach: each screen component receives `active` directly.

Look at the current rendering pattern:

```svelte
<TvScreen active={carouselIdx === i}>
	<NewsWireScreen />
</TvScreen>
```

Change to:

```svelte
<TvScreen active={carouselIdx === i}>
	<NewsWireScreen active={carouselIdx === i} />
</TvScreen>
```

Apply this to all 4 migrated screens.

- [ ] **Step 7: Delete TvAutoScroll.svelte**

```bash
rm src/lib/components/tv/TvAutoScroll.svelte
```

Verify no remaining imports:

```bash
grep -r "TvAutoScroll" src/ --include="*.svelte" --include="*.ts"
```

Expected: No results

- [ ] **Step 8: Run TypeScript check**

Run: `cd /Users/tammypais/projects/marin-monitor && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -5`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
cd /Users/tammypais/projects/marin-monitor
git add -A src/lib/components/tv/
git commit -m "refactor(tv): migrate all screens from TvAutoScroll to TvScroller

Replaces CSS animation scroll with JS rAF-driven scroll.
Scroll position now persists across carousel cycles."
```

---

## Task 5: Cost of Being Marin Hero Screen

**Files:**

- Create: `src/lib/components/tv/screens/TvCompositeHero.svelte`

- [ ] **Step 1: Create the composite hero screen**

```svelte
<!-- src/lib/components/tv/screens/TvCompositeHero.svelte -->
<script lang="ts">
	import type { CompositeData } from '$lib/types/composite';

	interface Props {
		data: CompositeData | null;
	}

	let { data }: Props = $props();

	const snapshot = $derived(data?.current);
	const marinNumber = $derived(snapshot?.marinNumber);
	const tiers = $derived(snapshot?.tiers ?? []);

	function fmt(n: number): string {
		return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
	}

	function fmtPrice(n: number): string {
		return `$${fmt(n)}`;
	}

	const tierLabels: Record<string, string> = {
		'daily-life': 'Daily Life',
		lifestyle: 'Lifestyle',
		housing: 'Housing',
		structural: 'Structural'
	};
</script>

{#if snapshot && marinNumber}
	<div class="flex h-full flex-col items-center justify-center gap-8 px-12 py-8">
		<!-- Title -->
		<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Cost of Being Marin</h2>

		<!-- Hero Number -->
		<div class="text-center">
			<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">The Marin Number</div>
			<div class="mt-2 text-7xl font-bold tabular-nums text-white">
				{fmtPrice(marinNumber.total)}
			</div>
			<div class="mt-1 text-2xl font-light text-zinc-400">per month</div>
			<div class="mt-2 text-xl tabular-nums text-zinc-500">
				{fmtPrice(marinNumber.annualized)} / year
			</div>
		</div>

		<!-- Tier Cards -->
		<div class="flex w-full max-w-4xl gap-4">
			{#each tiers as tier}
				<div class="flex-1 rounded-lg bg-zinc-800/60 p-4 text-center">
					<div class="text-xs font-medium uppercase tracking-wider text-zinc-500">
						{tierLabels[tier.category] ?? tier.label}
					</div>
					<div class="mt-2 text-2xl font-semibold tabular-nums text-white">
						{fmtPrice(tier.monthlyTotal)}
					</div>
				</div>
			{/each}
		</div>

		<!-- Sub-index summary strip -->
		<div class="flex flex-wrap justify-center gap-x-6 gap-y-1 text-sm text-zinc-500">
			{#each marinNumber.items.slice(0, 8) as item}
				<span>
					<span class="text-zinc-400">{item.label}</span>
					{fmtPrice(item.monthly)}
				</span>
			{/each}
		</div>
	</div>
{:else}
	<div class="flex h-full items-center justify-center text-zinc-600">Loading cost data...</div>
{/if}
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd /Users/tammypais/projects/marin-monitor && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -i 'TvCompositeHero'`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/tammypais/projects/marin-monitor
git add src/lib/components/tv/screens/TvCompositeHero.svelte
git commit -m "feat(tv): add Cost of Being Marin composite hero screen"
```

---

## Task 6: Index Card Screens

Build the four index data card screens.

**Files:**

- Create: `src/lib/components/tv/screens/TvDailyLifeCard.svelte`
- Create: `src/lib/components/tv/screens/TvLifestyleCard.svelte`
- Create: `src/lib/components/tv/screens/TvStructuralCard.svelte`
- Create: `src/lib/components/tv/screens/TvDrivewayCard.svelte`

- [ ] **Step 1: Create TvDailyLifeCard (Coffee + Grocery + Gas)**

```svelte
<!-- src/lib/components/tv/screens/TvDailyLifeCard.svelte -->
<script lang="ts">
	import type { CoffeeData } from '$lib/types/coffee';
	import type { GroceryBasketData } from '$lib/types/grocery';
	import type { GasPriceData } from '$lib/types/gas';

	interface Props {
		cappuccino: CoffeeData | null;
		grocery: GroceryBasketData | null;
		gas: GasPriceData | null;
	}

	let { cappuccino, grocery, gas }: Props = $props();

	function fmtPrice(n: number | null | undefined): string {
		if (n == null) return '—';
		return `$${n.toFixed(2)}`;
	}
</script>

<div class="flex h-full flex-col px-12 py-8">
	<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Daily Life</h2>

	<div class="mt-6 grid flex-1 grid-cols-3 gap-6">
		<!-- Cappuccino -->
		<div class="flex flex-col items-center justify-center rounded-xl bg-zinc-800/60 p-6">
			<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">Cappuccino</div>
			<div class="mt-3 text-5xl font-bold tabular-nums text-white">
				{fmtPrice(cappuccino?.current?.medianPrice)}
			</div>
			<div class="mt-2 text-sm text-zinc-500">
				median across {cappuccino?.current?.shopCount ?? 0} shops
			</div>
		</div>

		<!-- Grocery Basket -->
		<div class="flex flex-col items-center justify-center rounded-xl bg-zinc-800/60 p-6">
			<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">Grocery Basket</div>
			<div class="mt-3 text-5xl font-bold tabular-nums text-white">
				{fmtPrice(grocery?.current?.totalCheapest)}
			</div>
			<div class="mt-2 text-sm text-zinc-500">
				{grocery?.current?.itemsFound ?? 0} items, cheapest options
			</div>
		</div>

		<!-- Gas -->
		<div class="flex flex-col items-center justify-center rounded-xl bg-zinc-800/60 p-6">
			<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">Gas (Regular)</div>
			<div class="mt-3 text-5xl font-bold tabular-nums text-white">
				{fmtPrice(gas?.current?.avgRegular)}
			</div>
			<div class="mt-2 text-sm text-zinc-500">
				avg across {gas?.current?.stationCount ?? 0} stations
			</div>
		</div>
	</div>
</div>
```

- [ ] **Step 2: Create TvLifestyleCard (Wine + Fitness)**

```svelte
<!-- src/lib/components/tv/screens/TvLifestyleCard.svelte -->
<script lang="ts">
	import type { WineIndexData } from '$lib/types/wine';
	import type { FitnessData } from '$lib/types/fitness';
	import type { FitnessType } from '$lib/types/fitness';

	interface Props {
		wine: WineIndexData | null;
		fitness: FitnessData | null;
	}

	let { wine, fitness }: Props = $props();

	const categories = $derived(wine?.current?.categories ?? []);

	const categoryLabels: Record<string, string> = {
		'napa-sonoma': 'Napa/Sonoma Cab',
		burgundy: 'Burgundy',
		champagne: 'Champagne'
	};

	const fitnessLabels: Record<FitnessType, string> = {
		yoga: 'Yoga',
		pilates: 'Pilates',
		cycling: 'Cycling',
		crossfit: 'CrossFit',
		hiit: 'HIIT'
	};

	const fitnessTypes: FitnessType[] = ['yoga', 'pilates', 'cycling', 'crossfit', 'hiit'];

	function fmtPrice(n: number | null | undefined): string {
		if (n == null) return '—';
		return `$${n.toFixed(0)}`;
	}
</script>

<div class="flex h-full flex-col px-12 py-8">
	<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Lifestyle</h2>

	<div class="mt-6 grid flex-1 grid-cols-2 gap-6">
		<!-- Wine Index -->
		<div class="flex flex-col rounded-xl bg-zinc-800/60 p-6">
			<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">Wine Index</div>
			<div class="mt-4 flex flex-1 flex-col justify-center gap-4">
				{#each categories as cat}
					<div class="flex items-baseline justify-between">
						<span class="text-lg text-zinc-300">{categoryLabels[cat.category] ?? cat.label}</span>
						<span class="text-2xl font-semibold tabular-nums text-white">
							{fmtPrice(cat.medianPrice)}
						</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Fitness Drop-in -->
		<div class="flex flex-col rounded-xl bg-zinc-800/60 p-6">
			<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">Fitness Drop-in</div>
			<div class="mt-4 flex flex-1 flex-col justify-center gap-4">
				{#each fitnessTypes as type}
					{@const median = fitness?.current?.medianByType?.[type]}
					{#if median}
						<div class="flex items-baseline justify-between">
							<span class="text-lg text-zinc-300">{fitnessLabels[type]}</span>
							<span class="text-2xl font-semibold tabular-nums text-white">
								{fmtPrice(median)}
							</span>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	</div>
</div>
```

- [ ] **Step 3: Create TvStructuralCard (Tuition + Housing)**

```svelte
<!-- src/lib/components/tv/screens/TvStructuralCard.svelte -->
<script lang="ts">
	import type { SchoolIndexData } from '$lib/types/school';

	interface Props {
		tuition: SchoolIndexData | null;
	}

	let { tuition }: Props = $props();

	const tiers = $derived(tuition?.current?.tiers ?? []);
	const cumulative = $derived(tuition?.current?.cumulativeK12 ?? 0);

	function fmt(n: number): string {
		if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
		return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
	}
</script>

<div class="flex h-full flex-col px-12 py-8">
	<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Structural Marin</h2>

	<div class="mt-6 grid flex-1 grid-cols-2 gap-6">
		<!-- School Tuition -->
		<div class="flex flex-col rounded-xl bg-zinc-800/60 p-6">
			<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">
				Private School Tuition
			</div>
			<div class="mt-4 flex flex-1 flex-col justify-center gap-4">
				{#each tiers as tier}
					<div class="flex items-baseline justify-between">
						<span class="text-lg text-zinc-300">{tier.label}</span>
						<span class="text-2xl font-semibold tabular-nums text-white">
							{fmt(tier.avgTuition)}
						</span>
					</div>
				{/each}
				<div class="mt-2 border-t border-zinc-700 pt-3">
					<div class="flex items-baseline justify-between">
						<span class="text-lg font-medium text-zinc-300">K-12 Total</span>
						<span class="text-3xl font-bold tabular-nums text-white">
							${(cumulative / 1000).toFixed(0)}K
						</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Housing (from existing housing data — median home price, rental data) -->
		<div class="flex flex-col items-center justify-center rounded-xl bg-zinc-800/60 p-6">
			<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">Housing</div>
			<div class="mt-3 text-lg text-zinc-500">County-level data</div>
			<div class="mt-1 text-sm text-zinc-600">Redfin county tracker — no per-town breakdown</div>
		</div>
	</div>
</div>
```

- [ ] **Step 4: Create TvDrivewayCard (Vehicle Registration)**

```svelte
<!-- src/lib/components/tv/screens/TvDrivewayCard.svelte -->
<script lang="ts">
	import type { DrivewayData } from '$lib/types/driveway';

	interface Props {
		data: DrivewayData | null;
	}

	let { data }: Props = $props();

	const snapshot = $derived(data?.current);
	const topMakes = $derived(snapshot?.topMakes?.slice(0, 6) ?? []);
	const fuelBreakdown = $derived(snapshot?.fuelBreakdown ?? []);
	const funStats = $derived(snapshot?.funStats);

	function fmt(n: number): string {
		return n.toLocaleString('en-US');
	}
</script>

{#if snapshot}
	<div class="flex h-full flex-col px-12 py-8">
		<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">The Marin Driveway</h2>

		<div class="mt-6 grid flex-1 grid-cols-2 gap-6">
			<!-- Top Makes -->
			<div class="flex flex-col rounded-xl bg-zinc-800/60 p-6">
				<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">Top Makes</div>
				<div class="mt-4 flex flex-1 flex-col justify-center gap-3">
					{#each topMakes as make, i}
						<div class="flex items-baseline justify-between">
							<span class="text-lg text-zinc-300">
								<span class="text-zinc-500">#{i + 1}</span>
								{make.make}
							</span>
							<span class="text-xl tabular-nums text-white">{fmt(make.count)}</span>
						</div>
					{/each}
				</div>
			</div>

			<!-- Fuel & Fun Stats -->
			<div class="flex flex-col rounded-xl bg-zinc-800/60 p-6">
				<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">Fuel Breakdown</div>
				<div class="mt-4 flex flex-1 flex-col justify-center gap-3">
					{#each fuelBreakdown.filter((f) => f.pct >= 1.0) as fuel}
						<div class="flex items-baseline justify-between">
							<span class="text-lg capitalize text-zinc-300">
								{fuel.fuelType.replace(/-/g, ' ')}
							</span>
							<span class="text-xl tabular-nums text-white">{fuel.pct.toFixed(1)}%</span>
						</div>
					{/each}
					{#if funStats}
						<div class="mt-3 border-t border-zinc-700 pt-3 text-sm text-zinc-500">
							{fmt(funStats.tesla)} Teslas · {fmt(funStats.hydrogen)} hydrogen ·
							{fmt(funStats.lucid)} Lucids
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{:else}
	<div class="flex h-full items-center justify-center text-zinc-600">Loading driveway data...</div>
{/if}
```

- [ ] **Step 5: Run TypeScript check on all new cards**

Run: `cd /Users/tammypais/projects/marin-monitor && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -E '(Error|TvDailyLife|TvLifestyle|TvStructural|TvDriveway)' | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
cd /Users/tammypais/projects/marin-monitor
git add src/lib/components/tv/screens/TvDailyLifeCard.svelte src/lib/components/tv/screens/TvLifestyleCard.svelte src/lib/components/tv/screens/TvStructuralCard.svelte src/lib/components/tv/screens/TvDrivewayCard.svelte
git commit -m "feat(tv): add index card screens (daily life, lifestyle, structural, driveway)"
```

---

## Task 7: 311 Photo Wall Hero Screen

**Files:**

- Create: `src/lib/components/tv/screens/Tv311PhotoWall.svelte`

- [ ] **Step 1: Create the photo wall screen**

```svelte
<!-- src/lib/components/tv/screens/Tv311PhotoWall.svelte -->
<script lang="ts">
	import TvScroller from '../TvScroller.svelte';
	import type { NewsItem } from '$lib/types';

	interface Props {
		items: NewsItem[];
		active?: boolean;
	}

	let { items, active = true }: Props = $props();

	// Only items with photos
	const photoItems = $derived(items.filter((i) => i.imageUrl));
	const photoCount = $derived(photoItems.length);

	// Responsive columns based on photo count
	const colClass = $derived(
		photoCount < 3
			? 'grid-cols-1 max-w-lg mx-auto'
			: photoCount < 6
				? 'grid-cols-2 max-w-3xl mx-auto'
				: 'grid-cols-3'
	);

	function timeAgo(ts: number): string {
		const diffMs = Date.now() - ts;
		const hours = Math.floor(diffMs / 3_600_000);
		if (hours < 1) return 'just now';
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		return `${days}d ago`;
	}

	function extractStreet(item: NewsItem): string {
		// Title format is typically "Category · Street Name"
		const parts = item.title.split('·');
		return parts.length > 1 ? parts[1].trim() : (item.town ?? '');
	}

	function extractCategory(item: NewsItem): string {
		const parts = item.title.split('·');
		return parts[0].trim();
	}
</script>

{#if photoCount === 0}
	<!-- Skip: no photos available. TvWallboard should skip this screen. -->
	<div class="flex h-full items-center justify-center text-zinc-600">No 311 photos available</div>
{:else}
	<div class="flex h-full flex-col px-8 py-6">
		<!-- Header -->
		<div class="mb-4 flex items-baseline justify-between">
			<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Fix It Marin</h2>
			<span class="text-sm text-zinc-500">{photoCount} complaints with photos</span>
		</div>

		<!-- Scrolling photo grid -->
		<div class="flex-1 overflow-hidden">
			<TvScroller screenId="311-photos" {active} speed={25}>
				<div class="grid {colClass} gap-4 pb-8">
					{#each photoItems as item (item.id)}
						<div class="overflow-hidden rounded-lg bg-zinc-800/60">
							<img
								src={item.imageUrl}
								alt={item.title}
								class="aspect-[4/3] w-full object-cover"
								loading="lazy"
							/>
							<div class="p-3">
								<div class="text-sm font-medium text-white">
									{extractCategory(item)}
								</div>
								<div class="mt-0.5 text-xs text-zinc-400">
									{extractStreet(item)}
									{#if item.town}
										· {item.town}
									{/if}
								</div>
								<div class="mt-0.5 text-xs text-zinc-500">
									{timeAgo(item.timestamp)}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</TvScroller>
		</div>
	</div>
{/if}
```

- [ ] **Step 2: Run TypeScript check**

Run: `cd /Users/tammypais/projects/marin-monitor && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -i '311PhotoWall'`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/tammypais/projects/marin-monitor
git add src/lib/components/tv/screens/Tv311PhotoWall.svelte
git commit -m "feat(tv): add 311 Photo Wall hero screen (Wall of Grievances)"
```

---

## Task 8: Conditions Split (TvConditionsCard + TvOutdoorsCard)

Split the old grab-bag TvConditionsScreen into two focused cards.

**Files:**

- Create: `src/lib/components/tv/screens/TvConditionsCard.svelte`
- Create: `src/lib/components/tv/screens/TvOutdoorsCard.svelte`
- Delete: `src/lib/components/tv/screens/TvConditionsScreen.svelte`

- [ ] **Step 1: Examine what data TvConditionsScreen currently uses**

Read `src/lib/components/tv/screens/TvConditionsScreen.svelte` to identify which stores/components it imports (EnvironmentPanel, TidesPanel, ConditionsPanel). Note what data each sub-panel uses so we can split appropriately.

- [ ] **Step 2: Create TvConditionsCard (Weather + AQI + Tides)**

```svelte
<!-- src/lib/components/tv/screens/TvConditionsCard.svelte -->
<script lang="ts">
	import { alerts as alertsStore } from '$stores/news';

	interface WeatherData {
		temp: number | null;
		wind: string | null;
		shortForecast: string | null;
		highTemp?: number | null;
		lowTemp?: number | null;
	}

	interface TidePoint {
		time: string;
		height: number;
		type: 'H' | 'L';
	}

	interface Props {
		weather: WeatherData | null;
		aqi: { value: number; category: string } | null;
		tides: TidePoint[];
	}

	let { weather, aqi, tides }: Props = $props();

	const nextTides = $derived(tides.slice(0, 4));

	function aqiColor(value: number): string {
		if (value <= 50) return 'text-green-400';
		if (value <= 100) return 'text-yellow-400';
		if (value <= 150) return 'text-orange-400';
		return 'text-red-400';
	}

	function formatTideTime(iso: string): string {
		return new Date(iso).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: 'America/Los_Angeles'
		});
	}
</script>

<div class="flex h-full flex-col px-12 py-8">
	<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Conditions</h2>

	<div class="mt-6 grid flex-1 grid-cols-3 gap-6">
		<!-- Weather -->
		<div class="flex flex-col items-center justify-center rounded-xl bg-zinc-800/60 p-6">
			<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">Weather</div>
			{#if weather}
				<div class="mt-3 text-5xl font-bold tabular-nums text-white">{weather.temp}°F</div>
				<div class="mt-2 text-sm text-zinc-400">{weather.shortForecast}</div>
				{#if weather.wind}
					<div class="mt-1 text-sm text-zinc-500">Wind: {weather.wind}</div>
				{/if}
			{:else}
				<div class="mt-3 text-zinc-600">—</div>
			{/if}
		</div>

		<!-- AQI -->
		<div class="flex flex-col items-center justify-center rounded-xl bg-zinc-800/60 p-6">
			<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">Air Quality</div>
			{#if aqi}
				<div class="mt-3 text-5xl font-bold tabular-nums {aqiColor(aqi.value)}">{aqi.value}</div>
				<div class="mt-2 text-sm text-zinc-400">{aqi.category}</div>
			{:else}
				<div class="mt-3 text-zinc-600">—</div>
			{/if}
		</div>

		<!-- Tides -->
		<div class="flex flex-col rounded-xl bg-zinc-800/60 p-6">
			<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">Tides</div>
			<div class="mt-4 flex flex-1 flex-col justify-center gap-3">
				{#each nextTides as tide}
					<div class="flex items-baseline justify-between">
						<span class="text-sm text-zinc-400">
							{tide.type === 'H' ? 'High' : 'Low'}
							{formatTideTime(tide.time)}
						</span>
						<span class="text-lg tabular-nums text-white">{tide.height.toFixed(1)} ft</span>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
```

- [ ] **Step 3: Create TvOutdoorsCard (Surf + Dirt + Streams)**

```svelte
<!-- src/lib/components/tv/screens/TvOutdoorsCard.svelte -->
<script lang="ts">
	interface SurfSpot {
		name: string;
		height: string;
		conditions: string;
	}

	interface StreamGauge {
		name: string;
		cfs: number;
		trend: 'rising' | 'falling' | 'stable';
	}

	interface DirtStatus {
		condition: string;
		lastRain: string;
	}

	interface Props {
		surf: SurfSpot[];
		dirt: DirtStatus | null;
		streams: StreamGauge[];
	}

	let { surf, dirt, streams }: Props = $props();

	function trendArrow(trend: string): string {
		if (trend === 'rising') return '\u2191';
		if (trend === 'falling') return '\u2193';
		return '\u2192';
	}
</script>

<div class="flex h-full flex-col px-12 py-8">
	<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Outdoors</h2>

	<div class="mt-6 grid flex-1 grid-cols-3 gap-6">
		<!-- Surf -->
		<div class="flex flex-col rounded-xl bg-zinc-800/60 p-6">
			<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">Surf Report</div>
			<div class="mt-4 flex flex-1 flex-col justify-center gap-4">
				{#each surf as spot}
					<div>
						<div class="text-lg text-zinc-300">{spot.name}</div>
						<div class="text-2xl font-semibold text-white">{spot.height}</div>
						<div class="text-sm text-zinc-500">{spot.conditions}</div>
					</div>
				{/each}
				{#if surf.length === 0}
					<div class="text-zinc-600">No surf data</div>
				{/if}
			</div>
		</div>

		<!-- Hero Dirt -->
		<div class="flex flex-col items-center justify-center rounded-xl bg-zinc-800/60 p-6">
			<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">
				Hero Dirt Tracker
			</div>
			{#if dirt}
				<div class="mt-3 text-3xl font-bold text-white">{dirt.condition}</div>
				<div class="mt-2 text-sm text-zinc-500">Last rain: {dirt.lastRain}</div>
			{:else}
				<div class="mt-3 text-zinc-600">—</div>
			{/if}
		</div>

		<!-- Streams -->
		<div class="flex flex-col rounded-xl bg-zinc-800/60 p-6">
			<div class="text-sm font-medium uppercase tracking-wider text-zinc-500">Streams</div>
			<div class="mt-4 flex flex-1 flex-col justify-center gap-3">
				{#each streams.slice(0, 4) as gauge}
					<div class="flex items-baseline justify-between">
						<span class="text-sm text-zinc-300">{gauge.name}</span>
						<span class="text-lg tabular-nums text-white">
							{gauge.cfs} cfs
							<span class="text-sm text-zinc-500">{trendArrow(gauge.trend)}</span>
						</span>
					</div>
				{/each}
				{#if streams.length === 0}
					<div class="text-zinc-600">No stream data</div>
				{/if}
			</div>
		</div>
	</div>
</div>
```

- [ ] **Step 4: Delete the old TvConditionsScreen**

```bash
rm src/lib/components/tv/screens/TvConditionsScreen.svelte
```

- [ ] **Step 5: Run TypeScript check**

Run: `cd /Users/tammypais/projects/marin-monitor && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -E '(Error|Conditions|Outdoors)' | head -20`
Expected: Errors in TvWallboard.svelte referencing TvConditionsScreen — this will be fixed in Task 10 (TvWallboard integration). For now, note the expected breakage.

- [ ] **Step 6: Commit**

```bash
cd /Users/tammypais/projects/marin-monitor
git add src/lib/components/tv/screens/TvConditionsCard.svelte src/lib/components/tv/screens/TvOutdoorsCard.svelte
git rm src/lib/components/tv/screens/TvConditionsScreen.svelte
git commit -m "feat(tv): split conditions screen into focused Conditions + Outdoors cards"
```

---

## Task 9: Map Overlay Integration

Add data overlay pins to each map region screen.

**Files:**

- Modify: `src/lib/components/tv/screens/TvMapScreen.svelte`

- [ ] **Step 1: Read current TvMapScreen implementation**

Read `src/lib/components/tv/screens/TvMapScreen.svelte` to understand the current props and rendering. Also check how MapDataLayer renders existing earthquake/fire pins — we'll follow the same pattern.

- [ ] **Step 2: Extend TvMapScreen props for overlay data**

Add new props to TvMapScreen for the index data that has lat/lon coordinates:

```typescript
interface Props {
	// existing
	earthquakeItems: NewsItem[];
	fireIncidents: FireIncident[];
	viewId: string;
	weather: { temp: number; wind: string; shortForecast: string } | null;
	// new overlay data
	threeOneOneItems?: NewsItem[];
	coffeeShops?: Array<{ lat: number; lon: number; name: string; price: number | null }>;
	gasStations?: Array<{ lat: number; lon: number; name: string; price: number | null }>;
	fitnessStudios?: Array<{ lat: number; lon: number; name: string; type: string; price: number }>;
	evStations?: Array<{ lat: number; lon: number; name: string }>;
}
```

- [ ] **Step 3: Define which overlays show per region**

Add a config mapping in TvMapScreen that determines which overlays display per `viewId`:

```typescript
const REGION_OVERLAYS: Record<string, string[]> = {
	county: ['311', 'alerts'],
	south: ['coffee', 'gas'],
	central: ['fitness', 'ev'],
	north: ['gas', 'news'],
	west: ['surf', 'trails']
};
```

- [ ] **Step 4: Render overlay markers**

For the initial implementation, use MapLibre's built-in marker system or an additional source/layer. The simplest TV-friendly approach is to add HTML markers (divs) positioned over the map using MapLibre's `map.project()` to convert lat/lon to screen coordinates. However, this is expensive for many markers.

A more performant approach: add GeoJSON source + symbol layer per overlay type. This integrates with MapLibre's existing rendering pipeline.

The implementation will depend on the patterns already used by MapDataLayer. Follow the same pattern (likely GeoJSON source + circle/symbol layers). Add overlay sources when the viewId changes, remove them when switching to a different view.

**Note to implementer:** Read MapDataLayer's implementation to understand the exact pattern (source + layer add/remove lifecycle). The overlay implementation should follow this pattern exactly. Each overlay type gets its own source ID and layer ID, added/removed based on the active `viewId` and `REGION_OVERLAYS` config.

For TV readability, markers should be large and legible:

- 311 photos: Circle markers with photo thumbnails (if MapLibre supports image icons) or colored dots
- Price pins: Symbol layer with text labels ("$5.75") — use large font size for TV
- Status dots: Simple circle layers with color coding

- [ ] **Step 5: Run TypeScript check**

Run: `cd /Users/tammypais/projects/marin-monitor && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -i 'TvMapScreen'`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
cd /Users/tammypais/projects/marin-monitor
git add src/lib/components/tv/screens/TvMapScreen.svelte
git commit -m "feat(tv): add data overlay layers to map screens per region"
```

---

## Task 10: TvWallboard Integration

Wire all new screens, index data loading, and variable durations into the carousel controller.

**Files:**

- Modify: `src/lib/components/tv/TvWallboard.svelte`
- Modify: `src/lib/components/tv/TvWallboardHeader.svelte`

- [ ] **Step 1: Read current TvWallboard implementation**

Read `src/lib/components/tv/TvWallboard.svelte` fully. Note:

- How screens are currently rendered (the `{#each TV_SCREENS}` block)
- How data is loaded in `handleRefresh()`
- How persistent vs ephemeral screens are handled
- The carousel timing logic

- [ ] **Step 2: Add index data state variables**

Add state for all index data in TvWallboard:

```typescript
import { fetchCompositeData } from '$lib/api/marin/composite';
import { fetchCappuccinoData } from '$lib/api/marin/cappuccino';
import { fetchGroceryBasketData } from '$lib/api/marin/grocery-basket';
import { fetchWineIndexData } from '$lib/api/marin/wine-index';
import { fetchFitnessData } from '$lib/api/marin/fitness';
import { fetchSchoolTuitionData } from '$lib/api/marin/school-tuition';
import { fetchDrivewayData } from '$lib/api/marin/driveway';
import { fetchGasPriceData } from '$lib/api/marin/gas-prices';
import { tvIndexData } from '$lib/stores/tv';

import type { CompositeData } from '$lib/types/composite';
import type { CoffeeData } from '$lib/types/coffee';
import type { GroceryBasketData } from '$lib/types/grocery';
import type { WineIndexData } from '$lib/types/wine';
import type { FitnessData } from '$lib/types/fitness';
import type { SchoolIndexData } from '$lib/types/school';
import type { DrivewayData } from '$lib/types/driveway';
import type { GasPriceData } from '$lib/types/gas';

let compositeData = $state<CompositeData | null>(null);
let cappuccinoData = $state<CoffeeData | null>(null);
let groceryData = $state<GroceryBasketData | null>(null);
let wineData = $state<WineIndexData | null>(null);
let fitnessData = $state<FitnessData | null>(null);
let tuitionData = $state<SchoolIndexData | null>(null);
let drivewayData = $state<DrivewayData | null>(null);
let gasData = $state<GasPriceData | null>(null);
```

- [ ] **Step 3: Add index data loading to handleRefresh**

In the existing `handleRefresh()` function, add index data fetches to the `Promise.all()`:

```typescript
async function loadIndexData(): Promise<void> {
	const [composite, cappuccino, grocery, wine, fitness, tuition, driveway, gas] = await Promise.all(
		[
			fetchCompositeData().catch(() => null),
			fetchCappuccinoData().catch(() => null),
			fetchGroceryBasketData().catch(() => null),
			fetchWineIndexData().catch(() => null),
			fetchFitnessData().catch(() => null),
			fetchSchoolTuitionData().catch(() => null),
			fetchDrivewayData().catch(() => null),
			fetchGasPriceData().catch(() => null)
		]
	);

	compositeData = composite;
	cappuccinoData = cappuccino;
	groceryData = grocery;
	wineData = wine;
	fitnessData = fitness;
	tuitionData = tuition;
	drivewayData = driveway;
	gasData = gas;

	// Update ticker store with index data
	tvIndexData.set({ composite, cappuccino, grocery, wine, fitness, tuition, driveway, gas });
}
```

Add `loadIndexData()` to the existing `Promise.all()` in `handleRefresh()`.

- [ ] **Step 4: Import and render all new screen components**

Import all new screen components:

```typescript
import TvCompositeHero from './screens/TvCompositeHero.svelte';
import TvDailyLifeCard from './screens/TvDailyLifeCard.svelte';
import TvLifestyleCard from './screens/TvLifestyleCard.svelte';
import TvStructuralCard from './screens/TvStructuralCard.svelte';
import TvDrivewayCard from './screens/TvDrivewayCard.svelte';
import Tv311PhotoWall from './screens/Tv311PhotoWall.svelte';
import TvConditionsCard from './screens/TvConditionsCard.svelte';
import TvOutdoorsCard from './screens/TvOutdoorsCard.svelte';
```

Remove import of the deleted `TvConditionsScreen`.

In the screen rendering section, update the `{#each TV_SCREENS}` block to handle all 20 screens. The rendering uses screen IDs to determine which component to show:

```svelte
{#each TV_SCREENS as screen, i (screen.id)}
	{#if !screen.mapViewId}
		<TvScreen active={carouselIdx === i}>
			{#if screen.id === 'news-wire'}
				<NewsWireScreen active={carouselIdx === i} />
			{:else if screen.id === 'safety'}
				<SafetyScreen active={carouselIdx === i} />
			{:else if screen.id === 'cameras-tam-coast'}
				<TvCameraClusterScreen clusterId="tam-coast" />
			{:else if screen.id === 'cameras-central-highway'}
				<TvCameraClusterScreen clusterId="central-highway" />
			{:else if screen.id === 'cameras-west-north'}
				<TvCameraClusterScreen clusterId="west-north" />
			{:else if screen.id === 'composite'}
				<TvCompositeHero data={compositeData} />
			{:else if screen.id === 'daily-life'}
				<TvDailyLifeCard cappuccino={cappuccinoData} grocery={groceryData} gas={gasData} />
			{:else if screen.id === 'lifestyle'}
				<TvLifestyleCard wine={wineData} fitness={fitnessData} />
			{:else if screen.id === 'structural'}
				<TvStructuralCard tuition={tuitionData} />
			{:else if screen.id === 'driveway'}
				<TvDrivewayCard data={drivewayData} />
			{:else if screen.id === '311-photos'}
				<Tv311PhotoWall items={$threeOneOneNews?.items ?? []} active={carouselIdx === i} />
			{:else if screen.id === 'community'}
				<TvCommunityScreen active={carouselIdx === i} />
			{:else if screen.id === 'leaderboards'}
				<TvLeaderboardsScreen active={carouselIdx === i} />
			{:else if screen.id === 'conditions'}
				<TvConditionsCard weather={regionWeather?.county} aqi={aqiData} tides={tideData} />
			{:else if screen.id === 'outdoors'}
				<TvOutdoorsCard surf={surfData} dirt={dirtData} streams={streamData} />
			{/if}
		</TvScreen>
	{/if}
{/each}
```

**Note to implementer:** The `TvConditionsCard` and `TvOutdoorsCard` props need data from existing stores. Before wiring these screens:

1. Read the deleted `TvConditionsScreen.svelte` (from git history: `git show HEAD~:src/lib/components/tv/screens/TvConditionsScreen.svelte`)
2. Trace what EnvironmentPanel, TidesPanel, and ConditionsPanel import — they likely use stores from `$stores/news` (for AQI, alerts) and fetch functions from `$lib/api/marin/` (tides, streams, open-meteo)
3. Some of this data may already be loaded by TvWallboard's `handleRefresh()` (weather is). Others may need new state variables + fetch calls added to `loadIndexData()` or a separate `loadConditionsData()` function
4. For surf/dirt/streams: check if the existing ConditionsPanel fetches its own data or reads from stores. Follow the same pattern.

- [ ] **Step 5: Remove the persistent TvConditionsScreen block**

The old code has a persistent `TvConditionsScreen` rendered separately (not inside the `{#each}` loop, similar to the persistent map). Remove that block entirely since conditions is now a card rendered inside the normal carousel loop.

Update the `isConditionsScreenActive` derived value and any related visibility toggling.

- [ ] **Step 6: Handle 311 photo wall skip logic**

Add logic to skip the 311-photos screen when no photos are available:

```typescript
// In advanceCarousel, check if next screen should be skipped
function shouldSkipScreen(idx: number): boolean {
	const screen = TV_SCREENS[idx];
	if (screen.id === '311-photos') {
		const photoItems = ($threeOneOneNews?.items ?? []).filter((i) => i.imageUrl);
		return photoItems.length === 0;
	}
	return false;
}

// In advanceCarousel, after computing next index:
let nextIdx = (carouselIdx + 1) % TV_SCREENS.length;
while (shouldSkipScreen(nextIdx) && nextIdx !== carouselIdx) {
	nextIdx = (nextIdx + 1) % TV_SCREENS.length;
}
carouselIdx = nextIdx;
```

- [ ] **Step 7: Update TvWallboardHeader for 20 dots**

The header renders carousel dots. With 20 screens, the dots need to scale. In `src/lib/components/tv/TvWallboardHeader.svelte`, the dots are rendered from `TV_SCREENS`. Since `TV_SCREENS` is the source of truth and the header already iterates over it, the dot count will update automatically. However, verify the dots don't overflow — 20 dots at the current size might need slightly smaller sizing.

If dots are too wide, reduce their size:

```svelte
<!-- In TvWallboardHeader.svelte, the dot buttons -->
<button
	class="h-1.5 w-1.5 rounded-full transition-colors {carouselIdx === i
		? 'bg-blue-400'
		: 'bg-zinc-600'}"
	...
/>
```

Reduce from `h-2 w-2` to `h-1.5 w-1.5` if needed, or add `gap-0.5` instead of `gap-1`.

- [ ] **Step 8: Pass overlay data to TvMapScreen**

In the map rendering section, pass the index data with lat/lon to TvMapScreen:

```svelte
<TvMapScreen
	{earthquakeItems}
	{fireIncidents}
	viewId={activeMapViewId}
	weather={regionWeather?.[activeMapViewId]}
	threeOneOneItems={$threeOneOneNews?.items ?? []}
	coffeeShops={cappuccinoData?.current?.shops ?? []}
	gasStations={gasData?.current?.stations ?? []}
	fitnessStudios={fitnessData?.current?.studios ?? []}
/>
```

- [ ] **Step 9: Run TypeScript check**

Run: `cd /Users/tammypais/projects/marin-monitor && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -10`
Expected: No errors (or only warnings)

- [ ] **Step 10: Run full test suite**

Run: `cd /Users/tammypais/projects/marin-monitor && npm run test:unit`
Expected: All tests pass

- [ ] **Step 11: Commit**

```bash
cd /Users/tammypais/projects/marin-monitor
git add -A src/lib/components/tv/ src/lib/stores/tv.ts
git commit -m "feat(tv): wire 20-screen carousel with index data, variable durations, and 311 skip logic"
```

---

## Task 11: Integration Smoke Test

Verify the full carousel runs correctly in dev mode.

**Files:** None (verification only)

- [ ] **Step 1: Start dev server**

Run: `cd /Users/tammypais/projects/marin-monitor && npm run dev`

- [ ] **Step 2: Open /tv route and verify carousel**

Open `http://localhost:5173/tv` in browser. Verify:

1. Carousel starts on map-county screen
2. Map screens rotate through all 5 regions (15s each)
3. News Wire screen appears with scrolling content
4. Safety screen shows alerts and crime items
5. Camera clusters display 3 grids of cameras
6. Cost of Being Marin hero shows The Marin Number
7. Daily Life card shows coffee + grocery + gas prices
8. Lifestyle card shows wine + fitness data
9. Structural card shows tuition + housing
10. Driveway card shows vehicle stats
11. 311 Photo Wall shows complaint photos scrolling (or skips if no photos)
12. Community screen shows outdoors + civic
13. Leaderboards show Strava KOM/QOM
14. Conditions card shows weather + AQI + tides
15. Outdoors card shows surf + dirt + streams

- [ ] **Step 3: Verify scroll persistence**

1. Let carousel rotate through a full cycle
2. Watch a scrolling screen (e.g., News Wire)
3. Note the scroll position when carousel moves away
4. Wait for carousel to return to that screen
5. Verify scroll resumes from approximately where it left off (not from top)

- [ ] **Step 4: Verify chyron shows IDX items**

Check the bottom ticker for IDX-badged items showing index data (cappuccino prices, grocery basket cost, etc.)

- [ ] **Step 5: Verify variable durations**

Use keyboard arrows to check transitions. Map screens should feel faster (15s), cards should be snappy (12s), heroes should dwell longer (22s).

- [ ] **Step 6: Fix any issues found**

Address any visual, data, or timing issues discovered during smoke testing.

- [ ] **Step 7: Run production build check**

Run: `cd /Users/tammypais/projects/marin-monitor && npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 8: Final commit if fixes were needed**

```bash
cd /Users/tammypais/projects/marin-monitor
git add -A
git commit -m "fix(tv): address smoke test issues from TV refresh v2"
```

- [ ] **Step 9: Push to main**

```bash
cd /Users/tammypais/projects/marin-monitor
git push origin main
```

- [ ] **Step 10: Update CHANGELOG.md**

Add entry to `CHANGELOG.md`:

```markdown
## 2026-04-01

### Added

- **TV Mode Refresh v2** — 20-screen carousel (up from 13) with hero/anchor/card screen types
  - Cost of Being Marin hero screen with The Marin Number ($21,110/mo)
  - 311 Photo Wall ("Wall of Grievances") — scrolling grid of complaint photos
  - Daily Life card (cappuccino + grocery basket + gas prices)
  - Lifestyle card (wine index + fitness drop-in prices)
  - Structural Marin card (private school tuition + housing)
  - Marin Driveway card (vehicle registration, EV share, fuel breakdown)
  - Conditions card (weather + AQI + tides)
  - Outdoors card (surf report + Hero Dirt tracker + stream gauges)
- **Map overlays** — Each TV map region shows contextual data pins (311 photos, coffee/gas prices, fitness studios, EV charging)
- **IDX chyron category** — Index data headlines scroll in the ticker (cappuccino prices, grocery basket, Marin Number, etc.)

### Changed

- **Scroll system replaced** — CSS animation (TvAutoScroll) replaced with JS rAF-driven scroll (TvScroller) that preserves position across carousel cycles
- **Variable screen durations** — Hero screens (22s), anchor screens (18-20s), card screens (12s), map screens (15s)
- **Conditions screen split** — Old grab-bag environmental screen split into focused Conditions + Outdoors cards
- **311 photo wall skips** when no photos available
```

Also update `src/lib/config/changelog.ts` with user-facing entries.

- [ ] **Step 11: Commit changelog**

```bash
cd /Users/tammypais/projects/marin-monitor
git add CHANGELOG.md src/lib/config/changelog.ts
git commit -m "docs: update changelog for TV Mode Refresh v2"
git push origin main
```

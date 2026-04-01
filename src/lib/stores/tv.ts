// src/lib/stores/tv.ts

import { derived, writable, get } from 'svelte/store';
import {
  safetyNews,
  localNews,
  civicNews,
  alerts,
  threeOneOneNews
} from '$lib/stores/news';
import { stravaEvents } from '$lib/stores/strava';
import { STRAVA_CHYRON_MAX_AGE_MS } from '$lib/config/strava';
import type { TickerItem, TickerCategory, TickerStatus } from '$lib/config/tv';
import type { NewsItem } from '$lib/types';
import type { CompositeData } from '$lib/types/composite';
import type { CoffeeData } from '$lib/types/coffee';
import type { GroceryBasketData } from '$lib/types/grocery';
import type { WineIndexData } from '$lib/types/wine';
import type { FitnessData } from '$lib/types/fitness';
import type { SchoolIndexData } from '$lib/types/school';
import type { DrivewayData } from '$lib/types/driveway';
import type { GasPriceData } from '$lib/types/gas';

export interface IndexDataSources {
  composite?: CompositeData | null;
  cappuccino?: CoffeeData | null;
  grocery?: GroceryBasketData | null;
  wine?: WineIndexData | null;
  fitness?: FitnessData | null;
  tuition?: SchoolIndexData | null;
  driveway?: DrivewayData | null;
  gas?: GasPriceData | null;
}

export const tvIndexData = writable<IndexDataSources>({});

function newsToTicker(
  item: NewsItem,
  badge: TickerCategory,
  status: TickerStatus = 'normal'
): TickerItem {
  return {
    id: `${badge}-${item.id}`,
    badge,
    category: badge,
    text: item.title,
    timestamp: item.timestamp,
    status: item.isAlert ? 'elevated' : status
  };
}

/** Format a dollar amount with cents: $5.75 */
function fmtPrice(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Format a large integer with commas: $21,110 */
function fmtLarge(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * Build IDX ticker items from available index data sources.
 * Returns up to 5 items, rotated by minute-of-hour so the
 * set varies across chyron refreshes.
 */
export function buildIdxTickerItems(sources: IndexDataSources): TickerItem[] {
  const candidates: TickerItem[] = [];
  const now = Date.now();

  // Composite — Marin Number
  if (sources.composite?.current) {
    const { marinNumber, compositeScore } = sources.composite.current;
    if (marinNumber?.total) {
      candidates.push({
        id: 'IDX-composite-marin-number',
        badge: 'IDX' as TickerCategory,
        category: 'IDX',
        text: `Marin Number: ${fmtLarge(marinNumber.total)}/mo — Cost of Being Marin Index ${compositeScore.toFixed(1)}`,
        timestamp: now,
        status: 'normal' as TickerStatus
      });
    }
  }

  // Cappuccino
  if (sources.cappuccino?.current) {
    const snap = sources.cappuccino.current;
    if (snap.medianPrice != null) {
      candidates.push({
        id: 'IDX-cappuccino',
        badge: 'IDX' as TickerCategory,
        category: 'IDX',
        text: `Cappuccino Index: median ${fmtPrice(snap.medianPrice)} across ${snap.shopCount} Marin shops`,
        timestamp: now,
        status: 'normal' as TickerStatus
      });
    }
  }

  // Grocery basket
  if (sources.grocery?.current) {
    const snap = sources.grocery.current;
    if (snap.totalCheapest != null) {
      const expStr = snap.totalExpensive != null ? ` – up to ${fmtLarge(snap.totalExpensive)} at priciest` : '';
      candidates.push({
        id: 'IDX-grocery',
        badge: 'IDX' as TickerCategory,
        category: 'IDX',
        text: `Grocery Basket: ${fmtLarge(snap.totalCheapest)} cheapest${expStr} (${snap.itemsFound} items)`,
        timestamp: now,
        status: 'normal' as TickerStatus
      });
    }
  }

  // Wine
  if (sources.wine?.current) {
    const snap = sources.wine.current;
    const napaSonoma = snap.categories.find((c) => c.category === 'napa-sonoma');
    if (napaSonoma?.medianPrice != null) {
      candidates.push({
        id: 'IDX-wine',
        badge: 'IDX' as TickerCategory,
        category: 'IDX',
        text: `Wine Index: Napa/Sonoma median ${fmtPrice(napaSonoma.medianPrice)} — ${snap.categories.length} categories tracked`,
        timestamp: now,
        status: 'normal' as TickerStatus
      });
    }
  }

  // Gas
  if (sources.gas?.current) {
    const snap = sources.gas.current;
    if (snap.avgRegular != null) {
      candidates.push({
        id: 'IDX-gas',
        badge: 'IDX' as TickerCategory,
        category: 'IDX',
        text: `Gas: avg regular ${fmtPrice(snap.avgRegular)} across ${snap.stationCount} Marin stations`,
        timestamp: now,
        status: 'normal' as TickerStatus
      });
    }
  }

  // Tuition (K-12 cumulative)
  if (sources.tuition?.current) {
    const snap = sources.tuition.current;
    if (snap.cumulativeK12) {
      candidates.push({
        id: 'IDX-tuition',
        badge: 'IDX' as TickerCategory,
        category: 'IDX',
        text: `Private K-12 in Marin: ${fmtLarge(snap.cumulativeK12)} cumulative — ${snap.schools.length} schools tracked`,
        timestamp: now,
        status: 'normal' as TickerStatus
      });
    }
  }

  // Driveway — EV share
  if (sources.driveway?.current) {
    const snap = sources.driveway.current;
    const evEntry = snap.fuelBreakdown.find((f) => f.fuelType === 'battery-electric');
    if (evEntry) {
      candidates.push({
        id: 'IDX-driveway',
        badge: 'IDX' as TickerCategory,
        category: 'IDX',
        text: `Marin Driveway: ${evEntry.pct.toFixed(1)}% battery-electric (${evEntry.count.toLocaleString('en-US')} EVs) of ${snap.totalVehicles.toLocaleString('en-US')} registered vehicles`,
        timestamp: now,
        status: 'normal' as TickerStatus
      });
    }
  }

  // Fitness
  if (sources.fitness?.current) {
    const snap = sources.fitness.current;
    if (snap.medianPrice != null) {
      candidates.push({
        id: 'IDX-fitness',
        badge: 'IDX' as TickerCategory,
        category: 'IDX',
        text: `Fitness Index: median drop-in ${fmtPrice(snap.medianPrice)} across ${snap.studioCount} Marin studios`,
        timestamp: now,
        status: 'normal' as TickerStatus
      });
    }
  }

  if (candidates.length === 0) return [];

  // Rotate which 5 items appear based on minute-of-hour
  const minute = new Date().getMinutes();
  const offset = minute % candidates.length;
  const rotated = [...candidates.slice(offset), ...candidates.slice(0, offset)];
  return rotated.slice(0, 5);
}

/**
 * Derived store merging multiple data sources into a flat ticker feed.
 * Uses existing news stores — no new fetching.
 * Items that fail or are empty are silently excluded.
 */
export const tvTickerItems = derived(
  [safetyNews, localNews, civicNews, alerts, stravaEvents, threeOneOneNews],
  ([$safety, $local, $civic, $alerts, $strava, $threeOneOne]) => {
    // NOTE: $safety, $local, $civic are CategoryState objects — access .items for NewsItem[]
    // $alerts is already NewsItem[]
    const safetyItems = $safety.items ?? [];
    const localItems = $local.items ?? [];
    const civicItems = $civic.items ?? [];
    const items: TickerItem[] = [];

    try {
      // Weather alerts (from news alerts that have weather keywords)
      const wxAlerts = $alerts.filter(
        (a) => a.alertKeyword && /wind|storm|flood|heat|fog|freeze|advisory|warning|watch/i.test(a.alertKeyword)
      );
      for (const a of wxAlerts.slice(0, 3)) {
        items.push(newsToTicker(a, 'WX', 'elevated'));
      }

      // Specific categories FIRST — dedup keeps first occurrence, so these win over generic PD
      // Fire items from safety feed
      const fireItems = safetyItems.filter(
        (s) => s.source?.toLowerCase().includes('calfire') ||
               (s.alertKeyword && /fire|wildfire|blaze/i.test(s.alertKeyword))
      );
      for (const item of fireItems.slice(0, 3)) {
        items.push(newsToTicker(item, 'FI', 'critical'));
      }

      // Earthquake items from safety feed
      const quakeItems = safetyItems.filter(
        (s) => s.source?.toLowerCase().includes('usgs') || (s.category === 'safety' && /earthquake|quake|magnitude/i.test(s.title))
      );
      for (const item of quakeItems.slice(0, 3)) {
        items.push(newsToTicker(item, 'EQ'));
      }

      // Transit alerts from safety feed
      const transitItems = safetyItems.filter(
        (s) => s.source?.toLowerCase().includes('511') || /transit|bridge|ferry|delay|closure/i.test(s.title)
      );
      for (const item of transitItems.slice(0, 3)) {
        items.push(newsToTicker(item, 'GG'));
      }

      // Generic safety/crime — after specific categories so dedup keeps specific badges
      for (const item of safetyItems.slice(0, 5)) {
        items.push(newsToTicker(item, 'PD'));
      }

      // Local news — latest 5
      for (const item of localItems.slice(0, 5)) {
        items.push(newsToTicker(item, 'LW'));
      }

      // Civic — latest 2
      for (const item of civicItems.slice(0, 2)) {
        items.push(newsToTicker(item, 'CV'));
      }

      // 311 — latest 3
      const threeOneOneItems = $threeOneOne.items ?? [];
      for (const item of threeOneOneItems.slice(0, 3)) {
        items.push(newsToTicker(item, '311'));
      }

      // Strava KOM/QOM events (max 4, within 48h)
      const now = Date.now();
      const recentStravaEvents = ($strava.events ?? [])
        .filter((e) => now - new Date(e.detectedAt).getTime() < STRAVA_CHYRON_MAX_AGE_MS)
        .slice(0, 4);

      for (const event of recentStravaEvents) {
        const prefix = event.type === 'new_kom' ? 'NEW KOM' : 'NEW QOM';
        const prev = event.previous ? ` (prev: ${event.previous.time})` : '';
        items.push({
          id: `KOM-${event.effortId}`,
          badge: 'KOM' as TickerCategory,
          category: 'KOM',
          text: `${prefix}: ${event.segmentName} — ${event.time} by ${event.athlete}${prev}`,
          timestamp: new Date(event.detectedAt).getTime(),
          status: 'normal' as TickerStatus
        });
      }

      // IDX — index data headlines
      const idxSources = get(tvIndexData);
      const idxItems = buildIdxTickerItems(idxSources);
      items.push(...idxItems);
    } catch {
      // Silent fail — don't break chyron
    }

    // Deduplicate by underlying NewsItem id (strip badge prefix)
    // Fire/quake/transit items overlap with safety — keep the more specific badge
    const seen = new Set<string>();
    const deduped = items.filter((item) => {
      const baseId = item.id.replace(/^[A-Z]{2}-/, '');
      if (seen.has(baseId)) return false;
      seen.add(baseId);
      return true;
    });

    // Fallback for quiet days
    if (deduped.length === 0) {
      return [{
        id: 'all-clear',
        badge: 'CV' as TickerCategory,
        category: 'CV',
        text: 'All clear in Marin County',
        timestamp: Date.now(),
        status: 'normal' as TickerStatus
      }];
    }

    return deduped;
  }
);

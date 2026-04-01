// src/lib/stores/tv.ts

import { derived } from 'svelte/store';
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

// src/lib/config/tv.ts

/** TV carousel screen identifiers */
export type TvScreenId = 'map-conditions' | 'news-wire' | 'safety' | 'cameras' | 'environment' | 'outdoors';

export interface TvScreenConfig {
  id: TvScreenId;
  name: string;
  description: string;
  durationMs: number;
}

export const CAROUSEL_DEFAULT_DURATION_MS = 20_000;

export const TV_SCREENS: TvScreenConfig[] = [
  { id: 'map-conditions', name: 'Map & Conditions', description: 'Live map with weather sidebar', durationMs: 30_000 },
  { id: 'news-wire', name: 'News Wire', description: 'Local headlines', durationMs: CAROUSEL_DEFAULT_DURATION_MS },
  { id: 'safety', name: 'Safety & Alerts', description: 'Crime, fire, weather alerts', durationMs: CAROUSEL_DEFAULT_DURATION_MS },
  { id: 'cameras', name: 'Camera Wall', description: 'Live camera feeds across Marin', durationMs: CAROUSEL_DEFAULT_DURATION_MS },
  { id: 'environment', name: 'Environment', description: 'Air quality, UV, fires, streams', durationMs: CAROUSEL_DEFAULT_DURATION_MS },
  { id: 'outdoors', name: 'Outdoors & Tides', description: 'Tides, marine, trails, sun', durationMs: CAROUSEL_DEFAULT_DURATION_MS }
];
export const CAROUSEL_TRANSITION_MS = 500;
export const TV_REFRESH_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
export const CURSOR_HIDE_MS = 5_000;

/** Chyron ticker category badges and colors */
export type TickerCategory = 'WX' | 'PD' | 'LW' | 'FI' | 'EQ' | 'TD' | 'GG' | 'CV';
export type TickerStatus = 'normal' | 'elevated' | 'critical';

export interface TickerItem {
  id: string;
  badge: TickerCategory;
  category: string;
  text: string;
  timestamp: number;
  status: TickerStatus;
}

/** Map sub-carousel views — camera fly-to only, NO town filter changes */
export interface TvMapView {
  id: string;
  label: string;
  center: [number, number]; // [lon, lat]
  zoom: number;
  duration: number; // flyTo animation ms
}

export const TV_MAP_VIEWS: TvMapView[] = [
  { id: 'county', label: 'Marin County', center: [-122.5311, 37.9735], zoom: 9.8, duration: 0 },
  { id: 'south', label: 'Southern Marin', center: [-122.52, 37.885], zoom: 12.8, duration: 1500 },
  { id: 'central', label: 'Central Marin', center: [-122.54, 37.955], zoom: 13, duration: 1500 },
  { id: 'north', label: 'Novato & North', center: [-122.57, 38.1], zoom: 12.5, duration: 1500 },
  { id: 'west', label: 'West Marin', center: [-122.78, 38.05], zoom: 11.5, duration: 1500 },
];

export const TV_MAP_VIEW_INTERVAL_MS = 6_000; // 6s per sub-view (5 views × 6s = 30s)

export const CATEGORY_COLORS: Record<TickerCategory, string> = {
  WX: '#60a5fa',  // blue (weather)
  PD: '#ef4444',  // red (safety)
  LW: '#a3a3a3',  // gray (news)
  FI: '#f97316',  // orange (fire)
  EQ: '#a855f7',  // purple (earthquake)
  TD: '#22d3ee',  // cyan (tides)
  GG: '#facc15',  // yellow (transit)
  CV: '#34d399',  // green (civic)
};

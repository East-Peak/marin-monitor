// src/lib/config/tv.ts

/** TV carousel screen identifiers */
export type TvScreenId = 'map-conditions' | 'news-wire' | 'safety' | 'pulse' | 'outdoors';

export interface TvScreenConfig {
  id: TvScreenId;
  name: string;
  description: string;
}

export const TV_SCREENS: TvScreenConfig[] = [
  { id: 'map-conditions', name: 'Map & Conditions', description: 'Live map with weather sidebar' },
  { id: 'news-wire', name: 'News Wire', description: 'Local headlines' },
  { id: 'safety', name: 'Safety & Alerts', description: 'Crime, fire, weather alerts' },
  { id: 'pulse', name: 'Pulse', description: 'Narrative summary and key metrics' },
  { id: 'outdoors', name: 'Outdoors & Tides', description: 'Tides, marine, trails, sun' }
];

export const CAROUSEL_INTERVAL_MS = 20_000;
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

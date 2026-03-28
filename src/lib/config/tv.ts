// src/lib/config/tv.ts

/** TV carousel screen identifiers */
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
  | 'conditions'
  | 'community';

export interface TvScreenConfig {
  id: TvScreenId;
  name: string;
  description: string;
  durationMs: number;
  /** For map screens, which TvMapView to display */
  mapViewId?: string;
}

export const TV_SCREENS: TvScreenConfig[] = [
  { id: 'map-county', name: 'Marin County', description: 'County-wide map overview', durationMs: 15_000, mapViewId: 'county' },
  { id: 'map-south', name: 'Southern Marin', description: 'Mill Valley, Sausalito, Tiburon', durationMs: 15_000, mapViewId: 'south' },
  { id: 'map-central', name: 'Central Marin', description: 'San Rafael, San Anselmo, Larkspur', durationMs: 15_000, mapViewId: 'central' },
  { id: 'map-north', name: 'Novato & North', description: 'Novato and northern corridor', durationMs: 15_000, mapViewId: 'north' },
  { id: 'map-west', name: 'West Marin', description: 'Point Reyes, Bolinas, Nicasio', durationMs: 15_000, mapViewId: 'west' },
  { id: 'news-wire', name: 'News Wire', description: 'Local headlines', durationMs: 20_000 },
  { id: 'safety', name: 'Safety & Alerts', description: 'Crime and safety with auto-scroll', durationMs: 20_000 },
  { id: 'cameras-tam-coast', name: 'Tam & Coast', description: 'Mt Tam ridgeline and coastal cameras', durationMs: 20_000 },
  { id: 'cameras-central-highway', name: 'Central & Highway', description: '101 corridor and central Marin cameras', durationMs: 20_000 },
  { id: 'cameras-west-north', name: 'West & North', description: 'West Marin and Novato hill cameras', durationMs: 20_000 },
  { id: 'conditions', name: 'Conditions & Trails', description: 'AQI, tides, streams, Hero Dirt', durationMs: 20_000 },
  { id: 'community', name: 'Outdoors & Community', description: 'Outdoor and civic news', durationMs: 20_000 }
];
export const TV_REFRESH_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
export const CURSOR_HIDE_MS = 5_000;

/** Chyron ticker category badges and colors */
export type TickerCategory = 'WX' | 'PD' | 'LW' | 'FI' | 'EQ' | 'TD' | 'GG' | 'CV' | 'KOM';
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

/** Geographic camera clusters for TV mode */
export type TvCameraCluster = 'tam-coast' | 'central-highway' | 'west-north';

export const TV_CAMERA_CLUSTERS: { id: TvCameraCluster; label: string }[] = [
  { id: 'tam-coast', label: 'Tam & Coast' },
  { id: 'central-highway', label: 'Central & Highway' },
  { id: 'west-north', label: 'West & North' }
];

export const CATEGORY_COLORS: Record<TickerCategory, string> = {
  WX: '#60a5fa',  // blue (weather)
  PD: '#ef4444',  // red (safety)
  LW: '#a3a3a3',  // gray (news)
  FI: '#f97316',  // orange (fire)
  EQ: '#a855f7',  // purple (earthquake)
  TD: '#22d3ee',  // cyan (tides)
  GG: '#facc15',  // yellow (transit)
  CV: '#34d399',  // green (civic)
  KOM: '#fc4c02', // Strava orange (KOM/QOM)
};

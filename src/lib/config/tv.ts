// src/lib/config/tv.ts

export type ScreenType = 'map' | 'hero' | 'anchor' | 'card';

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

export interface TvScreenConfig {
  id: TvScreenId;
  name: string;
  description: string;
  durationMs: number;
  screenType: ScreenType;
  /** For map screens, which TvMapView to display */
  mapViewId?: string;
}

export const TV_SCREENS: TvScreenConfig[] = [
  // Cluster: The Map
  { id: 'map-county', name: 'Marin County', description: 'County overview', durationMs: 15_000, screenType: 'map', mapViewId: 'county' },
  { id: 'map-south', name: 'South Marin', description: 'Mill Valley, Sausalito, Tiburon', durationMs: 15_000, screenType: 'map', mapViewId: 'south' },
  { id: 'map-central', name: 'Central Marin', description: 'San Rafael, San Anselmo, Larkspur', durationMs: 15_000, screenType: 'map', mapViewId: 'central' },
  { id: 'map-north', name: 'North Marin', description: 'Novato & North', durationMs: 15_000, screenType: 'map', mapViewId: 'north' },
  { id: 'map-west', name: 'West Marin', description: 'Point Reyes, Bolinas, Nicasio', durationMs: 15_000, screenType: 'map', mapViewId: 'west' },
  // Cluster: News & Safety
  { id: 'news-wire', name: 'Local News Wire', description: 'Latest local news', durationMs: 20_000, screenType: 'anchor' },
  { id: 'safety', name: 'Crime & Safety', description: 'Safety alerts and incidents', durationMs: 20_000, screenType: 'anchor' },
  // Cluster: Eyes on Marin
  { id: 'cameras-tam-coast', name: 'Mt Tam & Coast', description: 'Coastal and mountain cameras', durationMs: 18_000, screenType: 'anchor' },
  { id: 'cameras-central-highway', name: 'Central & 101', description: 'Highway and central cameras', durationMs: 18_000, screenType: 'anchor' },
  { id: 'cameras-west-north', name: 'West & North', description: 'West Marin and Novato cameras', durationMs: 18_000, screenType: 'anchor' },
  // Cluster: Cost of Living
  { id: 'composite', name: 'Cost of Being Marin', description: 'The Marin Number', durationMs: 22_000, screenType: 'hero' },
  { id: 'daily-life', name: 'Daily Life', description: 'Coffee, groceries, gas', durationMs: 12_000, screenType: 'card' },
  { id: 'lifestyle', name: 'Lifestyle', description: 'Wine and fitness', durationMs: 12_000, screenType: 'card' },
  // Cluster: Structural Marin
  { id: 'structural', name: 'Structural Marin', description: 'Tuition and housing', durationMs: 12_000, screenType: 'card' },
  { id: 'driveway', name: 'The Marin Driveway', description: 'Vehicle registration', durationMs: 12_000, screenType: 'card' },
  // Cluster: Wall of Grievances
  { id: '311-photos', name: 'Fix It Marin', description: '311 complaints with photos', durationMs: 22_000, screenType: 'hero' },
  // Cluster: Community & Sport
  { id: 'community', name: 'Community', description: 'Outdoors and civic', durationMs: 20_000, screenType: 'anchor' },
  { id: 'leaderboards', name: 'Strava Leaderboards', description: 'KOM and QOM records', durationMs: 20_000, screenType: 'anchor' },
  // Cluster: Conditions
  { id: 'conditions', name: 'Conditions', description: 'Weather, AQI, tides', durationMs: 12_000, screenType: 'card' },
  { id: 'outdoors', name: 'Outdoors', description: 'Surf, trails, streams', durationMs: 12_000, screenType: 'card' },
];
export const TV_REFRESH_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
export const CURSOR_HIDE_MS = 5_000;

/** Chyron ticker category badges and colors */
export type TickerCategory = 'WX' | 'PD' | 'LW' | 'FI' | 'EQ' | 'TD' | 'GG' | 'CV' | 'KOM' | '311' | 'IDX';
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
  '311': '#ff6b35',
  IDX: '#6366f1', // indigo (index data)
};

/**
 * Map configuration — Marin County geography, fire zones, and map layer styling
 */

import { MARIN_CENTER, MARIN_BOUNDS } from './towns';

/**
 * Default map view
 */
export const MAP_DEFAULT = {
	center: MARIN_CENTER,
	zoom: 10.3,
	minZoom: 5,
	maxZoom: 16
} as const;

export const MAP_BOUNDS = MARIN_BOUNDS;

/**
 * Map layer colors and styling
 */
export const LAYER_COLORS = {
	civic: '#3b82f6', // blue
	news: '#8b5cf6', // purple
	safety: '#ef4444', // red
	housing: '#f59e0b', // amber
	activity: '#10b981', // emerald
	satire: '#ec4899', // pink — dashed outline
	gas: '#22d3ee', // cyan
	'ev-charging': '#a855f7', // purple
	coffee: '#a16207' // warm brown
} as const;

/**
 * Fire zones / Wildland-Urban Interface areas
 * These are the high-risk fire corridors in Marin
 */
export interface FireZone {
	name: string;
	center: { lat: number; lon: number };
	desc: string;
}

export const FIRE_ZONES: FireZone[] = [
	{
		name: 'Mt. Tamalpais',
		center: { lat: 37.9235, lon: -122.5965 },
		desc: 'Mt. Tam — steep terrain, dense vegetation, heavily visited'
	},
	{
		name: 'San Geronimo Valley',
		center: { lat: 38.012, lon: -122.665 },
		desc: 'Valley communities surrounded by open space and forest'
	},
	{
		name: 'Lucas Valley / Marinwood',
		center: { lat: 38.035, lon: -122.57 },
		desc: 'WUI corridor between 101 and open space preserves'
	},
	{
		name: 'Sleepy Hollow',
		center: { lat: 37.985, lon: -122.575 },
		desc: 'Hillside neighborhood adjacent to open space'
	},
	{
		name: 'Ring Mountain / Tiburon Ridge',
		center: { lat: 37.895, lon: -122.475 },
		desc: 'Grassland ridge above Tiburon peninsula'
	},
	{
		name: 'Tennessee Valley',
		center: { lat: 37.865, lon: -122.545 },
		desc: 'GGNRA corridor between Mill Valley and coast'
	}
];

/**
 * Key landmarks for map reference
 */
export interface Landmark {
	name: string;
	lat: number;
	lon: number;
	type: 'bridge' | 'peak' | 'park' | 'water' | 'transit';
}

export const LANDMARKS: Landmark[] = [
	{ name: 'Golden Gate Bridge', lat: 37.8199, lon: -122.4783, type: 'bridge' },
	{ name: 'Richmond-San Rafael Bridge', lat: 37.9361, lon: -122.4475, type: 'bridge' },
	{ name: 'Mt. Tamalpais', lat: 37.9235, lon: -122.5965, type: 'peak' },
	{ name: 'Point Reyes Lighthouse', lat: 37.9953, lon: -123.0247, type: 'park' },
	{ name: 'Muir Woods', lat: 37.8912, lon: -122.5714, type: 'park' },
	{ name: 'Larkspur Ferry Terminal', lat: 37.9453, lon: -122.5102, type: 'transit' },
	{ name: 'Sausalito Ferry Terminal', lat: 37.859, lon: -122.485, type: 'transit' },
	{ name: 'Tomales Bay', lat: 38.16, lon: -122.88, type: 'water' },
	{ name: 'Bolinas Lagoon', lat: 37.913, lon: -122.682, type: 'water' },
	{ name: 'Richardson Bay', lat: 37.878, lon: -122.5, type: 'water' },
	{ name: 'China Camp', lat: 38.0035, lon: -122.4897, type: 'park' },
	{ name: 'SMART Train — Larkspur', lat: 37.9477, lon: -122.5126, type: 'transit' },
	{ name: 'SMART Train — San Rafael', lat: 37.9711, lon: -122.5227, type: 'transit' },
	{ name: 'SMART Train — Marin Civic Center', lat: 38.0013, lon: -122.5376, type: 'transit' },
	{ name: 'SMART Train — Novato Hamilton', lat: 38.0565, lon: -122.524, type: 'transit' },
	{ name: 'SMART Train — Novato Downtown', lat: 38.1088, lon: -122.5797, type: 'transit' },
	{ name: 'SMART Train — Novato San Marin', lat: 38.1206, lon: -122.5663, type: 'transit' }
];

/**
 * Airport pins for SFO & OAK status overlay
 */
export interface AirportPin {
	code: string;
	name: string;
	lat: number;
	lon: number;
}

export const AIRPORT_PINS: AirportPin[] = [
	{ code: 'SFO', name: 'San Francisco Intl', lat: 37.6213, lon: -122.379 },
	{ code: 'OAK', name: 'Oakland Intl', lat: 37.7213, lon: -122.2208 },
	{ code: 'STS', name: 'Santa Rosa (Schulz–Sonoma Co)', lat: 38.5089, lon: -122.8128 },
	{ code: 'SJC', name: 'San José Mineta Intl', lat: 37.3639, lon: -121.9289 }
];

export const AIRPORT_STATUS_COLORS: Record<string, string> = {
	'on-time': '#22c55e',
	delays: '#f59e0b',
	'ground-delay': '#f97316',
	'ground-stop': '#ef4444',
	closed: '#6b7280'
};

/**
 * NWS weather zone for Marin
 */
export const NWS_ZONE = 'CAZ006'; // Marin County coast and valleys
export const NWS_FIRE_ZONE = 'CAZ506'; // Marin fire weather zone
export const NWS_OFFICE = 'MTR'; // San Francisco Bay Area forecast office

/**
 * NOAA tide stations near Marin
 */
export const TIDE_STATIONS = {
	pointReyes: '9415020',
	sanFrancisco: '9414290'
} as const;

/**
 * USGS earthquake search params — 100km radius around Marin
 */
export const EARTHQUAKE_PARAMS = {
	latitude: MARIN_CENTER.lat,
	longitude: MARIN_CENTER.lon,
	maxradiuskm: 100,
	minmagnitude: 2.0,
	limit: 10,
	orderby: 'time'
} as const;

/**
 * AirNow reporting area for Marin
 */
export const AIRNOW_PARAMS = {
	latitude: MARIN_CENTER.lat,
	longitude: MARIN_CENTER.lon,
	distance: 25 // miles
} as const;

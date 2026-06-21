/**
 * Shared NWS constants and grid-point lookup
 *
 * Used by both nws.ts (7-day forecast) and nws-hourly.ts (hourly + QPF).
 */

import { MARIN_CENTER } from '$lib/config/towns';
import { NWS_OFFICE } from '$lib/config/map';
import { fetchWithTimeout } from './fetch-helpers';

const NWS_BASE = 'https://api.weather.gov';
const NWS_HEADERS: Record<string, string> = {
	Accept: 'application/geo+json',
	'User-Agent': 'MarinMonitor/1.0 (marin-monitor@example.com)'
};

const gridCacheMap = new Map<string, { office: string; gridX: number; gridY: number }>();

/**
 * Get NWS grid coordinates for a location (defaults to Marin County center)
 */
export async function getGridPoint(
	lat: number = MARIN_CENTER.lat,
	lon: number = MARIN_CENTER.lon
): Promise<{ office: string; gridX: number; gridY: number }> {
	const key = `${lat},${lon}`;
	const cached = gridCacheMap.get(key);
	if (cached) return cached;

	const url = `${NWS_BASE}/points/${lat},${lon}`;
	const response = await fetchWithTimeout(url, { headers: NWS_HEADERS });

	if (!response.ok) {
		throw new Error(`NWS points lookup failed: ${response.status}`);
	}

	const data = await response.json();
	if (!data.properties) {
		throw new Error('NWS returned unexpected response structure (missing properties)');
	}
	const grid = {
		office: data.properties.gridId || NWS_OFFICE,
		gridX: data.properties.gridX,
		gridY: data.properties.gridY
	};
	gridCacheMap.set(key, grid);

	return grid;
}

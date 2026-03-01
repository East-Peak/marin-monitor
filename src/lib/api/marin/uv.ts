/**
 * UV Index adapter
 *
 * Fetches current and forecast UV index from currentuvindex.com.
 * Free, no auth required. 500 requests/IP/day.
 */

import { logger } from '$lib/config/api';
import { MARIN_CENTER } from '$lib/config/towns';

export interface UvData {
	current: number;
	category: string;
	color: string;
	timestamp: number;
	forecast: UvForecastPoint[];
}

export interface UvForecastPoint {
	time: number;
	uvi: number;
}

const UV_API_BASE = 'https://currentuvindex.com/api/v1/uvi';

/**
 * Map UV index to category and color
 */
function uviCategory(uvi: number): { category: string; color: string } {
	if (uvi <= 2) return { category: 'Low', color: '#299501' };
	if (uvi <= 5) return { category: 'Moderate', color: '#f7e401' };
	if (uvi <= 7) return { category: 'High', color: '#f95901' };
	if (uvi <= 10) return { category: 'Very High', color: '#d90011' };
	return { category: 'Extreme', color: '#6c49cb' };
}

/**
 * Fetch current UV index and forecast for Marin County.
 */
export async function fetchUvIndex(): Promise<UvData | null> {
	try {
		const url = `${UV_API_BASE}?latitude=${MARIN_CENTER.lat}&longitude=${MARIN_CENTER.lon}`;
		logger.log('UV', `Fetching UV index: ${url}`);

		const response = await fetch(url, {
			headers: { Accept: 'application/json' }
		});

		if (!response.ok) {
			throw new Error(`UV API failed: ${response.status}`);
		}

		const data = await response.json();

		if (!data.ok || !data.now) {
			logger.warn('UV', 'Unexpected response format');
			return null;
		}

		const currentUvi = data.now.uvi ?? 0;
		const { category, color } = uviCategory(currentUvi);

		const forecast: UvForecastPoint[] = (data.forecast ?? [])
			.slice(0, 24)
			.map((point: { time: string; uvi: number }) => ({
				time: new Date(point.time).getTime(),
				uvi: point.uvi
			}));

		return {
			current: currentUvi,
			category,
			color,
			timestamp: Date.now(),
			forecast
		};
	} catch (error) {
		logger.warn('UV', `UV index fetch failed: ${(error as Error).message}`);
		return null;
	}
}

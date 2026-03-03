/**
 * USGS Earthquake adapter for Marin area
 *
 * Fetches recent earthquakes within ~50km of Marin County center.
 * Free GeoJSON API, no key required, no rate limits.
 */

import type { NewsItem, EarthquakeData } from '$lib/types';
import { MARIN_CENTER } from '$lib/config/towns';
import { logger } from '$lib/config/api';
import { serviceClient } from '$lib/services/client';

interface UsgsFeature {
	id: string;
	properties: {
		mag: number;
		place: string;
		time: number;
		url: string;
		title: string;
		type: string;
	};
	geometry: {
		coordinates: [number, number, number]; // lon, lat, depth
	};
}

interface UsgsResponse {
	features: UsgsFeature[];
}

/**
 * Fetch recent earthquakes near Marin County.
 * Returns as EarthquakeData[].
 */
export async function fetchEarthquakes(): Promise<EarthquakeData[]> {
	try {
		logger.log('USGS', 'Fetching earthquakes');

		const result = await serviceClient.request<UsgsResponse>('USGS', '/fdsnws/event/1/query', {
			params: {
				format: 'geojson',
				latitude: MARIN_CENTER.lat,
				longitude: MARIN_CENTER.lon,
				maxradiuskm: 100,
				minmagnitude: 2.0,
				limit: 10,
				orderby: 'time'
			}
		});

		return result.data.features.map((f) => ({
			id: f.id,
			magnitude: f.properties.mag,
			place: f.properties.place,
			time: f.properties.time,
			lat: f.geometry.coordinates[1],
			lon: f.geometry.coordinates[0],
			depth: f.geometry.coordinates[2],
			url: f.properties.url
		}));
	} catch (error) {
		logger.warn('USGS', `Earthquake fetch failed: ${(error as Error).message}`);
		return [];
	}
}

/**
 * Convert earthquakes to NewsItems for the safety panel
 */
export function earthquakesToNewsItems(quakes: EarthquakeData[]): NewsItem[] {
	return quakes.map((q) => ({
		id: `usgs-${q.id}`,
		title: `M${q.magnitude.toFixed(1)} Earthquake – ${q.place}`,
		link: q.url,
		timestamp: q.time,
		description: `Magnitude ${q.magnitude.toFixed(1)} at ${q.depth.toFixed(1)}km depth`,
		source: 'USGS',
		category: 'safety' as const,
		verification: 'official' as const,
		isAlert: q.magnitude >= 3.5,
		lat: q.lat,
		lon: q.lon
	}));
}

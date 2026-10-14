/**
 * USGS Earthquake adapter for Marin area
 *
 * Fetches recent earthquakes within ~50km of Marin County center.
 * Free GeoJSON API, no key required, no rate limits.
 */

import type { NewsItem, EarthquakeData } from '$lib/types';
import { MARIN_CENTER } from '$lib/config/towns';
import { logger } from '$lib/config/api';
import { liveData, serviceClient } from '$lib/services/client';
import type { OwnerOptions } from './fetch-helpers';

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
	metadata?: { generated?: unknown };
}

/** A quake list and the moment USGS generated it (ms epoch), or null when the payload doesn't say. */
export interface EarthquakeRead {
	quakes: EarthquakeData[];
	observedAt: number | null;
}

/** `metadata.generated` only when it is a positive, finite ms epoch that is also a valid date. */
function generatedAt(value: unknown): number | null {
	return typeof value === 'number' && value > 0 && Number.isFinite(new Date(value).getTime())
		? value
		: null;
}

/**
 * Fetch recent earthquakes near Marin County. Rejects on failure or an
 * unexpected shape, so a caller that keeps last-good pins can tell a failure
 * from a real "no quakes" (TV slice 3).
 */
export async function fetchEarthquakesOrThrow(
	opts: OwnerOptions & { liveOnly?: boolean } = {}
): Promise<EarthquakeData[]> {
	return (await readEarthquakesOrThrow(opts)).quakes;
}

/**
 * fetchEarthquakesOrThrow, plus the payload's own time. A cached body keeps the
 * `generated` it arrived with, so this is the data's age, not the fetch's.
 */
export async function readEarthquakesOrThrow({
	signal,
	liveOnly = false
}: OwnerOptions & { liveOnly?: boolean } = {}): Promise<EarthquakeRead> {
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
		},
		signal,
		...(liveOnly ? { revalidateInBackground: false } : {})
	});
	// v2 (liveOnly): a cached copy after a failed refresh is a failure, kept and marked by its owner.
	const data = liveOnly ? liveData(result) : result.data;
	if (!Array.isArray(data?.features)) {
		throw new Error('USGS: unexpected response shape');
	}

	const quakes = data.features.map((f) => ({
		id: f.id,
		magnitude: f.properties.mag,
		place: f.properties.place,
		time: f.properties.time,
		lat: f.geometry.coordinates[1],
		lon: f.geometry.coordinates[0],
		depth: f.geometry.coordinates[2],
		url: f.properties.url
	}));
	return { quakes, observedAt: generatedAt(data.metadata?.generated) };
}

/** The swallowing form the dashboard uses: any failure reads as no quakes. */
export async function fetchEarthquakes(): Promise<EarthquakeData[]> {
	try {
		return await fetchEarthquakesOrThrow();
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

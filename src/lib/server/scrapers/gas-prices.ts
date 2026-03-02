/**
 * Server-side Google Places API (New) fetcher for gas station fuel prices.
 *
 * Tiles 4 requests across Marin County to work around the 20-result-per-request limit,
 * then deduplicates by Place ID and computes aggregate statistics.
 */

import { getGooglePlacesApiKey } from '$lib/server/api-keys';
import type { FuelPrice, GasStation, GasPriceSnapshot } from '$lib/types/gas';

const PLACES_URL = 'https://places.googleapis.com/v1/places:searchNearby';

const FIELD_MASK = [
	'places.id',
	'places.displayName',
	'places.formattedAddress',
	'places.location',
	'places.fuelOptions'
].join(',');

/** 4 tile centers covering Marin County with 15km radii */
const TILE_CENTERS = [
	{ label: 'Novato', lat: 38.11, lon: -122.57 },
	{ label: 'San Rafael', lat: 37.97, lon: -122.53 },
	{ label: 'Mill Valley', lat: 37.87, lon: -122.52 },
	{ label: 'West Marin', lat: 38.07, lon: -122.8 }
];

const TILE_RADIUS_METERS = 15000;

interface GoogleMoney {
	currencyCode?: string;
	units?: string;
	nanos?: number;
}

interface GoogleFuelPrice {
	type?: string;
	price?: GoogleMoney;
	updateTime?: string;
}

interface GooglePlace {
	id?: string;
	displayName?: { text?: string; languageCode?: string };
	formattedAddress?: string;
	location?: { latitude?: number; longitude?: number };
	fuelOptions?: {
		fuelPrices?: GoogleFuelPrice[];
	};
}

interface GoogleSearchResponse {
	places?: GooglePlace[];
}

/** Convert Google Money format (units + nanos) to a dollar float */
export function parseGoogleMoney(money: GoogleMoney | undefined): number | null {
	if (!money) return null;
	const units = parseInt(money.units ?? '0', 10) || 0;
	const nanos = money.nanos ?? 0;
	const total = units + nanos / 1e9;
	return total > 0 ? Math.round(total * 1000) / 1000 : null;
}

/** Fetch a single tile of gas stations from Google Places */
async function fetchTile(
	apiKey: string,
	center: { lat: number; lon: number }
): Promise<GooglePlace[]> {
	const body = {
		includedTypes: ['gas_station'],
		maxResultCount: 20,
		locationRestriction: {
			circle: {
				center: { latitude: center.lat, longitude: center.lon },
				radius: TILE_RADIUS_METERS
			}
		}
	};

	const response = await fetch(PLACES_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-Goog-Api-Key': apiKey,
			'X-Goog-FieldMask': FIELD_MASK
		},
		body: JSON.stringify(body)
	});

	if (!response.ok) {
		const text = await response.text().catch(() => '');
		throw new Error(`Google Places API error ${response.status}: ${text.slice(0, 200)}`);
	}

	const data = (await response.json()) as GoogleSearchResponse;
	return data.places ?? [];
}

/** Convert a GooglePlace to our GasStation type */
function toGasStation(place: GooglePlace): GasStation | null {
	if (!place.id || !place.location?.latitude || !place.location?.longitude) return null;

	const fuelPrices: FuelPrice[] = [];
	for (const fp of place.fuelOptions?.fuelPrices ?? []) {
		const price = parseGoogleMoney(fp.price);
		if (!fp.type || price === null) continue;
		fuelPrices.push({
			type: fp.type as FuelPrice['type'],
			price,
			updateTime: fp.updateTime
		});
	}

	if (fuelPrices.length === 0) return null;

	return {
		placeId: place.id,
		name: place.displayName?.text ?? 'Unknown Station',
		address: place.formattedAddress ?? '',
		lat: place.location.latitude,
		lon: place.location.longitude,
		fuelPrices,
		updateTime: fuelPrices[0]?.updateTime
	};
}

/** Compute average of non-null values, or null if none */
function avg(values: number[]): number | null {
	if (values.length === 0) return null;
	return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000;
}

/** Extract prices for a given fuel type from all stations */
function pricesForType(stations: GasStation[], type: FuelPrice['type']): number[] {
	return stations
		.map((s) => s.fuelPrices.find((fp) => fp.type === type)?.price)
		.filter((p): p is number => p !== undefined && p !== null);
}

/** Scrape gas prices from Google Places API across Marin County */
export async function scrapeGasPrices(): Promise<GasPriceSnapshot> {
	const apiKey = getGooglePlacesApiKey();
	if (!apiKey) {
		throw new Error('GOOGLE_PLACES_API_KEY not configured');
	}

	// Fetch all tiles in parallel
	const tileResults = await Promise.allSettled(
		TILE_CENTERS.map((center) => fetchTile(apiKey, center))
	);

	// Flatten and dedup by Place ID
	const seenIds = new Set<string>();
	const stations: GasStation[] = [];

	for (const result of tileResults) {
		if (result.status !== 'fulfilled') {
			console.warn('[gas-prices] Tile fetch failed:', result.reason);
			continue;
		}
		for (const place of result.value) {
			const station = toGasStation(place);
			if (!station || seenIds.has(station.placeId)) continue;
			seenIds.add(station.placeId);
			stations.push(station);
		}
	}

	const regularPrices = pricesForType(stations, 'REGULAR_UNLEADED');
	const midgradePrices = pricesForType(stations, 'MIDGRADE');
	const premiumPrices = pricesForType(stations, 'PREMIUM');
	const dieselPrices = pricesForType(stations, 'DIESEL');

	return {
		timestamp: new Date().toISOString(),
		stationCount: stations.length,
		avgRegular: avg(regularPrices),
		avgMidgrade: avg(midgradePrices),
		avgPremium: avg(premiumPrices),
		avgDiesel: avg(dieselPrices),
		minRegular: regularPrices.length > 0 ? Math.min(...regularPrices) : null,
		maxRegular: regularPrices.length > 0 ? Math.max(...regularPrices) : null,
		stations
	};
}

/**
 * Server-side NREL AFDC + Open Charge Map fetcher for EV charging stations.
 *
 * Tiles 4 requests across Marin County at 10-mile radius, deduplicates by NREL station ID,
 * then enriches with OCM pricing via proximity matching (haversine < 50m).
 */

import { getNrelApiKey, getOpenChargeMapApiKey } from '$lib/server/api-keys';
import type {
	ConnectorType,
	ChargingLevel,
	EvConnector,
	ChargingStation,
	EvChargingSnapshot
} from '$lib/types/ev-charging';

const NREL_BASE = 'https://developer.nrel.gov/api/alt-fuel-stations/v1.json';

/** 4 tile centers covering Marin County with 10-mile radii */
const TILE_CENTERS = [
	{ label: 'Novato', lat: 38.11, lon: -122.57 },
	{ label: 'San Rafael', lat: 37.97, lon: -122.53 },
	{ label: 'Mill Valley', lat: 37.87, lon: -122.52 },
	{ label: 'West Marin', lat: 38.07, lon: -122.8 }
];

const TILE_RADIUS_MILES = 10;

interface NrelStation {
	id?: number;
	station_name?: string;
	street_address?: string;
	city?: string;
	state?: string;
	zip?: string;
	latitude?: number;
	longitude?: number;
	ev_network?: string;
	ev_connector_types?: string[];
	ev_level1_evse_num?: number;
	ev_level2_evse_num?: number;
	ev_dc_fast_num?: number;
	access_days_time?: string;
	status_code?: string;
	updated_at?: string;
	ev_network_web?: string;
}

interface NrelResponse {
	fuel_stations?: NrelStation[];
	total_results?: number;
}

interface OcmStation {
	ID?: number;
	AddressInfo?: {
		Latitude?: number;
		Longitude?: number;
	};
	UsageCost?: string;
}

/** Normalize NREL connector type strings to our ConnectorType enum */
export function normalizeConnectorType(raw: string): ConnectorType {
	const upper = raw.toUpperCase();
	if (upper === 'J1772') return 'J1772';
	if (upper === 'J1772COMBO' || upper === 'CCS') return 'CCS';
	if (upper === 'CHADEMO') return 'CHAdeMO';
	if (upper === 'TESLA' || upper === 'NACS') return 'NACS';
	return 'OTHER';
}

// Import from shared geo utility (also re-export for existing consumers)
import { haversineDistance } from '$lib/geo/proximity';
export { haversineDistance };

/** Fetch a single tile of EV stations from NREL AFDC */
async function fetchNrelTile(
	apiKey: string,
	center: { lat: number; lon: number }
): Promise<NrelStation[]> {
	const params = new URLSearchParams({
		api_key: apiKey,
		fuel_type: 'ELEC',
		state: 'CA',
		latitude: String(center.lat),
		longitude: String(center.lon),
		radius: String(TILE_RADIUS_MILES),
		limit: '200',
		status: 'E'
	});

	const response = await fetch(`${NREL_BASE}?${params}`);
	if (!response.ok) {
		const text = await response.text().catch(() => '');
		throw new Error(`NREL API error ${response.status}: ${text.slice(0, 200)}`);
	}

	const data = (await response.json()) as NrelResponse;
	return data.fuel_stations ?? [];
}

/** Fetch OCM stations for pricing enrichment */
async function fetchOcmStations(apiKey: string): Promise<OcmStation[]> {
	const params = new URLSearchParams({
		key: apiKey,
		latitude: '37.97',
		longitude: '-122.53',
		distance: '25',
		distanceunit: 'Miles',
		maxresults: '500',
		compact: 'true',
		verbose: 'false'
	});

	try {
		const response = await fetch(`https://api.openchargemap.io/v3/poi?${params}`);
		if (!response.ok) return [];
		return (await response.json()) as OcmStation[];
	} catch {
		return [];
	}
}

/** Convert an NREL station to our ChargingStation type */
function toChargingStation(station: NrelStation): ChargingStation | null {
	if (!station.id || !station.latitude || !station.longitude) return null;

	const connectors: EvConnector[] = [];
	const connectorTypes = station.ev_connector_types ?? [];

	for (const raw of connectorTypes) {
		const type = normalizeConnectorType(raw);
		const existing = connectors.find((c) => c.type === type);
		if (existing) {
			existing.count++;
		} else {
			connectors.push({ type, count: 1 });
		}
	}

	const level2Count = station.ev_level2_evse_num ?? 0;
	const dcFastCount = station.ev_dc_fast_num ?? 0;
	const totalPorts = level2Count + dcFastCount;

	const chargingLevels: ChargingLevel[] = [];
	if (level2Count > 0) chargingLevels.push('Level2');
	if (dcFastCount > 0) chargingLevels.push('DCFast');

	const addressParts = [station.street_address, station.city, station.state, station.zip].filter(
		Boolean
	);

	return {
		stationId: String(station.id),
		name: station.station_name ?? 'Unknown Station',
		address: addressParts.join(', '),
		lat: station.latitude,
		lon: station.longitude,
		network: station.ev_network ?? 'Unknown',
		connectors,
		level2Count,
		dcFastCount,
		totalPorts,
		chargingLevels,
		accessInfo: station.access_days_time,
		status: station.status_code,
		updateTime: station.updated_at
	};
}

/** Scrape EV charging stations from NREL AFDC + OCM across Marin County */
export async function scrapeEvCharging(): Promise<EvChargingSnapshot> {
	const nrelKey = getNrelApiKey();
	if (!nrelKey) {
		throw new Error('NREL_API_KEY not configured');
	}

	// Fetch all NREL tiles in parallel
	const tileResults = await Promise.allSettled(
		TILE_CENTERS.map((center) => fetchNrelTile(nrelKey, center))
	);

	// Flatten and dedup by station ID
	const seenIds = new Set<string>();
	const stations: ChargingStation[] = [];
	const failures: string[] = [];

	for (let i = 0; i < tileResults.length; i++) {
		const result = tileResults[i];
		if (result.status !== 'fulfilled') {
			const msg = `Tile ${TILE_CENTERS[i].label} failed: ${result.reason}`;
			console.error('[ev-charging]', msg);
			failures.push(msg);
			continue;
		}
		console.log(`[ev-charging] Tile ${TILE_CENTERS[i].label}: ${result.value.length} stations`);
	}

	if (failures.length === tileResults.length) {
		throw new Error(`All NREL tile fetches failed: ${failures.join('; ')}`);
	}

	for (const result of tileResults) {
		if (result.status !== 'fulfilled') continue;
		for (const raw of result.value) {
			const station = toChargingStation(raw);
			if (!station || seenIds.has(station.stationId)) continue;
			seenIds.add(station.stationId);
			stations.push(station);
		}
	}

	// OCM enrichment for pricing
	const ocmKey = getOpenChargeMapApiKey();
	if (ocmKey) {
		const ocmStations = await fetchOcmStations(ocmKey);
		for (const ocm of ocmStations) {
			if (!ocm.UsageCost || !ocm.AddressInfo?.Latitude || !ocm.AddressInfo?.Longitude) continue;
			// Proximity match to closest NREL station within 50m
			let bestDist = Infinity;
			let bestStation: ChargingStation | null = null;
			for (const station of stations) {
				const dist = haversineDistance(
					station.lat,
					station.lon,
					ocm.AddressInfo.Latitude,
					ocm.AddressInfo.Longitude
				);
				if (dist < 50 && dist < bestDist) {
					bestDist = dist;
					bestStation = station;
				}
			}
			if (bestStation && !bestStation.pricingInfo) {
				bestStation.pricingInfo = ocm.UsageCost;
			}
		}
	}

	// Compute aggregates
	const networkBreakdown: Record<string, number> = {};
	const connectorBreakdown: Partial<Record<ConnectorType, number>> = {};
	let dcFastStationCount = 0;
	let level2StationCount = 0;
	let totalPorts = 0;

	for (const station of stations) {
		networkBreakdown[station.network] = (networkBreakdown[station.network] ?? 0) + 1;
		if (station.dcFastCount > 0) dcFastStationCount++;
		if (station.level2Count > 0) level2StationCount++;
		totalPorts += station.totalPorts;

		for (const connector of station.connectors) {
			connectorBreakdown[connector.type] =
				(connectorBreakdown[connector.type] ?? 0) + connector.count;
		}
	}

	return {
		timestamp: new Date().toISOString(),
		stationCount: stations.length,
		dcFastStationCount,
		level2StationCount,
		totalPorts,
		networkBreakdown,
		connectorBreakdown,
		stations
	};
}

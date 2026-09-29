/**
 * CAL FIRE active incidents adapter
 *
 * Fetches active wildfire incidents from CAL FIRE GeoJSON API.
 * Also fetches NIFC/WFIGS data for federal-jurisdiction fires.
 * Free, no auth required.
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import { isNearMarin } from '$lib/geo/proximity';
import { MARIN_CENTER } from '$lib/config/towns';

export interface FireIncident {
	id: string;
	name: string;
	location: string;
	county: string;
	acres: number;
	containment: number;
	lat: number;
	lon: number;
	startDate: number;
	updatedDate: number;
	url: string;
	source: 'CAL FIRE' | 'NIFC';
	isActive: boolean;
}

const CALFIRE_URL = '/api/calfire';

/** Bounding box of isNearMarin's 80 km circle (~111 km/° lat, ~85 km/° lon). */
const NIFC_RADIUS_KM = 80;
const NIFC_ENVELOPE = [
	MARIN_CENTER.lon - NIFC_RADIUS_KM / 85,
	MARIN_CENTER.lat - NIFC_RADIUS_KM / 111,
	MARIN_CENTER.lon + NIFC_RADIUS_KM / 85,
	MARIN_CENTER.lat + NIFC_RADIUS_KM / 111
].join(',');

// NIFC/WFIGS — current (active) incidents inside an envelope around Marin
// (~80 km, matching isNearMarin). The YearToDate layer rarely sets
// FireOutDateTime, so it cannot tell active fires from long-out ones.
const NIFC_URL =
	'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query?' +
	new URLSearchParams({
		where: "POOState='US-CA'",
		geometry: NIFC_ENVELOPE,
		geometryType: 'esriGeometryEnvelope',
		inSR: '4326',
		spatialRel: 'esriSpatialRelIntersects',
		outSR: '4326',
		outFields:
			'IrwinID,IncidentName,POOCounty,IncidentSize,DiscoveryAcres,PercentContained,FireDiscoveryDateTime,ModifiedOnDateTime_dt',
		resultRecordCount: '200',
		f: 'json'
	});

interface CalFireFeature {
	type: 'Feature';
	properties: {
		UniqueId: string;
		Name: string;
		Location: string;
		County: string;
		AcresBurned: number | null;
		PercentContained: number | null;
		Started: string;
		Updated: string;
		Url: string;
		IsActive: string;
	};
	geometry: {
		type: 'Point';
		coordinates: [number, number];
	} | null;
}

interface NifcFeature {
	attributes: {
		IrwinID: string;
		IncidentName: string;
		POOCounty: string;
		IncidentSize: number | null;
		DiscoveryAcres: number | null;
		PercentContained: number | null;
		FireDiscoveryDateTime: number | null;
		ModifiedOnDateTime_dt: number | null;
	};
	/** Point of origin in WGS84 (outSR=4326). */
	geometry: { x: number; y: number } | null;
}

/**
 * Fetch active fire incidents near Marin County from CAL FIRE.
 */
async function fetchCalFire(): Promise<FireIncident[]> {
	try {
		const response = await fetchWithTimeout(CALFIRE_URL, {
			headers: { Accept: 'application/json' }
		});

		if (!response.ok) {
			throw new Error(`CAL FIRE API failed: ${response.status}`);
		}

		const data = await response.json();
		const features: CalFireFeature[] = data.features ?? [];

		return features
			.filter((f) => {
				if (!f.geometry) return false;
				const [lon, lat] = f.geometry.coordinates;
				return isNearMarin(lat, lon);
			})
			.map((f) => ({
				id: `calfire-${f.properties.UniqueId}`,
				name: f.properties.Name,
				location: f.properties.Location,
				county: f.properties.County,
				acres: f.properties.AcresBurned ?? 0,
				containment: f.properties.PercentContained ?? 0,
				lat: f.geometry!.coordinates[1],
				lon: f.geometry!.coordinates[0],
				startDate: new Date(f.properties.Started).getTime(),
				updatedDate: new Date(f.properties.Updated).getTime(),
				url: f.properties.Url || 'https://www.fire.ca.gov/incidents',
				source: 'CAL FIRE' as const,
				isActive: f.properties.IsActive === 'true'
			}));
	} catch (error) {
		logger.warn('CAL FIRE', `Fetch failed: ${(error as Error).message}`);
		return [];
	}
}

/**
 * Fetch active fire incidents from NIFC/WFIGS (federal fires).
 */
async function fetchNifc(): Promise<FireIncident[]> {
	try {
		const response = await fetchWithTimeout(NIFC_URL, {
			headers: { Accept: 'application/json' }
		});

		if (!response.ok) {
			throw new Error(`NIFC API failed: ${response.status}`);
		}

		const data = await response.json();
		// ArcGIS reports query errors (e.g. a renamed field) as HTTP 200 + `error`.
		if (data.error) throw new Error(`NIFC query rejected: ${data.error.message}`);
		const features: NifcFeature[] = data.features ?? [];

		return features
			.filter((f) => f.geometry != null && isNearMarin(f.geometry.y, f.geometry.x))
			.map((f) => ({
				id: `nifc-${f.attributes.IrwinID}`,
				name: f.attributes.IncidentName,
				location: f.attributes.POOCounty ?? '',
				county: f.attributes.POOCounty ?? '',
				acres: f.attributes.IncidentSize ?? f.attributes.DiscoveryAcres ?? 0,
				containment: f.attributes.PercentContained ?? 0,
				lat: f.geometry!.y,
				lon: f.geometry!.x,
				startDate: f.attributes.FireDiscoveryDateTime ?? Date.now(),
				updatedDate: f.attributes.ModifiedOnDateTime_dt ?? Date.now(),
				url: 'https://inciweb.wildfire.gov/',
				source: 'NIFC' as const,
				isActive: true
			}));
	} catch (error) {
		logger.warn('NIFC', `Fetch failed: ${(error as Error).message}`);
		return [];
	}
}

/** In-flight dedup: concurrent callers share the same request */
let fireInflight: Promise<FireIncident[]> | null = null;

/**
 * Fetch all active fire incidents from both CAL FIRE and NIFC,
 * deduplicated by proximity (within 5km = likely same fire).
 */
export async function fetchFireIncidents(): Promise<FireIncident[]> {
	if (fireInflight) return fireInflight;
	fireInflight = fetchFireIncidentsInner().finally(() => {
		fireInflight = null;
	});
	return fireInflight;
}

async function fetchFireIncidentsInner(): Promise<FireIncident[]> {
	const [calfire, nifc] = await Promise.all([fetchCalFire(), fetchNifc()]);

	// Deduplicate: prefer CAL FIRE data, drop NIFC if within 5km of a CAL FIRE incident
	const combined = [...calfire];
	for (const nifcFire of nifc) {
		const isDuplicate = calfire.some((cf) => {
			const dLat = Math.abs(cf.lat - nifcFire.lat) * 111;
			const dLon = Math.abs(cf.lon - nifcFire.lon) * 85;
			return Math.sqrt(dLat ** 2 + dLon ** 2) < 5;
		});
		if (!isDuplicate) combined.push(nifcFire);
	}

	logger.log('Fire', `${combined.length} active incidents near Marin`);
	return combined;
}

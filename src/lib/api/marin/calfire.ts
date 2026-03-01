/**
 * CAL FIRE active incidents adapter
 *
 * Fetches active wildfire incidents from CAL FIRE GeoJSON API.
 * Also fetches NIFC/WFIGS data for federal-jurisdiction fires.
 * Free, no auth required.
 */

import { logger } from '$lib/config/api';

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

const CALFIRE_URL =
	'https://incidents.fire.ca.gov/umbraco/api/IncidentApi/GeoJsonList?inactive=false';

// NIFC/WFIGS — California active fire locations
const NIFC_URL =
	"https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Incident_Locations_YearToDate/FeatureServer/0/query?where=attr_POOState='US-CA'&outFields=*&f=json&resultRecordCount=50";

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
		DailyAcres: number | null;
		IncidentSize: number | null;
		PercentContained: number | null;
		FireDiscoveryDateTime: number | null;
		ModifiedOnDateTime_dt: number | null;
		POOLatitude: number | null;
		POOLongitude: number | null;
	};
}

function isNearMarin(lat: number, lon: number, radiusKm = 80): boolean {
	// Quick check: is it within ~80km of central Marin (37.97, -122.53)?
	const dLat = Math.abs(lat - 37.97);
	const dLon = Math.abs(lon - -122.53);
	// ~111km per degree lat, ~85km per degree lon at this latitude
	const approxKm = Math.sqrt((dLat * 111) ** 2 + (dLon * 85) ** 2);
	return approxKm <= radiusKm;
}

/**
 * Fetch active fire incidents near Marin County from CAL FIRE.
 */
async function fetchCalFire(): Promise<FireIncident[]> {
	try {
		const response = await fetch(CALFIRE_URL, {
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
		const response = await fetch(NIFC_URL, {
			headers: { Accept: 'application/json' }
		});

		if (!response.ok) {
			throw new Error(`NIFC API failed: ${response.status}`);
		}

		const data = await response.json();
		const features: NifcFeature[] = data.features ?? [];

		return features
			.filter((f) => {
				const lat = f.attributes.POOLatitude;
				const lon = f.attributes.POOLongitude;
				if (lat == null || lon == null) return false;
				return isNearMarin(lat, lon);
			})
			.map((f) => ({
				id: `nifc-${f.attributes.IrwinID}`,
				name: f.attributes.IncidentName,
				location: f.attributes.POOCounty ?? '',
				county: f.attributes.POOCounty ?? '',
				acres: f.attributes.DailyAcres ?? f.attributes.IncidentSize ?? 0,
				containment: f.attributes.PercentContained ?? 0,
				lat: f.attributes.POOLatitude!,
				lon: f.attributes.POOLongitude!,
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

/**
 * Fetch all active fire incidents from both CAL FIRE and NIFC,
 * deduplicated by proximity (within 5km = likely same fire).
 */
export async function fetchFireIncidents(): Promise<FireIncident[]> {
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

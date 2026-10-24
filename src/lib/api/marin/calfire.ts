/**
 * CAL FIRE active incidents adapter
 *
 * Fetches active wildfire incidents from CAL FIRE GeoJSON API.
 * Also fetches NIFC/WFIGS data for federal-jurisdiction fires.
 * Free, no auth required.
 */

import { logger } from '$lib/config/api';
import { fetchWithTimeout, type OwnerOptions } from './fetch-helpers';
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
	/** Discovery and last-modified times; null when the upstream doesn't report them. */
	startDate: number | null;
	updatedDate: number | null;
	url: string;
	source: 'CAL FIRE' | 'NIFC';
	isActive: boolean;
	/** Contained or controlled, and when: not out, so still drawn (MAPFRESH1). */
	settled: { label: 'contained' | 'controlled'; at: number } | null;
}

/** v2's incident: acreage and containment stay null when the upstream doesn't report them. */
export type V2Fire = Omit<FireIncident, 'acres' | 'containment'> & {
	acres: number | null;
	containment: number | null;
};

/** A listing discovered longer ago than this, with no size and no containment, is stale (MAPFRESH1). */
export const STALE_LISTING_MS = 14 * 86_400_000;

/** A listing not drawn as a fire because it is stale: said as data, never as an all-clear. */
export interface HiddenFire {
	id: string;
	name: string;
	source: FireIncident['source'];
	discoveredAt: number;
}

/** One upstream record and what its own source says about it, before eligibility. */
interface Listing {
	fire: V2Fire;
	/** The source says it's over: CAL FIRE's IsActive false, NIFC's FireOutDateTime. */
	out: boolean;
	/** Any size, a reported 0 included. */
	sized: boolean;
	/** Any containment: a percentage, or a contained or controlled date. */
	contained: boolean;
}

/** A finite time, else null: an unknown date stays unknown. */
const known = (t: number | null | undefined) =>
	typeof t === 'number' && Number.isFinite(t) ? t : null;

/** Per source, before the dedupe: an excluded record never suppresses an eligible one. */
function judge(
	listings: readonly Listing[],
	now: number
): { fires: V2Fire[]; hidden: HiddenFire[] } {
	const fires: V2Fire[] = [];
	const hidden: HiddenFire[] = [];
	for (const { fire, out, sized, contained } of listings) {
		if (out) continue;
		const found = fire.startDate;
		if (!sized && !contained && found !== null && now - found > STALE_LISTING_MS)
			hidden.push({ id: fire.id, name: fire.name, source: fire.source, discoveredAt: found });
		else fires.push(fire);
	}
	return { fires, hidden };
}

/** A 200 whose body has no features array establishes nothing about fires. */
function featuresOf<T>(data: { features?: unknown }, label: string): T[] {
	if (!Array.isArray(data?.features)) throw new Error(`${label} response has no features array`);
	return data.features as T[];
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
			'IrwinID,IncidentName,POOCounty,IncidentSize,DiscoveryAcres,PercentContained,FireDiscoveryDateTime,ModifiedOnDateTime_dt,FireOutDateTime,ContainmentDateTime,ControlDateTime',
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
		FireOutDateTime: number | null;
		ContainmentDateTime: number | null;
		ControlDateTime: number | null;
	};
	/** Point of origin in WGS84 (outSR=4326). */
	geometry: { x: number; y: number } | null;
}

/** CAL FIRE's listings near Marin County; throws on any failure. */
async function readCalFire(signal?: AbortSignal): Promise<Listing[]> {
	const response = await fetchWithTimeout(CALFIRE_URL, {
		headers: { Accept: 'application/json' },
		signal
	});

	if (!response.ok) {
		throw new Error(`CAL FIRE API failed: ${response.status}`);
	}

	const data = await response.json();
	const features = featuresOf<CalFireFeature>(data, 'CAL FIRE');

	return features
		.filter((f) => {
			if (!f.geometry) return false;
			const [lon, lat] = f.geometry.coordinates;
			return isNearMarin(lat, lon);
		})
		.map((f) => {
			const p = f.properties;
			return {
				fire: {
					id: `calfire-${p.UniqueId}`,
					name: p.Name,
					location: p.Location,
					county: p.County,
					acres: p.AcresBurned ?? null,
					containment: p.PercentContained ?? null,
					lat: f.geometry!.coordinates[1],
					lon: f.geometry!.coordinates[0],
					startDate: known(Date.parse(p.Started)),
					updatedDate: known(Date.parse(p.Updated)),
					url: p.Url || 'https://www.fire.ca.gov/incidents',
					source: 'CAL FIRE' as const,
					isActive: p.IsActive === 'true',
					settled: null
				},
				out: p.IsActive !== 'true',
				sized: p.AcresBurned != null,
				contained: p.PercentContained != null
			};
		});
}

/** NIFC/WFIGS (federal) listings near Marin; throws on any failure. */
async function readNifc(signal?: AbortSignal): Promise<Listing[]> {
	const response = await fetchWithTimeout(NIFC_URL, {
		headers: { Accept: 'application/json' },
		signal
	});

	if (!response.ok) {
		throw new Error(`NIFC API failed: ${response.status}`);
	}

	const data = await response.json();
	// ArcGIS reports query errors (e.g. a renamed field) as HTTP 200 + `error`.
	if (data.error) throw new Error(`NIFC query rejected: ${data.error.message}`);
	const features = featuresOf<NifcFeature>(data, 'NIFC');

	return features
		.filter((f) => f.geometry != null && isNearMarin(f.geometry.y, f.geometry.x))
		.map((f) => {
			const a = f.attributes;
			const controlled = known(a.ControlDateTime);
			const containedAt = known(a.ContainmentDateTime);
			return {
				fire: {
					id: `nifc-${a.IrwinID}`,
					name: a.IncidentName,
					location: a.POOCounty ?? '',
					county: a.POOCounty ?? '',
					acres: a.IncidentSize ?? a.DiscoveryAcres ?? null,
					containment: a.PercentContained ?? null,
					lat: f.geometry!.y,
					lon: f.geometry!.x,
					startDate: known(a.FireDiscoveryDateTime),
					updatedDate: known(a.ModifiedOnDateTime_dt),
					url: 'https://inciweb.wildfire.gov/',
					source: 'NIFC' as const,
					isActive: a.FireOutDateTime == null,
					settled:
						controlled !== null
							? { label: 'controlled' as const, at: controlled }
							: containedAt !== null
								? { label: 'contained' as const, at: containedAt }
								: null
				},
				out: a.FireOutDateTime != null,
				sized: a.IncidentSize != null || a.DiscoveryAcres != null,
				contained: a.PercentContained != null || containedAt !== null || controlled !== null
			};
		});
}

/** The legacy, swallowing form: a failure reads as no incidents. */
async function swallowing(label: string, read: () => Promise<Listing[]>): Promise<Listing[]> {
	try {
		return await read();
	} catch (error) {
		logger.warn(label, `Fetch failed: ${(error as Error).message}`);
		return [];
	}
}

/** Each source judged on its own, then merged: the fires to draw and the listings hidden. */
function eligible(calfire: readonly Listing[], nifc: readonly Listing[], now: number) {
	const c = judge(calfire, now);
	const n = judge(nifc, now);
	return { fires: mergeIncidents(c.fires, n.fires), hidden: [...c.hidden, ...n.hidden] };
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
	const [calfire, nifc] = await Promise.all([
		swallowing('CAL FIRE', () => readCalFire()),
		swallowing('NIFC', () => readNifc())
	]);
	// Legacy (and the TV) draw only eligible fires; an unreported metric reads as 0.
	const combined = eligible(calfire, nifc, Date.now()).fires.map((f) => ({
		...f,
		acres: f.acres ?? 0,
		containment: f.containment ?? 0
	}));
	logger.log('Fire', `${combined.length} active incidents near Marin`);
	return combined;
}

/** A fire read the v2 dashboard can vouch for, stamped with the time it was checked. */
export interface FireRead {
	fires: V2Fire[];
	/** Stale listings, not drawn (MAPFRESH1): said wherever fires are counted. */
	hidden: HiddenFire[];
	checkedAt: number;
}

/**
 * v2 Outdoors: both upstreams, or a throw. "None near" needs both to have
 * answered, so a failure is never an empty list (fetchFireIncidents is unchanged).
 */
export async function readFireIncidentsOrThrow({
	signal,
	now = Date.now
}: OwnerOptions & { now?: () => number } = {}): Promise<FireRead> {
	const [calfire, nifc] = await Promise.all([readCalFire(signal), readNifc(signal)]);
	const checkedAt = now();
	return { ...eligible(calfire, nifc, checkedAt), checkedAt };
}

function mergeIncidents<F extends { lat: number; lon: number }>(calfire: F[], nifc: F[]): F[] {
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
	return combined;
}

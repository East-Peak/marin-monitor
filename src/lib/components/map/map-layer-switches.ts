/**
 * Optional layers and owner-supplied data for the shared map. Legacy `/` and `/tv` keep every
 * layer and read the shared stores (the defaults). The v2 preview switches off what nothing
 * owns or vouches for (keyword pulses, airports, 511 traffic, the gas/EV/coffee/fitness places)
 * and hands the map its own data, so no value an earlier owner left in a shared store is drawn.
 */
import type { MapLayer, NewsItem } from '$lib/types';
import { buildAlertPulseFeatures } from './map-data';

export interface MapLayerSwitches {
	alertPulses: boolean;
	airports: boolean;
	trafficEvents: boolean;
}

export interface OwnedLayerData {
	/** Bumped by the owner on every change; echoed back by onSynced. */
	revision: number;
	news: readonly NewsItem[];
	threeOneOne: readonly NewsItem[];
	/** What was kept after a failure: news per item id; 311 and quakes per part. */
	retained: { news: ReadonlySet<string>; threeOneOne: boolean; earthquakes: boolean };
}

export const OWNED_MAP_LAYERS: readonly MapLayer[] = [
	'news',
	'safety',
	'civic',
	'activity',
	'housing',
	'311',
	'satire'
];

export function alertPulseFeatures(
	enabled: boolean,
	...args: Parameters<typeof buildAlertPulseFeatures>
): GeoJSON.Feature[] {
	return enabled ? buildAlertPulseFeatures(...args) : [];
}

export function optionalReads(s: Pick<MapLayerSwitches, 'airports' | 'trafficEvents'>) {
	return { traffic: s.trafficEvents, airports: s.airports };
}

export function trafficVisibility(
	enabled: boolean,
	showCongestion: boolean,
	showEvents: boolean
): { congestion: 'visible' | 'none'; events: 'visible' | 'none' } {
	const vis = (on: boolean) => (enabled && on ? 'visible' : 'none');
	return { congestion: vis(showCongestion), events: vis(showEvents) };
}

export function layerItems(
	owned: OwnedLayerData | undefined,
	pick: (d: OwnedLayerData) => readonly NewsItem[],
	store: () => readonly NewsItem[]
): readonly NewsItem[] {
	return owned ? pick(owned) : store();
}

export function placeLayersOn(owned: OwnedLayerData | undefined): boolean {
	return owned === undefined;
}

export function markRetained(
	features: GeoJSON.Feature[],
	isRetained: (f: GeoJSON.Feature) => boolean
): GeoJSON.Feature[] {
	return features.map((f) =>
		isRetained(f) ? { ...f, properties: { ...f.properties, retained: true } } : f
	);
}

export function syncCounts(
	sets: Record<string, readonly GeoJSON.Feature[]>
): Record<string, number> {
	const out: Record<string, number> = {};
	for (const [id, features] of Object.entries(sets)) {
		out[id] = features.length;
		out[`${id}:retained`] = features.filter((f) => f.properties?.retained === true).length;
	}
	return out;
}

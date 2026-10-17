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
	/** v2's data layers (MAPX2b), drawn as given: each empty when off or unavailable. */
	places?: Readonly<Record<OwnedPlace, readonly GeoJSON.Feature[]>>;
}

/** Each owned data layer's shared MapLibre source. */
export const OWNED_PLACE_SOURCES = {
	traffic: 'traffic-events',
	fire: 'fire-incidents',
	gas: 'gas-stations',
	ev: 'ev-charging-stations',
	coffee: 'coffee-shops'
} as const;
export type OwnedPlace = keyof typeof OWNED_PLACE_SOURCES;

/** The parts of a MapLibre map the owned places touch (a fake in tests). */
export interface PlacesTarget {
	getStyle(): { layers?: readonly { id: string; source?: unknown }[] } | undefined;
	getSource(id: string): { setData(data: GeoJSON.FeatureCollection): unknown } | undefined;
	setLayoutProperty(id: string, prop: 'visibility', value: 'visible'): unknown;
}

/**
 * Draw v2's data layers from the owner's features and show every layer on their sources (an
 * empty list draws nothing; the owner says why). Returns each source's feature count.
 */
export function applyOwnedPlaces(
	map: PlacesTarget,
	places: NonNullable<OwnedLayerData['places']>
): Record<string, number> {
	const counts: Record<string, number> = {};
	const layers = map.getStyle()?.layers ?? [];
	for (const [place, source] of Object.entries(OWNED_PLACE_SOURCES)) {
		const features = [...places[place as OwnedPlace]];
		map.getSource(source)?.setData({ type: 'FeatureCollection', features });
		for (const l of layers)
			if (l.source === source) map.setLayoutProperty(l.id, 'visibility', 'visible');
		counts[source] = features.length;
	}
	return counts;
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

const AIRPORT_LAYERS = ['airports-layer', 'airports-hit-layer', 'airports-label'] as const;

/** The parts of a MapLibre map the airport switch touches (a fake in tests). */
export interface AirportSwitchTarget {
	getLayer(id: string): unknown;
	getSource(id: string): { setData(data: GeoJSON.FeatureCollection): unknown } | undefined;
	setLayoutProperty(id: string, prop: 'visibility', value: 'none'): unknown;
}

/**
 * Airports off: clear the pins setupSources seeds ("Loading…") and hide all three layers, so
 * nothing is drawn or clickable (Codex 9a2 #1). Run after every source setup. On: untouched.
 */
export function applyAirportSwitch(map: AirportSwitchTarget, enabled: boolean): void {
	if (enabled) return;
	map.getSource('airports')?.setData({ type: 'FeatureCollection', features: [] });
	for (const id of AIRPORT_LAYERS) {
		if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
	}
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

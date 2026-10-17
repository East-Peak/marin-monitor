/**
 * The v2 map's data layers beyond news, 311 and quakes (MAPX2b): traffic, fire, gas, EV and
 * coffee. Each is read through its own dataset's status entry, so a failed read is
 * "unavailable" with nothing drawn and no count, never a silent blank or a zero; a value
 * kept after a failure is drawn and says so. Airports, fitness and landmarks stay off: no
 * honest status, or no value on this map.
 */
import type { Detail } from '$lib/components/dashboard-v2/DetailContent.svelte';
import type { TrafficCorridorsData } from '$lib/api/marin/traffic-corridors';
import type { FireRead } from '$lib/api/marin/calfire';
import type { CoffeeIndexData } from '$lib/types/coffee';
import type { EvChargingData } from '$lib/types/ev-charging';
import type { GasPriceData } from '$lib/types/gas';
import { findNearestTown } from '$lib/geo/proximity';
import {
	buildCoffeeShopFeatures,
	buildEvStationFeatures,
	buildGasStationFeatures
} from '$lib/components/map/map-data';
import { formatCoffeePrice, getCoffeeHeadlinePrice } from '$lib/utils/coffee-index';
import { measuredFromEntry } from './measured';
import { formatAsOf } from './pacific-time';
import { datasetEntry, type DatasetFetch } from './source-adapters';
import { DATASET_POLICY } from './dataset-policy';
import { TRAFFIC_MAX_AGE_MS } from './getting-around';
import { OUTDOORS_MAX_AGE_MS } from './outdoors';

const DAY_MS = 86_400_000;
/** Each layer's freshness rule: its section's for traffic and fire, G0a's for the places. */
const MAX_AGE_MS: Record<DataLayerId, number> = {
	traffic: TRAFFIC_MAX_AGE_MS,
	fire: OUTDOORS_MAX_AGE_MS,
	gas: DATASET_POLICY.gas.maxAgeDays * DAY_MS,
	ev: DATASET_POLICY.ev.maxAgeDays * DAY_MS,
	coffee: DATASET_POLICY.coffee.maxAgeDays * DAY_MS
};

export type DataLayerId = 'traffic' | 'fire' | 'gas' | 'ev' | 'coffee';

export const DATA_LAYERS: readonly {
	id: DataLayerId;
	name: string;
	/** The dataset whose status entry vouches for the layer. */
	dataset: string;
	source: string;
	defaultOn: boolean;
	swatch: string;
}[] = [
	{
		id: 'traffic',
		name: 'Traffic',
		dataset: 'traffic',
		source: '511',
		defaultOn: true,
		swatch: '#f97316'
	},
	{
		id: 'fire',
		name: 'Fire',
		dataset: 'fires',
		source: 'CAL FIRE + NIFC',
		defaultOn: true,
		swatch: '#dc2626'
	},
	{
		id: 'gas',
		name: 'Gas prices',
		dataset: 'gas',
		source: 'Google Places',
		defaultOn: true,
		swatch: '#22c55e'
	},
	{
		id: 'ev',
		name: 'EV chargers',
		dataset: 'ev',
		source: 'NREL AFDC',
		defaultOn: false,
		swatch: '#06b6d4'
	},
	{
		id: 'coffee',
		name: 'Coffee',
		dataset: 'coffee',
		source: 'Marin Coffee Index',
		defaultOn: false,
		swatch: '#a16207'
	}
];

export function defaultDataLayers(): Record<DataLayerId, boolean> {
	return Object.fromEntries(DATA_LAYERS.map((l) => [l.id, l.defaultOn])) as Record<
		DataLayerId,
		boolean
	>;
}

export interface LayerPoint {
	/** The raw id; namespaced by the layer when listed or selected. */
	id: string;
	lon: number;
	lat: number;
	title: string;
	at: number | null;
	detail: Detail;
	/** Properties the shared MapLibre layer styles and clicks read (with `itemId`). */
	props: Record<string, unknown>;
}

export interface DataLayerView {
	id: DataLayerId;
	name: string;
	source: string;
	swatch: string;
	on: boolean;
	state: 'loading' | 'value' | 'unknown' | 'unavailable';
	asOf: number | null;
	/** "Kept from …" when the value outlived a failed read. */
	kept: string | null;
	/** What the layer can't place, e.g. "2 events without a location". */
	note: string | null;
	/** The drawn points: empty when off or not a value. */
	points: LayerPoint[];
	/** Features drawn; null whenever the read can't vouch for a number. */
	count: number | null;
}

interface Values {
	traffic: TrafficCorridorsData | null;
	fire: FireRead | null;
	gas: GasPriceData | null;
	ev: EvChargingData | null;
	coffee: CoffeeIndexData | null;
}

const ms = (iso: string | null | undefined) => {
	const t = iso ? Date.parse(iso) : NaN;
	return Number.isFinite(t) ? t : null;
};
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
/** 511's own severity, in the shared layer's words; a closure reads as the most severe. */
const SEVERITY = { Major: 'MAJOR', Moderate: 'MODERATE', Minor: 'MINOR' } as const;

function pointsOf(
	id: DataLayerId,
	values: Values,
	time: (t: number) => string
): { points: LayerPoint[]; note: string | null; complete?: boolean } {
	switch (id) {
		case 'traffic': {
			const marin = (values.traffic?.events ?? []).filter((e) => e.marin);
			const unplaced = marin.filter((e) => e.at === null).length;
			const points = marin.flatMap((e): LayerPoint[] => {
				if (!e.at) return [];
				const at = ms(e.reportedAt);
				const severity = e.closed ? 'SEVERE' : e.severity ? SEVERITY[e.severity] : 'UNKNOWN';
				return [
					{
						id: e.id,
						lon: e.at[0],
						lat: e.at[1],
						title: `${e.kind} · ${e.road}`,
						at,
						props: {
							id: e.id,
							itemId: e.id,
							title: `${e.kind} · ${e.road}`,
							type: e.kind,
							severity,
							source: '511'
						},
						detail: {
							title: `${e.kind} · ${e.road}`,
							meta: [
								'511',
								e.closed ? 'Road closed' : (e.severity ?? 'Severity not given'),
								...(at !== null ? [time(at)] : [])
							],
							paragraphs: [e.where, e.lanes ?? ''].filter(Boolean),
							empty: '511 gives no location words.',
							source: { label: 'Open 511 traffic', href: 'https://511.org/traffic' }
						}
					}
				];
			});
			const unread = values.traffic?.unreadable ?? 0;
			const notes = [
				unplaced ? `${plural(unplaced, 'event')} without a location` : null,
				unread ? `${plural(unread, 'record')} 511 could not read` : null
			].filter(Boolean);
			// Records 511 sent that we can't read leave the count incomplete: no number then.
			return { points, note: notes.length ? notes.join(' · ') : null, complete: unread === 0 };
		}
		case 'fire':
			return {
				note: null,
				points: (values.fire?.fires ?? []).map((f) => ({
					id: f.id,
					lon: f.lon,
					lat: f.lat,
					title: `${f.name} Fire`,
					at: Number.isFinite(f.updatedDate) ? f.updatedDate : null,
					props: {
						id: f.id,
						itemId: f.id,
						name: f.name,
						acres: f.acres,
						containment: f.containment,
						url: f.url,
						source: f.source
					},
					detail: {
						title: `${f.name} Fire`,
						meta: [
							f.source,
							f.acres === null ? 'Acreage not reported' : `${f.acres.toLocaleString()} acres`,
							f.containment === null ? 'Containment not reported' : `${f.containment}% contained`
						],
						paragraphs: f.location ? [f.location] : [],
						source: f.url ? { label: `Open on ${f.source}`, href: f.url } : null
					}
				}))
			};
		case 'gas':
			return {
				note: null,
				points: (values.gas?.current?.stations ?? []).map((s) => {
					const price = s.fuelPrices.find((p) => p.type === 'REGULAR_UNLEADED')?.price;
					return {
						id: s.placeId,
						lon: s.lon,
						lat: s.lat,
						title: s.name,
						at: ms(s.updateTime),
						props: { ...buildGasStationFeatures([s], null)[0]?.properties, itemId: s.placeId },
						detail: {
							title: s.name,
							meta: [
								'Google Places',
								price === undefined ? 'Price not reported' : `Regular $${price.toFixed(3)}`
							],
							paragraphs: s.address ? [s.address] : [],
							source: null
						}
					};
				})
			};
		case 'ev':
			return {
				note: null,
				points: (values.ev?.current?.stations ?? []).map((s) => ({
					id: s.stationId,
					lon: s.lon,
					lat: s.lat,
					title: s.name,
					at: ms(s.updateTime),
					props: { ...buildEvStationFeatures([s])[0]?.properties, itemId: s.stationId },
					detail: {
						title: s.name,
						meta: ['NREL AFDC', s.network, s.dcFastCount > 0 ? 'DC Fast' : 'Level 2'].filter(
							Boolean
						),
						paragraphs: [s.address, s.pricingInfo ?? ''].filter(Boolean),
						source: null
					}
				}))
			};
		case 'coffee':
			return {
				note: null,
				points: (values.coffee?.current?.shops ?? []).map((s) => {
					const headline = getCoffeeHeadlinePrice(s);
					return {
						id: s.id,
						lon: s.lon,
						lat: s.lat,
						title: s.name,
						at: null,
						props: { ...buildCoffeeShopFeatures([s], null)[0]?.properties, itemId: s.id },
						detail: {
							title: s.name,
							meta: [
								'Marin Coffee Index',
								headline
									? `${headline.label}: ${formatCoffeePrice(headline.price)}`
									: 'Price not tracked yet'
							],
							paragraphs: s.address ? [s.address] : [],
							source: null
						}
					};
				})
			};
	}
}

export function v2DataLayers(input: {
	on: Readonly<Record<DataLayerId, boolean>>;
	/** The registry's dataset outcomes (traffic and fires have no entry in the shared list). */
	outcomes: Readonly<Record<string, DatasetFetch>>;
	values: Values;
	town: string | null;
	now: number;
}): Record<DataLayerId, DataLayerView> {
	const { on, outcomes, values, town, now } = input;
	const out = {} as Record<DataLayerId, DataLayerView>;
	for (const layer of DATA_LAYERS) {
		const entry = datasetEntry(
			layer.dataset,
			layer.source,
			outcomes[layer.dataset],
			MAX_AGE_MS[layer.id]
		);
		const m = measuredFromEntry(
			entry,
			values[layer.id === 'fire' ? 'fire' : layer.id],
			layer.source,
			now
		);
		const value = m.kind === 'value';
		const {
			points,
			note,
			complete = true
		} = value ? pointsOf(layer.id, values, (t) => formatAsOf(t, now)) : { points: [], note: null };
		const shown = on[layer.id]
			? points.filter((p) => !town || findNearestTown(p.lat, p.lon) === town)
			: [];
		out[layer.id] = {
			id: layer.id,
			name: layer.name,
			source: layer.source,
			swatch: layer.swatch,
			on: on[layer.id],
			state: m.kind,
			asOf: value ? m.observedAt : null,
			kept:
				value && m.retainedAfter !== null
					? `Kept from ${m.observedAt === null ? 'an earlier read' : formatAsOf(m.observedAt, now)} · ${m.retainedAfter}`
					: null,
			note,
			points: shown,
			count: value && complete && on[layer.id] ? shown.length : null
		};
	}
	return out;
}

/** A layer's drawn points as GeoJSON for its shared MapLibre source. */
export function layerFeatures(view: Pick<DataLayerView, 'points'>): GeoJSON.Feature[] {
	return view.points.map((p) => ({
		type: 'Feature',
		id: p.id,
		properties: { ...p.props, itemId: p.id },
		geometry: { type: 'Point', coordinates: [p.lon, p.lat] }
	}));
}

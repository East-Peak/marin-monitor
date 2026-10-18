/**
 * The v2 map's data layers beyond news, 311 and quakes (MAPX2b, MAPX2c): traffic, fire, gas,
 * EV, coffee, fitness and airports. Each is read through its own dataset's status entry, so a
 * failed read is "unavailable" with nothing drawn and no count, never a silent blank or a
 * zero; a value kept after a failure is drawn and says so. Airports are Getting Around's
 * reads in its card's words (SFO and OAK, the two it words).
 */
import type { Detail } from '$lib/components/dashboard-v2/DetailContent.svelte';
import type { TrafficCorridorsData } from '$lib/api/marin/traffic-corridors';
import type { FireRead } from '$lib/api/marin/calfire';
import type { CoffeeIndexData } from '$lib/types/coffee';
import type { EvChargingData } from '$lib/types/ev-charging';
import type { GasPriceData } from '$lib/types/gas';
import type { FitnessData } from '$lib/types/fitness';
import type { AirportStatusData } from '$lib/types/airport';
import { AIRPORT_PINS, AIRPORT_STATUS_COLORS } from '$lib/config/map';
import {
	FITNESS_ACCENT,
	TYPE_COLORS as FITNESS_TYPE_COLORS,
	TYPE_LABELS as FITNESS_TYPE_LABELS
} from '$lib/config/fitness';
import { findNearestTown } from '$lib/geo/proximity';
import {
	buildCoffeeShopFeatures,
	buildEvStationFeatures,
	buildFitnessStudioFeatures,
	buildGasStationFeatures
} from '$lib/components/map/map-data';
import { formatCoffeePrice, getCoffeeHeadlinePrice } from '$lib/utils/coffee-index';
import { measuredFromEntry } from './measured';
import { formatAsOf } from './pacific-time';
import { datasetEntry, type DatasetFetch } from './source-adapters';
import { DATASET_POLICY } from './dataset-policy';
import {
	AIRPORT_MAX_AGE_MS,
	TRAFFIC_MAX_AGE_MS,
	airportItems,
	airportWords,
	airportsPart
} from './getting-around';
import { OUTDOORS_MAX_AGE_MS } from './outdoors';
import { CAMERAS } from '$lib/config/cameras';
import { CALTRANS_CAMS, CALTRANS_WEDGE_FOV, directionAz } from '$lib/config/caltrans-cams';
import { ALERT_AXIS_IDS, headingLine, sector, wedgeState, type CamHeading } from './cam-heading';
import type { HeadingsState } from './cam-headings-store';

const DAY_MS = 86_400_000;
/** The cameras' pins and wedges. */
export const CAM_SWATCH = '#38bdf8';
/** A wedge's radius: a display convention, not how far a camera sees. A road cam's is short. */
const WEDGE_KM = 6;
const ROAD_WEDGE_KM = 2;
/** An open camera's frame refreshes this often. */
const FRAME_REFRESH_S = 15;
/** Each layer's freshness rule: its section's for traffic and fire, G0a's for the places. */
const MAX_AGE_MS: Record<DataLayerId, number> = {
	traffic: TRAFFIC_MAX_AGE_MS,
	fire: OUTDOORS_MAX_AGE_MS,
	gas: DATASET_POLICY.gas.maxAgeDays * DAY_MS,
	ev: DATASET_POLICY.ev.maxAgeDays * DAY_MS,
	coffee: DATASET_POLICY.coffee.maxAgeDays * DAY_MS,
	fitness: DATASET_POLICY.fitness.maxAgeDays * DAY_MS,
	airport: AIRPORT_MAX_AGE_MS,
	// Unused: the cams layer is judged by its heading read (camLayer).
	cams: 0
};

export type DataLayerId =
	| 'traffic'
	| 'fire'
	| 'gas'
	| 'ev'
	| 'coffee'
	| 'fitness'
	| 'airport'
	| 'cams';

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
		defaultOn: true,
		swatch: '#06b6d4'
	},
	{
		id: 'coffee',
		name: 'Coffee',
		dataset: 'coffee',
		source: 'Marin Coffee Index',
		defaultOn: true,
		swatch: '#a16207'
	},
	{
		id: 'fitness',
		name: 'Fitness studios',
		dataset: 'fitness',
		source: 'Fitness Drop-in Index',
		defaultOn: true,
		swatch: FITNESS_ACCENT
	},
	{
		id: 'airport',
		name: 'Airports',
		dataset: 'airport',
		source: 'FAA',
		defaultOn: true,
		swatch: AIRPORT_STATUS_COLORS['on-time']
	},
	{
		id: 'cams',
		name: 'Cameras',
		dataset: 'cam-headings',
		source: 'ALERTCalifornia | UC San Diego',
		defaultOn: true,
		swatch: CAM_SWATCH
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
	/** The cams layer's last reported headings (MAPX4), for its wedges. */
	headings?: readonly CamHeading[];
}

interface Values {
	traffic: TrafficCorridorsData | null;
	fire: FireRead | null;
	gas: GasPriceData | null;
	ev: EvChargingData | null;
	coffee: CoffeeIndexData | null;
	fitness: FitnessData | null;
	airport: AirportStatusData | null;
	/** Null until something holds the headings. */
	cams: HeadingsState | null;
}

const ms = (iso: string | null | undefined) => {
	const t = iso ? Date.parse(iso) : NaN;
	return Number.isFinite(t) ? t : null;
};
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
/** 511's own severity, in the shared layer's words; a closure reads as the most severe. */
const SEVERITY = { Major: 'MAJOR', Moderate: 'MODERATE', Minor: 'MINOR' } as const;

function pointsOf(
	id: Exclude<DataLayerId, 'airport' | 'cams'>,
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
		case 'fitness':
			return {
				note: null,
				points: (values.fitness?.current?.studios ?? []).map((s) => ({
					id: s.id,
					lon: s.lon,
					lat: s.lat,
					title: s.name,
					at: null,
					props: {
						...buildFitnessStudioFeatures([s], null, FITNESS_TYPE_LABELS, FITNESS_TYPE_COLORS)[0]
							?.properties,
						itemId: s.id
					},
					detail: {
						title: s.name,
						meta: [
							'Fitness Drop-in Index',
							FITNESS_TYPE_LABELS[s.type],
							`Drop-in $${s.dropInPrice}`
						],
						paragraphs: s.town ? [s.town] : [],
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

/**
 * Airports: Getting Around's own part over the same read, so a pin says what the card says,
 * and "no delays" only from a fresh ok read. Out of date or failed, the card's one line goes in
 * the row and nothing is drawn; a read the card can't call current is drawn but not vouched.
 */
type LayerRead = Pick<DataLayerView, 'state' | 'asOf' | 'kept' | 'note' | 'points'> & {
	/** False when the count can't be vouched for (records unread, a read not current). */
	complete: boolean;
};

function airportLayer(
	fetch: DatasetFetch | undefined,
	data: AirportStatusData | null,
	now: number
): LayerRead {
	const part = airportsPart(fetch, data, now);
	const words = airportWords(part);
	const entry = datasetEntry('airport', 'FAA', fetch, AIRPORT_MAX_AGE_MS);
	const points = words.flatMap(({ code, text, state }): LayerPoint[] => {
		const pin = AIRPORT_PINS.find((p) => p.code === code);
		if (!pin) return [];
		const faa = data?.airports.find((a) => a.code === code)?.status ?? 'unknown';
		const title = `${code} · ${pin.name}`;
		return [
			{
				id: code,
				lon: pin.lon,
				lat: pin.lat,
				title,
				at: entry.observedAt,
				props: {
					code,
					name: pin.name,
					statusLabel: text,
					weatherSummary: '',
					source: 'FAA',
					color: AIRPORT_STATUS_COLORS[state === 'ok' ? faa : 'unknown'],
					itemId: code
				},
				detail: {
					title,
					meta: ['FAA', ...(entry.observedAt === null ? [] : [formatAsOf(entry.observedAt, now)])],
					paragraphs: [text],
					source: { label: 'FAA airport status', href: 'https://nasstatus.faa.gov/' }
				}
			}
		];
	});
	if (!points.length) {
		const [line] = airportItems(part);
		return {
			state: part.state === 'loading' ? 'loading' : 'unavailable',
			asOf: null,
			kept: null,
			note: part.state === 'loading' ? null : (line?.text ?? null),
			points: [],
			complete: false
		};
	}
	return {
		state: 'value',
		asOf: entry.observedAt,
		kept: part.state === 'ok' ? null : 'FAA status not verified',
		note: null,
		points,
		complete: part.state === 'ok'
	};
}

const ALERT_CAMS = CAMERAS.filter(
	(c) => [...ALERT_AXIS_IDS.values()].includes(c.id) && c.lat !== undefined && c.lon !== undefined
);

const CALTRANS = CAMERAS.flatMap((c) => {
	const at = CALTRANS_CAMS[c.id];
	return at ? [{ cam: c, at }] : [];
});

/**
 * The cameras: our own pins, always (the frame opens whatever the heading read did), and the
 * layer judged by ALERTCalifornia's heading read, the only thing it adds. A failed read draws
 * no ridge wedge. Caltrans cams sit where D4 places them, facing their road (MAPX4b).
 */
function camLayer(
	headings: HeadingsState | null,
	now: number
): LayerRead & { headings: CamHeading[] } {
	const read = headings?.state === 'ok' ? headings.read : null;
	const byId = new Map((read?.cams ?? []).map((h) => [h.id, h]));
	const points = ALERT_CAMS.map(
		(c): LayerPoint => ({
			id: c.id,
			lon: c.lon!,
			lat: c.lat!,
			title: c.name,
			at: null,
			props: { itemId: c.id, name: c.name },
			detail: {
				title: c.name,
				meta: [c.source, headingLine(byId.get(c.id), read?.headingAt ?? null, now)],
				image: { src: c.url, alt: `Latest frame from ${c.name}`, refreshS: FRAME_REFRESH_S },
				paragraphs: [],
				empty: 'A live wildfire-detection camera. The wedge on the map is its direction of view.',
				source: { label: 'ALERTCalifornia', href: 'https://alertcalifornia.org/' }
			}
		})
	);
	const roadside = CALTRANS.map(
		({ cam, at }): LayerPoint => ({
			id: cam.id,
			lon: at.lon,
			lat: at.lat,
			title: cam.name,
			at: null,
			props: { itemId: cam.id, name: cam.name },
			detail: {
				title: cam.name,
				meta: [cam.source, `Facing ${at.direction} · approximate (road direction)`],
				image: { src: cam.url, alt: `Latest frame from ${cam.name}`, refreshS: FRAME_REFRESH_S },
				paragraphs: [],
				empty: 'A Caltrans traffic camera on 101.',
				source: { label: 'Caltrans QuickMap', href: 'https://quickmap.dot.ca.gov/' }
			}
		})
	);
	const state = headings === null ? 'loading' : read ? 'value' : headings.state;
	return {
		state: state === 'ok' ? 'value' : state,
		asOf: read?.headingAt ?? null,
		kept: null,
		note:
			state === 'value'
				? 'Wedge: direction of view, not how far it sees · Caltrans wedges are approximate (road direction)'
				: state === 'unavailable'
					? 'ALERTCalifornia directions unavailable; the cameras still open'
					: null,
		points: [...points, ...roadside],
		complete: state === 'value',
		headings: read?.cams ?? []
	};
}

/**
 * The drawn cameras' view wedges: a ridge cam's solid, dashed while sweeping, none when stale; a
 * Caltrans cam's a fixed 60° on its road direction, "approximate".
 */
export function camWedgeFeatures(
	view: Pick<DataLayerView, 'points' | 'headings'>,
	now: number
): GeoJSON.Feature[] {
	const byId = new Map((view.headings ?? []).map((h) => [h.id, h]));
	return view.points.flatMap((p): GeoJSON.Feature[] => {
		const road = CALTRANS_CAMS[p.id];
		if (road)
			return [
				{
					type: 'Feature',
					id: p.id,
					properties: { itemId: p.id, style: 'approximate' },
					geometry: sector(
						[p.lon, p.lat],
						directionAz(road.direction),
						CALTRANS_WEDGE_FOV,
						ROAD_WEDGE_KM
					)
				}
			];
		const h = byId.get(p.id);
		const style = h ? wedgeState(h, now) : null;
		if (!h || !style) return [];
		return [
			{
				type: 'Feature',
				id: p.id,
				properties: { itemId: p.id, style },
				geometry: sector([p.lon, p.lat], h.az!, h.fov!, WEDGE_KM)
			}
		];
	});
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
	const read = (layer: (typeof DATA_LAYERS)[number]): LayerRead => {
		if (layer.id === 'airport') return airportLayer(outcomes.airport, values.airport, now);
		if (layer.id === 'cams') return camLayer(values.cams, now);
		const entry = datasetEntry(
			layer.dataset,
			layer.source,
			outcomes[layer.dataset],
			MAX_AGE_MS[layer.id]
		);
		const m = measuredFromEntry(entry, values[layer.id], layer.source, now);
		if (m.kind !== 'value')
			return { state: m.kind, asOf: null, kept: null, note: null, points: [], complete: false };
		const { points, note, complete = true } = pointsOf(layer.id, values, (t) => formatAsOf(t, now));
		return {
			state: 'value',
			asOf: m.observedAt,
			kept:
				m.retainedAfter !== null
					? `Kept from ${m.observedAt === null ? 'an earlier read' : formatAsOf(m.observedAt, now)} · ${m.retainedAfter}`
					: null,
			note,
			points,
			complete
		};
	};
	for (const layer of DATA_LAYERS) {
		const r = read(layer);
		// An airport is in no Marin town: a town choice doesn't hide it.
		const inTown = (p: LayerPoint) =>
			!town || layer.id === 'airport' || findNearestTown(p.lat, p.lon) === town;
		const shown = on[layer.id] ? r.points.filter(inTown) : [];
		out[layer.id] = {
			id: layer.id,
			name: layer.name,
			source: layer.source,
			swatch: layer.swatch,
			on: on[layer.id],
			state: r.state,
			asOf: r.asOf,
			kept: r.kept,
			note: r.note,
			points: shown,
			count: r.state === 'value' && r.complete && on[layer.id] ? shown.length : null,
			...('headings' in r ? { headings: r.headings as CamHeading[] } : {})
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

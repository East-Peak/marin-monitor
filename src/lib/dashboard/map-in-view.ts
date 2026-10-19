/**
 * The map's in-view list (MAPX2, the Zillow pattern): every owned feature inside the part of
 * the map the reader can see, newest first within each layer. Built from our own arrays, not
 * queryRenderedFeatures, so it is deterministic. Placement follows the map's own rules: a
 * street pin only where the item has coordinates, otherwise its town circle; never invented.
 */
import type { Detail } from '$lib/components/dashboard-v2/DetailContent.svelte';
import type { NewsItem } from '$lib/types';
import type { DataLayerView } from './v2-map-layers';
import type { MapPlace } from './map-place';

export type InViewLayer =
	| 'news'
	| '311'
	| 'quake'
	| 'traffic'
	| 'fire'
	| 'gas'
	| 'ev'
	| 'coffee'
	| 'fitness'
	| 'airport'
	| 'cams'
	| 'shows'
	| 'blotter';
/** List order: one group per layer. */
const LAYER_ORDER: readonly InViewLayer[] = [
	'news',
	'shows',
	'blotter',
	'311',
	'quake',
	'traffic',
	'fire',
	'gas',
	'ev',
	'coffee',
	'fitness',
	'airport',
	'cams'
];

export interface InViewItem {
	/** Namespaced, e.g. `311:seeclickfix-901`; the selection and dedupe key. */
	id: string;
	layer: InViewLayer;
	title: string;
	/** Newest first within a layer; null sorts last. */
	at: number | null;
	lon: number;
	lat: number;
	detail: Detail;
	/** Kept-after-failure note from the owner, shown with the detail. */
	note?: string | null;
	/** A group's heading (a venue, a town): listed, not counted (NEWSPIN1). */
	heading?: true;
	/** The layer's own order; absent, newest first. */
	rank?: number;
}

export interface Bounds {
	west: number;
	south: number;
	east: number;
	north: number;
}

export const selectionId = (layer: InViewLayer, raw: string) => `${layer}:${raw}`;

/**
 * The bounds the reader can see: the map's bounds minus the docked panel on the right.
 * Longitude is linear in screen x under Web Mercator, so the trim is exact.
 */
export function visibleBounds(b: Bounds, mapWidthPx: number, panelPx: number): Bounds {
	if (mapWidthPx <= 0 || panelPx <= 0) return b;
	const share = Math.max(0, mapWidthPx - panelPx) / mapWidthPx;
	return { ...b, east: b.west + (b.east - b.west) * share };
}

/**
 * The centre that keeps the geography still when the right padding changes (PANELSTEADY1).
 * MapLibre holds the centre at the middle of the padded viewport, so a padding change slides
 * the map by half the change; moving the centre by that half, in degrees, cancels it. Exact for
 * the north-up map: longitude is linear in screen x, and nothing moves vertically.
 */
export function steadyCenter(
	center: { lng: number; lat: number },
	zoom: number,
	fromRightPx: number,
	toRightPx: number
): { lng: number; lat: number } {
	if (fromRightPx === toRightPx) return center;
	const degPerPx = 360 / (512 * 2 ** zoom);
	return { lng: center.lng + ((fromRightPx - toRightPx) / 2) * degPerPx, lat: center.lat };
}

const inside = (b: Bounds) => (i: InViewItem) =>
	i.lon >= b.west && i.lon <= b.east && i.lat >= b.south && i.lat <= b.north;

export function inView(items: readonly InViewItem[], bounds: Bounds): InViewItem[] {
	const seen = new Set<string>();
	const kept = items.filter(inside(bounds)).filter((i) => !seen.has(i.id) && seen.add(i.id));
	const rank = (i: InViewItem) => LAYER_ORDER.indexOf(i.layer);
	return kept.sort(
		(a, b) =>
			rank(a) - rank(b) ||
			(a.rank ?? 0) - (b.rank ?? 0) ||
			(b.at ?? -Infinity) - (a.at ?? -Infinity)
	);
}

interface TownPoint {
	name: string;
	lat: number;
	lon: number;
}

const at = (i: NewsItem) => (Number.isFinite(i.timestamp) ? i.timestamp : null);
const pinned = (i: NewsItem) => typeof i.lat === 'number' && typeof i.lon === 'number';

export function inViewItems(input: {
	news: readonly NewsItem[];
	threeOneOne: readonly NewsItem[];
	earthquakes: readonly NewsItem[];
	town: string | null;
	towns: Readonly<Record<string, TownPoint>>;
	notes?: ReadonlyMap<string, string>;
	formatTime?: (ms: number) => string;
	/** Stories placed by their headline (NEWSPIN2): listed at the place, not the town. */
	placed?: ReadonlyMap<string, MapPlace>;
	/** The drawn data layers (MAPX2b): their points as they are on the map. */
	layers?: readonly Pick<DataLayerView, 'id' | 'points' | 'kept'>[];
}): InViewItem[] {
	const { towns, town, notes } = input;
	const time = (i: NewsItem) => {
		const t = at(i);
		return t !== null && input.formatTime ? [input.formatTime(t)] : [];
	};
	const inTown = (i: NewsItem) => !town || i.townSlug === town;
	const out: InViewItem[] = [];
	const push = (
		layer: InViewLayer,
		i: NewsItem,
		point: { lon: number; lat: number },
		detail: Detail
	) =>
		out.push({
			id: selectionId(layer, i.id),
			layer,
			title: i.title,
			at: at(i),
			...point,
			detail,
			note: notes?.get(i.id) ?? null
		});

	for (const i of input.news.filter(inTown)) {
		const home = i.townSlug ? towns[i.townSlug] : undefined;
		const place = pinned(i) ? undefined : input.placed?.get(i.id);
		const point = pinned(i) ? { lon: i.lon!, lat: i.lat! } : (place ?? home);
		if (!point) continue;
		const where = place
			? `${place.label}${place.precision === 'area' ? ' (area)' : ''} · ${place.provenance}`
			: home?.name;
		push(
			'news',
			i,
			{ lon: point.lon, lat: point.lat },
			{
				title: i.title,
				meta: [i.source, ...time(i), ...(where ? [where] : [])],
				paragraphs: i.description ? [i.description] : [],
				empty: 'No excerpt from the source.',
				source: { label: `Read on ${i.source}`, href: i.link }
			}
		);
	}
	for (const i of input.threeOneOne.filter(inTown).filter(pinned)) {
		push(
			'311',
			i,
			{ lon: i.lon!, lat: i.lat! },
			{
				title: i.title,
				meta: ['Fix It Marin', ...time(i)],
				image: i.imageUrl ? { src: i.imageUrl, alt: 'Photo with the Fix It Marin report' } : null,
				paragraphs: i.description ? [i.description] : [],
				source: { label: 'Open on Fix It Marin', href: i.link }
			}
		);
	}
	for (const i of input.earthquakes.filter(pinned)) {
		push(
			'quake',
			i,
			{ lon: i.lon!, lat: i.lat! },
			{
				title: i.title,
				meta: ['USGS', ...time(i)],
				paragraphs: [],
				empty: 'USGS gives no text beyond the magnitude and place.',
				source: { label: 'Open on USGS', href: i.link }
			}
		);
	}
	for (const layer of input.layers ?? [])
		for (const p of layer.points)
			out.push({
				id: selectionId(layer.id, p.id),
				layer: layer.id,
				title: p.title,
				at: p.at,
				lon: p.lon,
				lat: p.lat,
				detail: p.detail,
				note: layer.kept,
				...(p.heading ? { heading: p.heading } : {}),
				...(p.rank === undefined ? {} : { rank: p.rank })
			});
	return out;
}

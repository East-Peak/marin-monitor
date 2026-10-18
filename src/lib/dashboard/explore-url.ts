/**
 * Explore mode's URL (MAPX3): `#z/lat/lng` for the camera, `?layers=a,b&sel=<id>` for what is
 * drawn and what is open. A copied link reopens the same view; a part that doesn't parse is
 * dropped rather than guessed, and the page falls back to its own default for it.
 */
import { LAYER_PREF_IDS, type LayerPrefId } from './section-prefs';
import { DATA_LAYERS } from './v2-map-layers';
import type { InViewLayer } from './map-in-view';
import type { MapLayer } from '$lib/types';

export interface ExploreView {
	zoom: number;
	lat: number;
	lng: number;
}

export interface ExploreState {
	view: ExploreView | null;
	/** The layers switched on, for this visit; null when the URL doesn't say. */
	layers: LayerPrefId[] | null;
	/** A namespaced selection id (`311:<id>`, `news:<id>`, …). */
	sel: string | null;
}

/** What a selection's layer is called when its read fails. */
const SOURCE_NAME: Readonly<Record<InViewLayer, string>> = {
	news: 'The news feed',
	'311': 'Fix It Marin',
	quake: 'USGS',
	...(Object.fromEntries(DATA_LAYERS.map((l) => [l.id, l.source])) as Record<
		(typeof DATA_LAYERS)[number]['id'],
		string
	>)
};

const isPrefId = (id: string): id is LayerPrefId =>
	(LAYER_PREF_IDS as readonly string[]).includes(id);
const layerOf = (sel: string) => sel.slice(0, Math.max(0, sel.indexOf(':'))) as InViewLayer;

function parseView(hash: string): ExploreView | null {
	const parts = hash.replace(/^#/, '').split('/');
	if (parts.length !== 3 || parts.some((p) => p.trim() === '')) return null;
	const [zoom, lat, lng] = parts.map(Number);
	const ok =
		[zoom, lat, lng].every(Number.isFinite) &&
		zoom >= 0 &&
		zoom <= 22 &&
		Math.abs(lat) <= 90 &&
		Math.abs(lng) <= 180;
	return ok ? { zoom, lat, lng } : null;
}

export function parseExplore(url: URL): ExploreState {
	const raw = url.searchParams.get('layers');
	const sel = url.searchParams.get('sel');
	return {
		view: parseView(url.hash),
		layers: raw === null ? null : [...new Set(raw.split(',').filter(isPrefId))],
		sel: sel && layerOf(sel) in SOURCE_NAME ? sel : null
	};
}

const round = (n: number, places: number) => Number(n.toFixed(places));

export function exploreHash(v: ExploreView): string {
	return `#${round(v.zoom, 2)}/${round(v.lat, 5)}/${round(v.lng, 5)}`;
}

/** Commas stay readable; the selection, which can hold anything, is encoded. */
export function exploreSearch(layers: readonly string[], sel: string | null): string {
	const parts = [`layers=${layers.map(encodeURIComponent).join(',')}`];
	if (sel) parts.push(`sel=${encodeURIComponent(sel)}`);
	return `?${parts.join('&')}`;
}

/** The /map link for a state; `keep` carries query params it doesn't own (`?probe`, `utm_*`). */
export function exploreHref(state: ExploreState, keep?: URLSearchParams): string {
	const own =
		state.layers === null
			? state.sel
				? `sel=${encodeURIComponent(state.sel)}`
				: ''
			: exploreSearch(state.layers, state.sel).slice(1);
	const foreign = new URLSearchParams(
		[...(keep ?? [])].filter(([k]) => k !== 'layers' && k !== 'sel')
	).toString();
	const query = [foreign, own].filter(Boolean).join('&');
	return `/map${query ? `?${query}` : ''}${state.view ? exploreHash(state.view) : ''}`;
}

/** The switch that draws a selection; null for earthquakes (no switch) and stories (by category). */
export function selLayer(sel: string): LayerPrefId | null {
	const layer = layerOf(sel);
	return layer !== 'news' && isPrefId(layer) ? layer : null;
}

export type SelOutcome =
	| { kind: 'pending' }
	| { kind: 'found' }
	| { kind: 'missing'; text: string };

/** A URL selection resolves only once its dataset settles, and never errors (MAPX3). */
export function selOutcome(
	sel: string,
	read: { state: 'loading' | 'value' | 'unknown' | 'unavailable'; found: boolean }
): SelOutcome {
	if (read.found) return { kind: 'found' };
	if (read.state === 'loading') return { kind: 'pending' };
	if (read.state === 'value')
		return { kind: 'missing', text: 'That item is no longer in the feed' };
	return { kind: 'missing', text: `${SOURCE_NAME[layerOf(sel)]} is unavailable right now` };
}

/**
 * Every switch that is on, in switch order: a data layer's saved choice over its default, road
 * speeds on unless switched off, and the stories and 311 as the map currently draws them.
 */
export function layersOn(
	prefs: Readonly<Partial<Record<LayerPrefId, boolean>>>,
	activeLayers: Readonly<Partial<Record<MapLayer, boolean>>>
): LayerPrefId[] {
	const dataDefault = new Map(DATA_LAYERS.map((l) => [l.id as string, l.defaultOn]));
	return LAYER_PREF_IDS.filter((id) => {
		const fallback = dataDefault.get(id);
		if (fallback !== undefined) return prefs[id] ?? fallback;
		if (id === 'roads') return prefs.roads ?? true;
		return activeLayers[id as MapLayer] ?? true;
	});
}

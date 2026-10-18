import { describe, expect, it } from 'vitest';
import { CONGESTION_LINE_OPACITY } from './map-layers';
import { applyRoadSpeeds, watchRoadSpeeds, type RoadSpeeds } from './road-speeds';

/** A MapLibre-shaped event source: just the events, the source check and the paint calls. */
function fakeMap() {
	const handlers = new Map<string, Set<(e: Record<string, unknown>) => void>>();
	const layout: Record<string, unknown> = {};
	const paint: Record<string, unknown> = {};
	let loaded = false;
	let ids: string[] = [];
	return {
		layout,
		paint,
		setLoaded: (v: boolean) => (loaded = v),
		setView: (keys: string[]) => (ids = keys),
		tileIds: () => ids,
		fire: (type: string, e: Record<string, unknown> = {}) =>
			handlers.get(type)?.forEach((fn) => fn(e)),
		listeners: () => [...handlers.values()].reduce((n, s) => n + s.size, 0),
		on(type: string, fn: (e: Record<string, unknown>) => void) {
			if (!handlers.has(type)) handlers.set(type, new Set());
			handlers.get(type)!.add(fn);
		},
		off(type: string, fn: (e: Record<string, unknown>) => void) {
			handlers.get(type)?.delete(fn);
		},
		getSource: (id: string) => (id === 'traffic-congestion' ? {} : undefined),
		isSourceLoaded: () => loaded,
		getLayer: (id: string) => (id === 'traffic-congestion-layer' ? {} : undefined),
		setLayoutProperty: (id: string, p: string, v: unknown) => (layout[`${id}.${p}`] = v),
		setPaintProperty: (id: string, p: string, v: unknown) => (paint[`${id}.${p}`] = v)
	};
}
const tile = (key: string) => ({
	sourceId: 'traffic-congestion',
	dataType: 'source',
	tile: { tileID: { key } }
});
const TILE = tile('a');

function watched(start = 1_000) {
	const map = fakeMap();
	let t = start;
	const seen: RoadSpeeds[] = [];
	const w = watchRoadSpeeds(
		map,
		() => t,
		(s) => seen.push(s)
	);
	/** A move to a view of these tiles: each requested, then loaded or failed; then the map idles. */
	const show = (tiles: Record<string, 'ok' | 'error' | 'cached'>) => {
		map.fire('movestart');
		map.setView(Object.keys(tiles));
		for (const [key, outcome] of Object.entries(tiles)) {
			if (outcome === 'cached') continue;
			map.fire('sourcedataloading', tile(key));
			if (outcome === 'ok') map.fire('sourcedata', tile(key));
			else map.fire('error', { ...tile(key), error: new Error('403') });
		}
		map.setLoaded(true);
		map.fire('idle');
	};
	return { map, w, seen, last: () => seen.at(-1)!, tick: (ms: number) => (t += ms), show };
}

describe('watchRoadSpeeds (MAPX2c): a status from the tiles in view', () => {
	it('starts loading, with nothing drawn and no time', () => {
		const { last } = watched();
		expect(last()).toEqual({ state: 'loading', asOf: null, drawn: false });
	});

	it("the view's tiles all loaded: ok, as of the last tile load, and drawn", () => {
		const { last, show } = watched(5_000);
		show({ a: 'ok', b: 'ok' });
		expect(last()).toEqual({ state: 'value', asOf: 5_000, drawn: true });
	});

	it('idle before any tile has loaded is not ok', () => {
		const { map, last } = watched();
		map.setLoaded(true);
		map.fire('idle');
		expect(last().state).toBe('loading');
	});

	it('a failed tile in view is "unavailable" and hides the lines, keeping the last good time', () => {
		const { last, show, tick } = watched(5_000);
		show({ a: 'ok' });
		tick(60_000);
		show({ a: 'cached', b: 'error' });
		expect(last()).toEqual({ state: 'unavailable', asOf: 5_000, drawn: false });
	});

	it('a pan that keeps a failed tile in view stays unavailable, whatever new tiles load (Codex MAPX2c #2)', () => {
		const { last, show } = watched();
		show({ a: 'error' });
		show({ a: 'cached', b: 'ok' });
		expect(last()).toMatchObject({ state: 'unavailable', drawn: false });
	});

	it('a view served from tiles already in hand keeps their verdict', () => {
		const ok = watched();
		ok.show({ a: 'ok' });
		ok.show({ a: 'cached' });
		expect(ok.last()).toMatchObject({ state: 'value', drawn: true });
		const bad = watched();
		bad.show({ a: 'error' });
		bad.show({ a: 'cached' });
		expect(bad.last()).toMatchObject({ state: 'unavailable', drawn: false });
	});

	it('once the failed tile leaves the view, a clean view brings the lines back', () => {
		const { last, show, tick } = watched(5_000);
		show({ a: 'error' });
		tick(1_000);
		show({ b: 'ok' });
		expect(last()).toEqual({ state: 'value', asOf: 6_000, drawn: true });
	});

	it('tiles back from the cache (no events: MapLibre caches only tiles that loaded) count as loaded', () => {
		const { map, last, show } = watched();
		show({ a: 'ok' });
		show({ b: 'ok' });
		map.setView(['a', 'b', 'c']);
		show({ a: 'cached', c: 'ok' });
		expect(last()).toMatchObject({ state: 'value', drawn: true });
	});

	it('a tile that failed and then loaded on a retry is good again', () => {
		const { last, show } = watched();
		show({ a: 'error' });
		show({ a: 'ok' });
		expect(last()).toMatchObject({ state: 'value', drawn: true });
	});

	it('new tiles after an ok view: loading, but the good lines stay drawn meanwhile', () => {
		const { map, last, show } = watched();
		show({ a: 'ok' });
		map.fire('sourcedataloading', tile('b'));
		expect(last()).toMatchObject({ state: 'loading', drawn: true });
	});

	it("other sources' tiles and errors are not this layer's", () => {
		const { map, last } = watched();
		const other = { ...TILE, sourceId: 'openmaptiles' };
		map.fire('sourcedataloading', other);
		map.fire('sourcedata', other);
		map.fire('error', other);
		map.setView(['a']);
		map.setLoaded(true);
		map.fire('idle');
		expect(last().state).toBe('loading');
	});

	it('dispose unbinds', () => {
		const { map, w } = watched();
		w.dispose();
		expect(map.listeners()).toBe(0);
	});

	it('says each change once', () => {
		const { map, seen, show } = watched();
		show({ a: 'ok' });
		map.fire('idle');
		map.fire('idle');
		expect(seen.map((s) => s.state)).toEqual(['loading', 'value']);
	});
});

describe('applyRoadSpeeds', () => {
	it('on and drawn: visible, with the shared opacity', () => {
		const map = fakeMap();
		applyRoadSpeeds(map, true, true);
		expect(map.layout['traffic-congestion-layer.visibility']).toBe('visible');
		expect(map.paint['traffic-congestion-layer.line-opacity']).toEqual(CONGESTION_LINE_OPACITY);
	});
	it('on but not drawn: still loading tiles (visible) with no colour on the roads', () => {
		const map = fakeMap();
		applyRoadSpeeds(map, true, false);
		expect(map.layout['traffic-congestion-layer.visibility']).toBe('visible');
		expect(map.paint['traffic-congestion-layer.line-opacity']).toBe(0);
	});
	it('off: hidden', () => {
		const map = fakeMap();
		applyRoadSpeeds(map, false, true);
		expect(map.layout['traffic-congestion-layer.visibility']).toBe('none');
	});
});

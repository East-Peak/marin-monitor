import { describe, expect, it } from 'vitest';
import {
	exploreHash,
	exploreHref,
	exploreSearch,
	layersOn,
	parseExplore,
	selLayer,
	selOutcome
} from './explore-url';

const at = (path: string) => new URL(path, 'https://marinmonitor.com');

describe('parseExplore', () => {
	it('reads the view from #z/lat/lng and the layers and selection from the query', () => {
		expect(
			parseExplore(at('/map?layers=311,traffic&sel=311:seeclickfix-901#12.5/37.95/-122.5'))
		).toEqual({
			view: { zoom: 12.5, lat: 37.95, lng: -122.5 },
			layers: ['311', 'traffic'],
			sel: '311:seeclickfix-901'
		});
	});

	it('is all null for a bare /map', () => {
		expect(parseExplore(at('/map'))).toEqual({ view: null, layers: null, sel: null });
	});

	it('drops a view that is malformed or off the globe, never guessing a camera', () => {
		for (const hash of [
			'#12/37.9',
			'#a/b/c',
			'#12/95/-122',
			'#12/37.9/-190',
			'#40/37.9/-122.5',
			'#'
		])
			expect(parseExplore(at(`/map${hash}`)).view).toBeNull();
	});

	it('keeps known layer ids only; an empty list means every layer off', () => {
		expect(parseExplore(at('/map?layers=gas,bogus,gas')).layers).toEqual(['gas']);
		expect(parseExplore(at('/map?layers=')).layers).toEqual([]);
	});

	it('ignores a selection that names no layer', () => {
		expect(parseExplore(at('/map?sel=nonsense')).sel).toBeNull();
		expect(parseExplore(at('/map?sel=volcano:1')).sel).toBeNull();
	});
});

describe('writing the URL', () => {
	it('rounds the view so the hash stays short and stable', () => {
		expect(exploreHash({ zoom: 12.4567, lat: 37.951234567, lng: -122.500098765 })).toBe(
			'#12.46/37.95123/-122.5001'
		);
	});

	it('writes layers with readable commas, and the selection only when there is one', () => {
		expect(exploreSearch(['311', 'traffic'], null)).toBe('?layers=311,traffic');
		expect(exploreSearch([], 'news:point-reyes-light:a')).toBe(
			'?layers=&sel=news%3Apoint-reyes-light%3Aa'
		);
	});

	it('round-trips view, layers and selection through one href', () => {
		const state = {
			view: { zoom: 11, lat: 38.05, lng: -122.6 },
			layers: ['fire', '311'] as const,
			sel: 'fire:abc 1'
		};
		const href = exploreHref({ ...state, layers: [...state.layers] });
		expect(href.startsWith('/map?')).toBe(true);
		expect(parseExplore(at(href))).toEqual({ ...state, layers: ['fire', '311'] });
	});

	it('keeps query params it does not own, ahead of its own', () => {
		const keep = new URLSearchParams('probe&layers=gas&utm_source=x&sel=a:1');
		expect(exploreHref({ view: null, layers: ['311'], sel: null }, keep)).toBe(
			'/map?probe=&utm_source=x&layers=311'
		);
	});

	it('leaves out what it does not know', () => {
		expect(exploreHref({ view: null, layers: null, sel: null })).toBe('/map');
	});
});

describe('selLayer', () => {
	it('names the switch that draws a selection, or null when no switch does', () => {
		expect(selLayer('311:seeclickfix-901')).toBe('311');
		expect(selLayer('traffic:t1')).toBe('traffic');
		expect(selLayer('gas:place-9')).toBe('gas');
		// Earthquakes have no switch; a story's switch is its category, unknown from the id.
		expect(selLayer('quake:usgs-nc1')).toBeNull();
		expect(selLayer('news:point-reyes-light:a')).toBeNull();
	});
});

describe('selOutcome', () => {
	it('waits while its dataset is still loading', () => {
		expect(selOutcome('311:1', { state: 'loading', found: false, settled: true })).toEqual({
			kind: 'pending'
		});
	});

	it('shows the item once found', () => {
		expect(selOutcome('311:1', { state: 'value', found: true, settled: true })).toEqual({
			kind: 'found'
		});
	});

	it('says the source is unavailable, by name, when its read failed', () => {
		expect(selOutcome('311:1', { state: 'unavailable', found: false, settled: true })).toEqual({
			kind: 'missing',
			text: 'Fix It Marin is unavailable right now'
		});
		expect(selOutcome('traffic:t1', { state: 'unknown', found: false, settled: true })).toEqual({
			kind: 'missing',
			text: '511 is unavailable right now'
		});
	});

	it('a value that is not yet the settled read (a seed, a retained copy) proves nothing absent', () => {
		expect(selOutcome('news:x', { state: 'value', found: false, settled: false })).toEqual({
			kind: 'pending'
		});
	});

	it('names the saved town when the item is in the feed but outside it', () => {
		expect(
			selOutcome('311:1', { state: 'value', found: false, settled: true, outside: 'Novato' })
		).toEqual({
			kind: 'missing',
			text: 'That item is outside Novato. Choose All of Marin to see it.'
		});
	});

	it('says the item has gone when the read is fine but the id is absent', () => {
		expect(selOutcome('quake:usgs-zz', { state: 'value', found: false, settled: true })).toEqual({
			kind: 'missing',
			text: 'That item is no longer in the feed'
		});
	});
});

describe('layersOn', () => {
	it('a saved story choice wins over the map store (a direct /map load has a fresh store)', () => {
		expect(layersOn({ news: false, '311': false }, {})).not.toContain('news');
		expect(layersOn({ news: false, '311': false }, {})).not.toContain('311');
	});

	it('names every switch that is on: saved data choices over defaults, stories from the map', () => {
		expect(
			layersOn(
				{ ev: true, traffic: false },
				{
					news: true,
					safety: false,
					civic: true,
					activity: true,
					housing: true,
					'311': true,
					satire: false
				}
			)
		).toEqual([
			'fire',
			'gas',
			'ev',
			'airport',
			'roads',
			'news',
			'civic',
			'activity',
			'housing',
			'311'
		]);
	});
});

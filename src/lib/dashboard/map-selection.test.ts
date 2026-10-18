import { describe, expect, it } from 'vitest';
import { clickSelection, featureSelection, flyTarget, resolveSelection } from './map-selection';
import type { InViewItem } from './map-in-view';

const item = (id: string, lon = -122.5, lat = 37.9): InViewItem => ({
	id,
	layer: 'news',
	title: id,
	at: 1,
	lon,
	lat,
	detail: { title: id, meta: [], paragraphs: [], source: null }
});

describe('featureSelection (pin → row)', () => {
	it('names each owned source by its namespaced id', () => {
		expect(featureSelection({ source: 'news-pins', properties: { id: 'a' } })).toBe('news:a');
		expect(
			featureSelection({ source: '311-reports', properties: { itemId: 'seeclickfix-9' } })
		).toBe('311:seeclickfix-9');
		expect(featureSelection({ source: 'earthquakes', properties: { itemId: 'nc1' } })).toBe(
			'quake:nc1'
		);
	});
	it('a feature with no id, or from an unowned source, selects nothing', () => {
		expect(featureSelection({ source: '311-reports', properties: {} })).toBeNull();
		expect(featureSelection({ source: 'landmarks', properties: { id: 'x' } })).toBeNull();
		expect(featureSelection({ source: 'news-pins', properties: null })).toBeNull();
	});
});

describe('flyTarget (row → map)', () => {
	it('flies to the selected item’s point', () => {
		expect(flyTarget([item('news:a', -122.6, 38)], 'news:a')).toEqual([-122.6, 38]);
	});
	it('an id no longer in the data has no target', () => {
		expect(flyTarget([item('news:a')], 'news:gone')).toBeNull();
	});
});

describe('resolveSelection', () => {
	it('keeps the selection while its item is still drawn, even out of view', () => {
		expect(resolveSelection([item('news:a')], 'news:a')?.id).toBe('news:a');
	});
	it('drops back to the list when the item leaves the data', () => {
		expect(resolveSelection([item('news:a')], 'news:b')).toBeNull();
		expect(resolveSelection([item('news:a')], null)).toBeNull();
	});
});

describe('the data layers (MAPX2b)', () => {
	it.each([
		['traffic-events', 'traffic:511.org/1'],
		['fire-incidents', 'fire:511.org/1'],
		['gas-stations', 'gas:511.org/1'],
		['ev-charging-stations', 'ev:511.org/1'],
		['coffee-shops', 'coffee:511.org/1'],
		['fitness-studios', 'fitness:511.org/1'],
		['airports', 'airport:511.org/1']
	])('a hovered %s feature names its row', (source, id) => {
		expect(featureSelection({ source, properties: { itemId: '511.org/1' } })).toBe(id);
	});
	it('a click passes its id through, namespaced by the feature kind', () => {
		expect(clickSelection({ kind: 'traffic-event', itemId: 'x' })).toBe('traffic:x');
		expect(clickSelection({ kind: 'gas-station', itemId: 'p1' })).toBe('gas:p1');
		expect(clickSelection({ kind: '311-report', itemId: 's' })).toBe('311:s');
		expect(clickSelection({ kind: 'earthquake', itemId: 'q' })).toBe('quake:q');
		expect(clickSelection({ kind: 'fitness-studio', itemId: 'y1' })).toBe('fitness:y1');
		expect(clickSelection({ kind: 'airport', itemId: 'SFO' })).toBe('airport:SFO');
		expect(clickSelection({ kind: 'landmark', itemId: 'l' })).toBeNull();
		expect(clickSelection({ kind: 'fire-incident' })).toBeNull();
	});
});

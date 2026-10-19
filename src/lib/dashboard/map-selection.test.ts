import { describe, expect, it } from 'vitest';
import {
	clickSelection,
	deselection,
	featureSelection,
	flyTarget,
	mapEmphasis,
	resolveSelection
} from './map-selection';
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

describe('cameras (MAPX4)', () => {
	it('a pin or a wedge click names the camera', () => {
		expect(clickSelection({ kind: 'camera', itemId: 'alert-tam-east' })).toBe(
			'cams:alert-tam-east'
		);
		for (const source of ['cameras', 'camera-wedges'])
			expect(featureSelection({ source, properties: { itemId: 'alert-tam-east' } })).toBe(
				'cams:alert-tam-east'
			);
	});
});

describe('shows and the blotter (NEWSPIN1)', () => {
	it('a story’s place (NEWSPIN2) names the story’s own row', () => {
		expect(clickSelection({ kind: 'story-place', itemId: 'marin-ij:bay' })).toBe(
			'news:marin-ij:bay'
		);
		expect(
			featureSelection({ source: 'story-places', properties: { itemId: 'marin-ij:bay' } })
		).toBe('news:marin-ij:bay');
	});

	it('a venue dot names its venue row; a town’s count names its town row', () => {
		expect(clickSelection({ kind: 'show-venue', itemId: 'venue:marin-jcc' })).toBe(
			'shows:venue:marin-jcc'
		);
		expect(featureSelection({ source: 'show-venues', properties: { itemId: 'venue:macs' } })).toBe(
			'shows:venue:macs'
		);
		expect(clickSelection({ kind: 'blotter-town', itemId: 'town:kentfield' })).toBe(
			'blotter:town:kentfield'
		);
		expect(
			featureSelection({ source: 'blotter-towns', properties: { itemId: 'town:kentfield' } })
		).toBe('blotter:town:kentfield');
	});

	it('a show’s row flies to its venue’s point', () => {
		const rows = [
			{ ...item('shows:venue:marin-jcc', -122.5231, 37.9994), layer: 'shows' as const },
			{ ...item('shows:event:shows:yoga', -122.5231, 37.9994), layer: 'shows' as const }
		];
		expect(flyTarget(rows, 'shows:event:shows:yoga')).toEqual([-122.5231, 37.9994]);
	});
});

describe('mapEmphasis: what a pick lights (CAMDESEL1)', () => {
	const items = [item('cams:alert-muir-beach', -122.586, 37.863)];

	it('a stale hover alone lights the camera and rings it: why a deselect clears the hover', () => {
		expect(
			mapEmphasis(items, { hovered: 'cams:alert-muir-beach', selected: null, feature: null })
		).toEqual({ ring: [-122.586, 37.863], cams: ['alert-muir-beach'] });
	});

	it('after deselection() of a selection with a stale hover and an inspected camera, nothing is lit or ringed', () => {
		const next = deselection({
			selected: 'cams:alert-muir-beach',
			pending: null,
			hovered: 'cams:alert-muir-beach',
			feature: { kind: 'camera', itemId: 'alert-muir-beach' }
		});
		expect(mapEmphasis(items, next)).toEqual({ ring: null, cams: [] });
		expect(next).toMatchObject({ pending: null, clearUrl: true });
	});

	it('deselection() cancels a linked selection still waiting on its data (Codex CAMDESEL1 #2)', () => {
		const idle = { hovered: null, feature: null, selected: null };
		expect(deselection({ ...idle, pending: 'cams:x' })).toMatchObject({
			pending: null,
			clearUrl: true
		});
	});

	it('deselection() with nothing selected or pending leaves the URL alone', () => {
		expect(
			deselection({ hovered: 'cams:x', feature: null, selected: null, pending: null }).clearUrl
		).toBe(false);
	});

	it("a tablet's inspected camera lights it without a ring", () => {
		const feature = { kind: 'camera', itemId: 'alert-muir-beach' };
		expect(mapEmphasis(items, { hovered: null, selected: null, feature })).toEqual({
			ring: null,
			cams: ['alert-muir-beach']
		});
	});
});

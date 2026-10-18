import { describe, expect, it, vi } from 'vitest';
import { get, readable, writable } from 'svelte/store';
import { createMapFeed, type MapFeedSource } from './map-feed';
import type { LayerPrefId } from './section-prefs';

function source(): MapFeedSource & {
	ensure: ReturnType<typeof vi.fn>;
	release: ReturnType<typeof vi.fn>;
} {
	const none = readable(null);
	const release = vi.fn();
	return {
		release,
		camHeadings: Object.assign(readable({ state: 'loading' as const, read: null }), {
			hold: vi.fn(() => release)
		}),
		ensure: vi.fn(async () => {}),
		snapshot: none,
		fixIt: none,
		earthquakes: readable([]),
		sources: readable([]),
		datasetOutcomes: readable({}),
		traffic: none,
		fires: none,
		airport: none,
		places: { gas: none, ev: none, coffee: none, fitness: none },
		civic: readable({ police: null, nps: null, activity: null }),
		blotter: none
	};
}

function feed(src = source()) {
	const full = writable(false);
	const layers = writable<Partial<Record<LayerPrefId, boolean>>>({});
	const town = writable<string | null>(null);
	const f = createMapFeed(src, {
		full,
		layers,
		town,
		clock: readable(1_000_000),
		activeLayers: readable({})
	});
	return { src, full, layers, town, f };
}

describe('createMapFeed', () => {
	it('draws no data layer and asks for nothing while the whole map is not showing', () => {
		const { src, f } = feed();
		const stop = f.feed.subscribe(() => {});
		expect(Object.values(get(f.feed).dataLayers).every((v) => !v.on)).toBe(true);
		expect(src.ensure).not.toHaveBeenCalled();
		stop();
		f.stop();
	});

	it('once the map shows, an enabled detail layer loads its dataset; a disabled one does not', () => {
		const { src, full, layers, f } = feed();
		layers.set({ fire: false });
		full.set(true);
		expect(src.ensure).toHaveBeenCalledWith('traffic');
		expect(src.ensure).not.toHaveBeenCalledWith('fires');
		f.stop();
	});

	it('follows the layer choices it is given, over each layer default', () => {
		const { full, layers, f } = feed();
		full.set(true);
		layers.set({ ev: true, traffic: false });
		const views = get(f.feed).dataLayers;
		expect(views.ev.on).toBe(true);
		expect(views.traffic.on).toBe(false);
		f.stop();
	});

	it('the Shows layer loads the activity calendar itself, with Events never opened (NEWSPIN1)', () => {
		const { src, full, f } = feed();
		full.set(true);
		expect(src.ensure).toHaveBeenCalledWith('activity');
		f.stop();
	});

	it('the Shows layer switched off asks for no calendar', () => {
		const { src, full, layers, f } = feed();
		layers.set({ shows: false });
		full.set(true);
		expect(src.ensure).not.toHaveBeenCalledWith('activity');
		f.stop();
	});

	it('stops asking once stopped', () => {
		const { src, full, f } = feed();
		f.stop();
		full.set(true);
		expect(src.ensure).not.toHaveBeenCalled();
	});
});

describe('the cams layer holds the headings (MAPX4)', () => {
	it('only while the whole map shows with the layer on: 30 s reads are its to own', () => {
		const { src, full, layers, f } = feed();
		expect(src.camHeadings.hold).not.toHaveBeenCalled();
		full.set(true);
		expect(src.camHeadings.hold).toHaveBeenCalledTimes(1);
		layers.set({ cams: true, ev: false });
		expect(src.camHeadings.hold).toHaveBeenCalledTimes(1);
		layers.set({ cams: false });
		expect(src.release).toHaveBeenCalledTimes(1);
		layers.set({ cams: true });
		expect(src.camHeadings.hold).toHaveBeenCalledTimes(2);
		f.stop();
		expect(src.release).toHaveBeenCalledTimes(2);
	});

	it('its read reaches the layer', () => {
		const { full, f } = feed();
		full.set(true);
		expect(get(f.feed).dataLayers.cams.state).toBe('loading');
		f.stop();
	});
});

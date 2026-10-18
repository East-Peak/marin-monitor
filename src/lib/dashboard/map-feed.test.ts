import { describe, expect, it, vi } from 'vitest';
import { get, readable, writable } from 'svelte/store';
import { createMapFeed, type MapFeedSource } from './map-feed';
import type { LayerPrefId } from './section-prefs';

function source(): MapFeedSource & { ensure: ReturnType<typeof vi.fn> } {
	const none = readable(null);
	return {
		ensure: vi.fn(async () => {}),
		snapshot: none,
		fixIt: none,
		earthquakes: readable([]),
		sources: readable([]),
		datasetOutcomes: readable({}),
		traffic: none,
		fires: none,
		airport: none,
		places: { gas: none, ev: none, coffee: none, fitness: none }
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

	it('stops asking once stopped', () => {
		const { src, full, f } = feed();
		f.stop();
		full.set(true);
		expect(src.ensure).not.toHaveBeenCalled();
	});
});

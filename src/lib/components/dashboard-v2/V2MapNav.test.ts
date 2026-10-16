import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { MARIN_OVERVIEW_BOUNDS } from '$lib/components/map/map-overview';
import V2MapNav from './V2MapNav.svelte';

const HOME = { zoom: 8.73, center: { lng: -122.67, lat: 38.07 } };
const ALL_ON = {
	news: true,
	safety: true,
	civic: true,
	activity: true,
	housing: true,
	satire: true,
	'311': true
};
const OK = { news: 'value', '311': 'value', earthquakes: 'value' } as const;

/** A MapLibre stand-in: a camera, rendered features per layer, events, and a call log. */
function fakeMap() {
	const handlers = new Map<string, Set<() => void>>();
	const calls: string[] = [];
	const map = {
		view: { ...HOME, center: { ...HOME.center } },
		rendered: {
			'towns-layer': [
				{ properties: { slug: 'san-rafael', total: 10 } },
				{ properties: { slug: 'ross', total: 0 } }
			],
			'311-reports-layer': Array.from({ length: 44 }, () => ({ properties: {} })),
			'earthquakes-layer': [] as { properties: Record<string, unknown> }[]
		} as Record<string, { properties: Record<string, unknown> }[]>,
		quakeVisibility: 'visible',
		getZoom: () => map.view.zoom,
		getCenter: () => map.view.center,
		getLayer: (id: string) => (id in map.rendered ? { id } : undefined),
		getLayoutProperty: (id: string) =>
			id === 'earthquakes-layer' ? map.quakeVisibility : undefined,
		queryRenderedFeatures: ({ layers }: { layers: string[] }) =>
			layers.flatMap((l) => map.rendered[l] ?? []),
		fitBounds: vi.fn(() => calls.push('fitBounds')),
		/** The overview fit for the current container size (MapLibre's cameraForBounds). */
		overview: { zoom: HOME.zoom, center: { ...HOME.center } },
		cameraForBounds: () => map.overview,
		on: (e: string, fn: () => void) => {
			if (!handlers.has(e)) handlers.set(e, new Set());
			handlers.get(e)!.add(fn);
		},
		off: (e: string, fn: () => void) => handlers.get(e)?.delete(fn),
		emit: (e: string) => handlers.get(e)?.forEach((fn) => fn()),
		calls
	};
	return map;
}

function mount(props: Partial<{ town: string | null }> = {}) {
	const map = fakeMap();
	const onReset = vi.fn(() => map.calls.push('onReset'));
	const view = render(V2MapNav, {
		props: { town: null, activeLayers: ALL_ON, layers: OK, onReset, ...props },
		context: new Map([['maplibre-map', { getMap: () => map, mapReady: writable(true) }]])
	});
	return { map, onReset, view };
}
const resetButton = () => screen.queryByRole('button', { name: 'All of Marin' });
const keyLines = () =>
	Array.from(document.querySelectorAll('[data-slot="map-key"] li')).map((li) =>
		li.textContent!.replace(/\s+/g, ' ').trim()
	);

describe('V2MapNav: the way back to all of Marin', () => {
	it('no reset on the default county view', async () => {
		mount();
		await tick();
		expect(resetButton()).toBeNull();
	});
	it('zoomed into a street: "All of Marin" appears', async () => {
		const { map } = mount();
		await tick();
		map.view = { zoom: 13, center: { lng: -122.531, lat: 37.9735 } };
		map.emit('moveend');
		await tick();
		expect(resetButton()).not.toBeNull();
	});
	it('a chosen town shows it at once', async () => {
		mount({ town: 'fairfax' });
		await tick();
		expect(resetButton()).not.toBeNull();
	});
	it('clicking it clears the town first, then flies to the default county view', async () => {
		const { map, onReset } = mount({ town: 'fairfax' });
		await tick();
		await fireEvent.click(resetButton()!);
		expect(onReset).toHaveBeenCalledOnce();
		expect(map.calls).toEqual(['onReset', 'fitBounds']);
		expect(map.fitBounds).toHaveBeenCalledWith(
			MARIN_OVERVIEW_BOUNDS,
			expect.objectContaining({ maxZoom: 9.1 })
		);
	});
	it('a resize moves home: back at the new overview fit, the reset hides (Codex nav #1)', async () => {
		const { map } = mount();
		await tick();
		// 1440 → 900: the map is shorter, so the same county fit sits ~0.26 zoom lower.
		map.overview = { zoom: HOME.zoom - 0.26, center: { ...HOME.center } };
		map.emit('resize');
		map.view = { zoom: HOME.zoom - 0.26, center: { ...HOME.center } };
		map.emit('moveend');
		await tick();
		expect(resetButton()).toBeNull();
	});
});

describe('V2MapNav: the key says what each layer shows here', () => {
	it('names each enabled layer’s placement and its in-view count once the map settles', async () => {
		const { map } = mount();
		await tick();
		map.emit('idle');
		await tick();
		expect(keyLines()).toEqual([
			'Stories one circle per town, not street spots · 10 in view, in 1 town circle',
			'Fix It Marin each report at its spot · 44 in view',
			'Earthquakes each epicenter · none in view'
		]);
	});
	it('follows the view: a pan that leaves the circles behind recounts', async () => {
		const { map } = mount();
		await tick();
		map.rendered['towns-layer'] = [];
		map.rendered['311-reports-layer'] = map.rendered['311-reports-layer'].slice(0, 3);
		map.emit('idle');
		await tick();
		expect(keyLines()[0]).toMatch(/· none in view$/);
		expect(keyLines()[1]).toMatch(/· 3 in view$/);
	});
	it('drops earthquakes when their chip hides them', async () => {
		const { map } = mount();
		map.quakeVisibility = 'none';
		map.emit('idle');
		await tick();
		expect(keyLines().map((l) => l.split(' ')[0])).toEqual(['Stories', 'Fix']);
	});
});

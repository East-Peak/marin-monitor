import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import { mapStore } from '$lib/stores/map';
import { news } from '$lib/stores/news';
import type { NewsItem } from '$lib/types';
import MapTooltip from './MapTooltip.svelte';

const context = new Map([['maplibre-map', { getMap: () => null, mapReady: writable(false) }]]);
const item = (id: string, title: string): NewsItem => ({
	id,
	title,
	link: '',
	timestamp: Date.now(),
	source: 's',
	category: 'local',
	verification: 'local_media',
	townSlug: 'novato'
});

afterEach(() => {
	mapStore.hoverTown(null);
	news.setItems('local', []);
});

describe('MapTooltip town hover', () => {
	it('legacy (no items): reads the shared news store', async () => {
		news.setItems('local', [item('s1', 'Store story in Novato')]);
		mapStore.hoverTown('novato');
		render(MapTooltip, { context });
		await tick();
		expect(screen.getByText('Store story in Novato')).toBeTruthy();
	});
	it('an owner’s items replace the shared store (Codex 9b #1)', async () => {
		news.setItems('local', [item('s1', 'Store story in Novato')]);
		mapStore.hoverTown('novato');
		render(MapTooltip, { props: { items: [item('o1', 'Owned story in Novato')] }, context });
		await tick();
		expect(screen.queryByText('Store story in Novato')).toBeNull();
		expect(screen.getByText('Owned story in Novato')).toBeTruthy();
	});
	it('with no vouched coverage an empty town makes no "No active stories" claim', async () => {
		mapStore.hoverTown('novato');
		render(MapTooltip, { props: { items: [], emptyText: null }, context });
		await tick();
		expect(screen.queryByText(/No active stories/)).toBeNull();
	});
});

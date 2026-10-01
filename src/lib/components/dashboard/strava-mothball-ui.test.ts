import { render } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import WireGrid from './WireGrid.svelte';
import MapControls from '$lib/components/map/MapControls.svelte';

// The regular dashboard (/) while Strava is mothballed: no leaderboards panel in
// the wire, and no segments toggle on the map.

describe('regular dashboard without Strava', () => {
	it('the wire has no leaderboards slot', () => {
		const { container } = render(WireGrid, { props: { onFeedback: () => {} } });
		expect(container.querySelector('.wire-slot-leaderboards')).toBeNull();
		expect(
			container.querySelector('#panel-leaderboards, [data-panel-id="leaderboards"]')
		).toBeNull();
	});

	it('the map has no Strava segments toggle', () => {
		const { container } = render(MapControls, {
			context: new Map([['maplibre-map', { getMap: () => null, mapReady: writable(true) }]])
		});
		expect(container.querySelector('.segments-toggle')).toBeNull();
		expect(container.innerHTML).not.toMatch(/strava|segments/i);
	});
});

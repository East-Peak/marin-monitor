import { render } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import WireGrid from './WireGrid.svelte';
import MapControls from '$lib/components/map/MapControls.svelte';

// The regular dashboard (/): the wire's leaderboards panel and the map's
// segments toggle follow the Strava switch, both ways.

const flag = vi.hoisted(() => ({ enabled: false }));
vi.mock('$lib/config/strava', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/config/strava')>()),
	get STRAVA_ENABLED() {
		return flag.enabled;
	}
}));

const renderWire = () => render(WireGrid, { props: { onFeedback: () => {} } }).container;
const renderMapControls = () =>
	render(MapControls, {
		context: new Map([['maplibre-map', { getMap: () => null, mapReady: writable(true) }]])
	}).container;

describe('regular dashboard with Strava off', () => {
	beforeEach(() => {
		flag.enabled = false;
	});

	it('the wire has no leaderboards slot', () => {
		expect(renderWire().querySelector('.wire-slot-leaderboards')).toBeNull();
	});

	it('the map has no Strava segments toggle', () => {
		const container = renderMapControls();
		expect(container.querySelector('.segments-toggle')).toBeNull();
		expect(container.innerHTML).not.toMatch(/strava|segments/i);
	});
});

describe('regular dashboard with Strava on', () => {
	beforeEach(() => {
		flag.enabled = true;
	});

	it('the wire shows the leaderboards slot as before', () => {
		expect(renderWire().querySelector('.wire-slot-leaderboards')).not.toBeNull();
	});

	it('the map shows the Strava segments toggle as before', () => {
		expect(renderMapControls().querySelector('.segments-toggle')?.getAttribute('title')).toMatch(
			/Strava segments/
		);
	});
});

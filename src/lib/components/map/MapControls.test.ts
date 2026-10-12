import { render, screen } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import MapControls from './MapControls.svelte';

const context = new Map([['maplibre-map', { getMap: () => null, mapReady: writable(false) }]]);

describe('MapControls', () => {
	it('legacy default: Traffic and the Gas toggle are offered', () => {
		render(MapControls, { context });
		expect(screen.getByRole('button', { name: /Traffic/ })).toBeTruthy();
		expect(screen.getByRole('button', { name: /^Gas/ })).toBeTruthy();
	});
	it('an owner-driven map offers only its layers and no traffic', () => {
		render(MapControls, { props: { traffic: false, layers: ['news', '311'] }, context });
		expect(screen.queryByRole('button', { name: /Traffic/ })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Gas/ })).toBeNull();
		expect(screen.getByRole('button', { name: /311 Reports/ })).toBeTruthy();
	});
	it('an owner-driven map shows no traffic legend either (Codex 9a2 #3)', () => {
		render(MapControls, { props: { traffic: false, layers: ['news', '311'] }, context });
		expect(screen.queryByText('511 traffic events')).toBeNull();
	});
	it('legacy default: the traffic legend is shown while traffic is on', () => {
		render(MapControls, { context });
		expect(screen.getByText('511 traffic events')).toBeTruthy();
	});
});

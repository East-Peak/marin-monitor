import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import MapGesturePolicy from './MapGesturePolicy.svelte';

// Every MapLibre gesture handler that can claim a touch or wheel (touchPitch included: Codex 9b #5).
const HANDLERS = [
	'dragPan',
	'touchZoomRotate',
	'touchPitch',
	'scrollZoom',
	'doubleClickZoom'
] as const;
function fakeMap() {
	const map: Record<
		string,
		{ enable: ReturnType<typeof vi.fn>; disable: ReturnType<typeof vi.fn>; on: boolean }
	> = {};
	for (const h of HANDLERS) {
		const handler = {
			on: true,
			enable: vi.fn(() => (handler.on = true)),
			disable: vi.fn(() => (handler.on = false))
		};
		map[h] = handler;
	}
	return map;
}
function mount(interactive: boolean, ready = true) {
	const map = fakeMap();
	const mapReady = writable(ready);
	const view = render(MapGesturePolicy, {
		props: { interactive },
		context: new Map([['maplibre-map', { getMap: () => map, mapReady }]])
	});
	return { map, mapReady, view };
}
const states = (map: ReturnType<typeof fakeMap>) => HANDLERS.map((h) => map[h].on);

describe('MapGesturePolicy (phone preview never captures a page scroll)', () => {
	it('collapsed phone preview: every gesture handler is disabled once the map is ready', async () => {
		const { map } = mount(false);
		await tick();
		expect(states(map)).toEqual(HANDLERS.map(() => false));
	});
	it('expanded (or desktop): every handler is enabled', async () => {
		const { map } = mount(true);
		await tick();
		expect(states(map)).toEqual(HANDLERS.map(() => true));
		expect(map.dragPan.disable).not.toHaveBeenCalled();
	});
	it('follows the prop: collapse → expand → collapse', async () => {
		const { map, view } = mount(false);
		await tick();
		await view.rerender({ interactive: true });
		await tick();
		expect(states(map)).toEqual(HANDLERS.map(() => true));
		await view.rerender({ interactive: false });
		await tick();
		expect(states(map)).toEqual(HANDLERS.map(() => false));
	});
	it('waits for the map: nothing is touched before mapReady', async () => {
		const { map, mapReady } = mount(false, false);
		await tick();
		expect(map.dragPan.disable).not.toHaveBeenCalled();
		mapReady.set(true);
		await tick();
		expect(map.dragPan.disable).toHaveBeenCalled();
	});
});

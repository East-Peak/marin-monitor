import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CamWall from './CamWall.svelte';
import { CAMERAS, type CameraConfig } from '$lib/config/cameras';
import type { LoadedFrame, loadFrame } from '$lib/dashboard/cam-frame-loader';

type Load = typeof loadFrame;
const NOW = Date.UTC(2026, 9, 15, 18, 0, 0);
const byId = (id: string) => CAMERAS.find((c) => c.id === id) as CameraConfig;
const frame = (): LoadedFrame => ({
	img: Object.assign(document.createElement('img'), { src: 'https://x/f.jpg' }),
	capturedAt: null
});
const flush = async () => {
	for (let i = 0; i < 4; i++) await Promise.resolve();
	await tick();
};

afterEach(() => cleanup());

describe('CamWall', () => {
	it('a tile shows no <img> until its frame decodes', async () => {
		let resolve!: (f: LoadedFrame | null) => void;
		const load = vi.fn<Load>(() => new Promise((r) => (resolve = r)));
		const { container } = render(CamWall, {
			now: NOW,
			cams: [byId('alert-tam-east')],
			load
		});
		await flush();
		const tile = container.querySelector('[data-camera-id="alert-tam-east"]') as HTMLElement;
		expect(load).toHaveBeenCalledTimes(1);
		expect(tile.querySelector('img')).toBeNull();
		expect(tile.dataset.status).toBe('connecting');
		resolve(frame());
		await flush();
		expect(tile.querySelector('img')).not.toBeNull();
		expect(tile.dataset.status).toBe('live');
	});

	it('renders one titled group per area, South Marin first at span 4', async () => {
		const load = vi.fn<Load>(() => new Promise(() => {}));
		const { container } = render(CamWall, { now: NOW, load });
		await flush();
		const groups = [...container.querySelectorAll('[data-cam-group]')] as HTMLElement[];
		expect(groups.map((g) => g.querySelector('h3')!.textContent!.trim())).toEqual([
			'South Marin',
			'Central Marin',
			'West Marin',
			'North Marin',
			'101 traffic'
		]);
		expect(groups[0].dataset.span).toBe('4');
		expect(container.querySelectorAll('[data-camera-id]')).toHaveLength(21);
	});
});

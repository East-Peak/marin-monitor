// src/lib/components/tv/screens/TvCameraTile.test.ts
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TvCameraTile from './TvCameraTile.svelte';
import { rememberFrame, resetFrameCache } from '../camera-frame';
import type { CameraConfig } from '$lib/config/cameras';

const cam: CameraConfig = {
	id: 'alert-tam-east',
	name: 'Mt. Tam East',
	location: 'Mt. Tamalpais',
	category: 'fire',
	type: 'image',
	url: 'https://cams.test/tam.jpg',
	refreshInterval: 10,
	source: 'ALERTCalifornia',
	order: 1
};

let clock = Date.parse('2026-09-28T20:00:05.000Z');
const now = () => clock;
const flush = async () => {
	await Promise.resolve();
	await Promise.resolve();
	await tick();
};

beforeEach(() => {
	vi.useFakeTimers();
	resetFrameCache();
	clock = Date.parse('2026-09-28T20:00:05.000Z');
});
afterEach(() => vi.useRealTimers());

const root = (c: HTMLElement) => c.querySelector('[data-camera-id]') as HTMLElement;

describe('TvCameraTile', () => {
	it('shows "Connecting" (not "offline") while the first frame loads', async () => {
		const preload = vi.fn(() => new Promise<boolean>(() => {}));
		const { container } = render(TvCameraTile, { cam, preload, now });
		await flush();
		expect(root(container).dataset.status).toBe('connecting');
		expect(container.textContent).toContain('Connecting');
		expect(container.textContent).not.toMatch(/offline/i);
		expect(container.querySelector('img')).toBeNull();
	});

	it('swaps in the frame only after preload succeeds, with the exact preloaded URL', async () => {
		const preload = vi.fn<(url: string) => Promise<boolean>>(async () => true);
		const { container } = render(TvCameraTile, { cam, preload, now });
		await flush();
		const url = preload.mock.calls[0][0];
		expect(container.querySelector('img')?.getAttribute('src')).toBe(url);
		expect(root(container).dataset.status).toBe('live');
	});

	it('keeps the last good frame and goes stale (never blank/offline) when the network drops', async () => {
		let ok = true;
		const preload = vi.fn(async () => ok);
		const { container } = render(TvCameraTile, { cam, preload, now });
		await flush();
		const firstSrc = container.querySelector('img')?.getAttribute('src');
		ok = false;
		for (let i = 0; i < 8; i++) {
			clock += 10_000;
			vi.advanceTimersByTime(10_000);
			await flush();
		}
		expect(container.querySelector('img')?.getAttribute('src')).toBe(firstSrc);
		expect(root(container).dataset.status).toBe('stale');
		expect(container.textContent).not.toMatch(/offline/i);
	});

	it('shows offline only after repeated failures with no frame, then recovers', async () => {
		let ok = false;
		const preload = vi.fn(async () => ok);
		const { container } = render(TvCameraTile, { cam, preload, now });
		await flush();
		clock += 10_000;
		vi.advanceTimersByTime(10_000);
		await flush();
		expect(root(container).dataset.status).toBe('offline');
		ok = true;
		clock += 10_000;
		vi.advanceTimersByTime(10_000);
		await flush();
		expect(root(container).dataset.status).toBe('live');
		expect(container.querySelector('img')).not.toBeNull();
	});

	it('mounts with a remembered frame immediately (no blank on remount)', async () => {
		rememberFrame(cam.id, 'https://cams.test/tam.jpg?t=1', clock - 2_000);
		const preload = vi.fn(() => new Promise<boolean>(() => {}));
		const { container } = render(TvCameraTile, { cam, preload, now });
		expect(container.querySelector('img')?.getAttribute('src')).toBe(
			'https://cams.test/tam.jpg?t=1'
		);
		expect(root(container).dataset.status).toBe('live');
	});

	it('stops refreshing when destroyed', async () => {
		const preload = vi.fn(async () => true);
		const { unmount } = render(TvCameraTile, { cam, preload, now });
		await flush();
		const calls = preload.mock.calls.length;
		unmount();
		clock += 60_000;
		vi.advanceTimersByTime(60_000);
		await flush();
		expect(preload.mock.calls.length).toBe(calls);
	});
});

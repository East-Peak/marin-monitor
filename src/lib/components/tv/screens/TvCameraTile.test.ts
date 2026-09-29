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

/** A decoded frame, as preloadImage resolves it. */
const decoded = (url: string) => Object.assign(document.createElement('img'), { src: url });
type Preload = (url: string) => Promise<HTMLImageElement | null>;

const root = (c: HTMLElement) => c.querySelector('[data-camera-id]') as HTMLElement;

describe('TvCameraTile', () => {
	it('shows "Connecting" (not "offline") while the first frame loads', async () => {
		const preload = vi.fn<Preload>(() => new Promise(() => {}));
		const { container } = render(TvCameraTile, { cam, preload, now });
		await flush();
		expect(root(container).dataset.status).toBe('connecting');
		expect(container.textContent).toContain('Connecting');
		expect(container.textContent).not.toMatch(/offline/i);
		expect(container.querySelector('img')).toBeNull();
	});

	it('swaps in the frame only after preload succeeds, with the exact preloaded URL', async () => {
		const preload = vi.fn<Preload>(async (url) => decoded(url));
		const { container } = render(TvCameraTile, { cam, preload, now });
		await flush();
		const url = preload.mock.calls[0][0];
		expect(container.querySelector('img')?.getAttribute('src')).toBe(url);
		expect(root(container).dataset.status).toBe('live');
	});

	it('keeps the last good frame and goes stale (never blank/offline) when the network drops', async () => {
		let ok = true;
		const preload = vi.fn<Preload>(async (url) => (ok ? decoded(url) : null));
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
		const preload = vi.fn<Preload>(async (url) => (ok ? decoded(url) : null));
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
		rememberFrame(
			cam.id,
			'https://cams.test/tam.jpg?t=1',
			clock - 2_000,
			decoded('https://cams.test/tam.jpg?t=1')
		);
		const preload = vi.fn<Preload>(() => new Promise(() => {}));
		const { container } = render(TvCameraTile, { cam, preload, now });
		expect(container.querySelector('img')?.getAttribute('src')).toBe(
			'https://cams.test/tam.jpg?t=1'
		);
		expect(root(container).dataset.status).toBe('live');
	});

	it('mounts the remembered decoded element itself, so an expired frame is never refetched', async () => {
		const warmed = decoded('https://cams.test/tam.jpg?t=1');
		rememberFrame(cam.id, 'https://cams.test/tam.jpg?t=1', clock - 2_000, warmed);
		const preload = vi.fn<Preload>(() => new Promise(() => {}));
		const { container } = render(TvCameraTile, { cam, preload, now });
		await flush();
		expect(container.querySelector('img')).toBe(warmed);
		expect(warmed.alt).toBe(cam.name);
	});

	it('releases the cached element on unmount so it cannot pin the removed slide', async () => {
		const warmed = decoded('https://cams.test/tam.jpg?t=1');
		rememberFrame(cam.id, 'https://cams.test/tam.jpg?t=1', clock - 2_000, warmed);
		const preload = vi.fn<Preload>(() => new Promise(() => {}));
		const { unmount } = render(TvCameraTile, { cam, preload, now });
		await flush();
		expect(warmed.parentNode).not.toBeNull();
		unmount();
		expect(warmed.parentNode).toBeNull();
	});

	it('swaps to the newly decoded element when a fresher frame arrives', async () => {
		const frames: HTMLImageElement[] = [];
		const preload = vi.fn<Preload>(async (url) => {
			frames.push(decoded(url));
			return frames.at(-1)!;
		});
		const { container } = render(TvCameraTile, { cam, preload, now });
		await flush();
		clock += 10_000;
		vi.advanceTimersByTime(10_000);
		await flush();
		expect(frames).toHaveLength(2);
		expect(container.querySelectorAll('img')).toHaveLength(1);
		expect(container.querySelector('img')).toBe(frames[1]);
	});

	it('carries failures across remounts so a dead slow-refresh camera reaches offline', async () => {
		// 60s refresh but ~18s on screen: one attempt per visit, so per-mount counting never trips.
		const slowCam = { ...cam, id: 'abc7-tam', refreshInterval: 60 };
		const preload = vi.fn<Preload>(async () => null);
		const first = render(TvCameraTile, { cam: slowCam, preload, now });
		await flush();
		expect(root(first.container).dataset.status).toBe('connecting');
		first.unmount();
		clock += 60_000;
		const second = render(TvCameraTile, { cam: slowCam, preload, now });
		await flush();
		expect(root(second.container).dataset.status).toBe('offline');
	});

	it('stops refreshing when destroyed', async () => {
		const preload = vi.fn<Preload>(async (url) => decoded(url));
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

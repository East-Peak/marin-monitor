import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CamTile from './CamTile.svelte';
import { CAMERAS, type CameraConfig } from '$lib/config/cameras';
import type { LoadedFrame, loadFrame } from '$lib/dashboard/cam-frame-loader';

type Load = typeof loadFrame;
const T0 = Date.UTC(2026, 9, 13, 23, 0, 30);
const fire = CAMERAS.find((c) => c.id === 'alert-tam-east') as CameraConfig;
const caltrans = CAMERAS.find((c) => c.id === 'caltrans-spencer') as CameraConfig;
const frame = (capturedAt: number | null = null, src = 'https://x/f.jpg'): LoadedFrame => ({
	img: Object.assign(document.createElement('img'), { src }),
	capturedAt
});
const flush = async () => {
	for (let i = 0; i < 4; i++) await Promise.resolve();
	await tick();
};
const root = (c: HTMLElement) => c.querySelector('[data-camera-id]') as HTMLElement;

// jsdom has no URL.revokeObjectURL; every tile that unmounts a blob frame calls it (Codex r1 #2).
const revoke = vi.fn((_u: string) => {});
const hadRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
beforeEach(() => {
	revoke.mockClear();
	Object.defineProperty(URL, 'revokeObjectURL', {
		configurable: true,
		writable: true,
		value: revoke
	});
	vi.useFakeTimers();
	vi.setSystemTime(T0);
});
afterEach(() => {
	cleanup(); // unmount (and release) before the spy is removed
	vi.useRealTimers();
	if (hadRevoke) Object.defineProperty(URL, 'revokeObjectURL', hadRevoke);
	else delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
});

describe('CamTile', () => {
	it('a heading footer says which way the camera looks (MAPX4)', async () => {
		const load = vi.fn<Load>(async () => frame());
		const { container } = render(CamTile, {
			cam: fire,
			active: false,
			now: T0,
			load,
			heading: 'Looking SSE · 163°'
		});
		await flush();
		expect(container.querySelector('[data-cam-heading]')?.textContent).toBe('Looking SSE · 163°');
	});

	it('no heading (unread, failed or unreported): no footer at all, never a guess', async () => {
		const load = vi.fn<Load>(async () => frame());
		const { container } = render(CamTile, { cam: fire, active: false, now: T0, load });
		await flush();
		expect(container.querySelector('[data-cam-heading]')).toBeNull();
	});
	it('inactive: requests nothing and claims nothing', async () => {
		const load = vi.fn<Load>(async () => frame());
		const { container } = render(CamTile, { cam: fire, active: false, now: T0, load });
		await flush();
		expect(load).not.toHaveBeenCalled();
		expect(root(container).dataset.status).toBe('idle');
		expect(container.textContent).not.toMatch(/Connecting|offline/);
	});

	it('active: loads the thumbnail for this minute, then mounts the decoded frame', async () => {
		const load = vi.fn<Load>(async () => frame());
		const { container } = render(CamTile, { cam: fire, active: true, now: T0, load });
		await flush();
		const bucket = Math.floor(T0 / 60_000) * 60_000;
		expect(load.mock.calls[0][0]).toBe(
			`https://cameras.alertcalifornia.org/public-camera-data/Axis-TamEast/latest-thumb.jpg?t=${bucket}`
		);
		expect(load.mock.calls[0][1]).toBe(false);
		expect(root(container).dataset.status).toBe('live');
		expect((container.querySelector('img') as HTMLImageElement).alt).toBe('Mt. Tam East');
	});

	it('no <img> before the frame has decoded; "connecting" while it is out', async () => {
		let resolve!: (f: LoadedFrame | null) => void;
		const load = vi.fn<Load>(() => new Promise((r) => (resolve = r)));
		const onstatus = vi.fn();
		const { container } = render(CamTile, { cam: fire, active: true, now: T0, load, onstatus });
		await flush();
		expect(container.querySelector('img')).toBeNull();
		expect(root(container).dataset.status).toBe('connecting');
		expect(onstatus).toHaveBeenLastCalledWith('alert-tam-east', 'connecting'); // Codex r1 #4
		resolve(frame());
		await flush();
		expect(container.querySelector('img')).not.toBeNull();
		expect(onstatus).toHaveBeenLastCalledWith('alert-tam-east', 'live');
	});

	it('names the camera; a fire cam names its source and claims no age', async () => {
		const { container } = render(CamTile, {
			cam: fire,
			active: true,
			now: T0,
			load: vi.fn<Load>(async () => frame())
		});
		await flush();
		expect(container.textContent).toContain('Mt. Tam East');
		expect(container.querySelector('[data-cam-meta]')!.textContent!.trim()).toBe('ALERTCalifornia');
	});

	it("a Caltrans cam reads the source's capture age, and asks for it", async () => {
		const load = vi.fn<Load>(async () => frame(T0 - 4 * 60_000, 'blob:a'));
		const { container } = render(CamTile, { cam: caltrans, active: true, now: T0, load });
		await flush();
		expect(load.mock.calls[0][1]).toBe(true);
		expect(container.querySelector('[data-cam-meta]')!.textContent).toMatch(
			/Caltrans · updated 4 min ago/
		);
		expect(container.querySelector('.cam-old')).toBeNull();
	});

	it('an old Caltrans frame is marked old', async () => {
		const { container } = render(CamTile, {
			cam: caltrans,
			active: true,
			now: T0,
			load: vi.fn<Load>(async () => frame(T0 - 3 * 3_600_000, 'blob:a'))
		});
		await flush();
		expect(container.querySelector('.cam-old')!.textContent).toBe('updated 3 h ago');
	});

	it('never a broken image: two failed loads read "Camera offline", with no <img>', async () => {
		const load = vi.fn<Load>(async () => null);
		const onstatus = vi.fn();
		const { container } = render(CamTile, { cam: fire, active: true, now: T0, load, onstatus });
		await flush();
		expect(root(container).dataset.status).toBe('connecting');
		expect(container.textContent).toContain('Connecting…');
		await vi.advanceTimersByTimeAsync(10_000); // STRIP_RETRY_S
		await flush();
		expect(load).toHaveBeenCalledTimes(2);
		expect(root(container).dataset.status).toBe('offline');
		expect(container.textContent).toContain('Camera offline');
		expect(container.querySelector('img')).toBeNull();
		expect(onstatus).toHaveBeenLastCalledWith('alert-tam-east', 'offline');
	});

	it('after two failures, a retry in flight reads connecting, then live (Codex r2 #3)', async () => {
		let n = 0;
		let resolve!: (f: LoadedFrame | null) => void;
		const load = vi.fn<Load>(() =>
			++n <= 2 ? Promise.resolve(null) : new Promise((r) => (resolve = r))
		);
		const onstatus = vi.fn();
		const { container } = render(CamTile, { cam: fire, active: true, now: T0, load, onstatus });
		await flush();
		await vi.advanceTimersByTimeAsync(10_000);
		await flush();
		expect(onstatus).toHaveBeenLastCalledWith('alert-tam-east', 'offline');
		await vi.advanceTimersByTimeAsync(10_000);
		await flush();
		expect(load).toHaveBeenCalledTimes(3);
		expect(root(container).dataset.status).toBe('connecting');
		expect(onstatus).toHaveBeenLastCalledWith('alert-tam-east', 'connecting');
		expect(container.textContent).not.toContain('Camera offline');
		resolve(frame());
		await flush();
		expect(root(container).dataset.status).toBe('live');
	});

	it('refresh failing: Caltrans keeps its source age (amber); a ridge cam says "last received" (Codex r2 #7)', async () => {
		const once = (first: LoadedFrame) => {
			let n = 0;
			return vi.fn<Load>(async () => (++n === 1 ? first : null));
		};
		const ctLoad = once(frame(T0 - 4 * 60_000, 'blob:a'));
		const rfLoad = once(frame());
		// The same failing loaders throughout: the harness's rerender re-runs every prop-reading
		// effect, so a fresh loader here would deliver a frame and end the outage under test.
		const ct = render(CamTile, { cam: caltrans, active: true, now: T0, load: ctLoad });
		const rf = render(CamTile, { cam: fire, active: true, now: T0, load: rfLoad });
		await flush();
		await vi.advanceTimersByTimeAsync(180_000); // three failed minute refreshes
		await ct.rerender({ cam: caltrans, active: true, now: T0 + 200_000, load: ctLoad });
		await rf.rerender({ cam: fire, active: true, now: T0 + 200_000, load: rfLoad });
		await flush();
		expect(root(ct.container).dataset.status).toBe('stale');
		expect(ct.container.querySelector('.cam-old')!.textContent).toBe('updated 7 min ago');
		expect(rf.container.querySelector('[data-cam-meta]')!.textContent).toMatch(
			/ALERTCalifornia · last received 3 min ago/
		);
		expect(rf.container.textContent).not.toMatch(/updated/);
	});

	it('deactivating aborts the request in flight and discards its late frame (Codex r1 #6)', async () => {
		let resolve!: (f: LoadedFrame | null) => void;
		let signal: AbortSignal | undefined;
		const load = vi.fn<Load>((_u, _c, o) => {
			signal = o?.signal;
			return new Promise((r) => (resolve = r));
		});
		const r = render(CamTile, { cam: fire, active: true, now: T0, load });
		await flush();
		await r.rerender({ cam: fire, active: false, now: T0, load });
		await flush();
		expect(signal?.aborted).toBe(true);
		resolve(frame());
		await flush();
		expect(r.container.querySelector('img')).toBeNull();
	});

	it('going inactive stops refreshing; reactivating in a new minute refreshes once', async () => {
		const load = vi.fn<Load>(async () => frame());
		const r = render(CamTile, { cam: fire, active: true, now: T0, load });
		await flush();
		await r.rerender({ cam: fire, active: false, now: T0, load });
		await vi.advanceTimersByTimeAsync(180_000);
		expect(load).toHaveBeenCalledTimes(1);
		await r.rerender({ cam: fire, active: true, now: T0 + 180_000, load });
		await flush();
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('reactivating within the same minute does not refetch', async () => {
		const load = vi.fn<Load>(async () => frame());
		const r = render(CamTile, { cam: fire, active: true, now: T0, load });
		await flush();
		await r.rerender({ cam: fire, active: false, now: T0, load });
		await r.rerender({ cam: fire, active: true, now: T0, load });
		await flush();
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('a tap opens the full-size source frame in a new tab', () => {
		const { container } = render(CamTile, { cam: fire, active: false, now: T0 });
		const a = root(container) as HTMLAnchorElement;
		expect(a.getAttribute('href')).toBe(fire.url);
		expect(a.getAttribute('target')).toBe('_blank');
		expect(a.getAttribute('rel')).toContain('noopener');
	});

	it('releases a replaced Caltrans object URL, and its own on unmount', async () => {
		let n = 0;
		const load = vi.fn<Load>(async () => frame(T0, `blob:${++n}`));
		const r = render(CamTile, { cam: caltrans, active: true, now: T0, load });
		await flush();
		await vi.advanceTimersByTimeAsync(60_000);
		await flush();
		expect(revoke).toHaveBeenCalledWith('blob:1');
		r.unmount();
		expect(revoke).toHaveBeenCalledWith('blob:2');
	});

	it('unmounting with a request out aborts it, releases its late frame, and stops the timer (Codex review A)', async () => {
		let resolve!: (f: LoadedFrame | null) => void;
		let signal: AbortSignal | undefined;
		const load = vi.fn<Load>((_u, _c, o) => {
			signal = o?.signal;
			return new Promise((r) => (resolve = r));
		});
		const r = render(CamTile, { cam: caltrans, active: true, now: T0, load });
		await flush();
		r.unmount();
		expect(signal?.aborted).toBe(true);
		resolve(frame(T0, 'blob:late'));
		await flush();
		expect(revoke).toHaveBeenCalledWith('blob:late');
		await vi.advanceTimersByTimeAsync(120_000);
		expect(load).toHaveBeenCalledTimes(1);
	});
});

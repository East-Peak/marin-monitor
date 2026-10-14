import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const data = vi.hoisted(() => {
	const data = new Map<string, string>();
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		writable: true,
		value: {
			getItem: (k: string) => data.get(k) ?? null,
			setItem: (k: string, v: string) => void data.set(k, String(v)),
			removeItem: (k: string) => void data.delete(k),
			clear: () => data.clear()
		}
	});
	return data;
});

import CamStrip from './CamStrip.svelte';
import { settings } from '$lib/stores/settings';
import { stripCameras } from '$lib/dashboard/cam-strip';
import type { LoadedFrame, loadFrame } from '$lib/dashboard/cam-frame-loader';

type Load = typeof loadFrame;
/** A controllable IntersectionObserver: the page observer has no root, the row's has one. */
class FakeIO {
	static all: FakeIO[] = [];
	targets: Element[] = [];
	constructor(
		public cb: IntersectionObserverCallback,
		public opts: IntersectionObserverInit = {}
	) {
		FakeIO.all.push(this);
	}
	observe(t: Element) {
		this.targets.push(t);
	}
	unobserve() {}
	disconnect() {}
	fire(hit: (t: Element) => boolean) {
		this.cb(
			this.targets.map((t) => ({ target: t, isIntersecting: hit(t) })) as never,
			this as never
		);
	}
}
/** The newest observers (a re-mounted row creates fresh ones). */
const pageIO = () => [...FakeIO.all].reverse().find((o) => !o.opts.root)!; // ES2022: no findLast
const rowIO = () => [...FakeIO.all].reverse().find((o) => o.opts.root)!;
const slot = (t: Element) => (t as HTMLElement).dataset.camSlot ?? '';
const NOW = Date.UTC(2026, 9, 13, 23, 0, 0);
const never = () => vi.fn<Load>(() => new Promise<LoadedFrame | null>(() => {}));
const flush = async () => {
	for (let i = 0; i < 4; i++) await Promise.resolve();
	await tick();
};
const notice = (c: HTMLElement) => c.querySelector('[data-cams-notice]');

beforeEach(() => {
	data.clear();
	if (get(settings).camerasHidden) settings.toggleCamerasHidden();
	FakeIO.all = [];
	vi.stubGlobal('IntersectionObserver', FakeIO);
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('CamStrip', () => {
	it('an always-open "Cameras" region with every strip camera in order', async () => {
		const { container } = render(CamStrip, { now: NOW, load: never() });
		await flush();
		expect(screen.getByRole('heading', { name: 'Cameras' })).toBeTruthy();
		expect(container.querySelector('section#cams button[aria-expanded]')).toBeNull();
		const ids = [...container.querySelectorAll('[data-cam-slot]')].map((e) => slot(e));
		expect(ids).toEqual(stripCameras().map((c) => c.id));
	});

	it('loads only tiles near the viewport, and only while the strip itself is near', async () => {
		const load = never();
		render(CamStrip, { now: NOW, load });
		await flush();
		rowIO().fire((t) => ['alert-tam-east', 'alert-tam-west'].includes(slot(t)));
		await flush();
		expect(load).not.toHaveBeenCalled(); // the strip is not near the viewport yet
		pageIO().fire(() => true);
		await flush();
		expect(load.mock.calls.map((c) => c[0])).toEqual([
			expect.stringContaining('Axis-TamEast/latest-thumb.jpg'),
			expect.stringContaining('Axis-TamWest/latest-thumb.jpg')
		]);
	});

	it('visible → hidden cancels and stops refreshing; back to visible refreshes once (Codex r4 #3)', async () => {
		let signal: AbortSignal | undefined;
		const load = vi.fn<Load>((_u, _c, o) => {
			signal = o?.signal;
			return new Promise<LoadedFrame | null>(() => {});
		});
		const setVisibility = (v: 'visible' | 'hidden') => {
			Object.defineProperty(document, 'visibilityState', { configurable: true, value: v });
			document.dispatchEvent(new Event('visibilitychange'));
		};
		try {
			render(CamStrip, { now: NOW, load });
			await flush();
			pageIO().fire(() => true);
			rowIO().fire((t) => slot(t) === 'alert-tam-east');
			await flush();
			expect(load).toHaveBeenCalledTimes(1);
			setVisibility('hidden');
			await flush();
			expect(signal?.aborted).toBe(true);
			await vi.advanceTimersByTimeAsync(120_000);
			expect(load).toHaveBeenCalledTimes(1);
			setVisibility('visible');
			await flush();
			expect(load).toHaveBeenCalledTimes(2);
		} finally {
			Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
		}
	});

	it('every tried tile offline: the strip says so plainly', async () => {
		const { container } = render(CamStrip, { now: NOW, load: vi.fn<Load>(async () => null) });
		await flush();
		pageIO().fire(() => true);
		rowIO().fire((t) => slot(t) === 'alert-tam-east');
		await flush();
		expect(notice(container)).toBeNull(); // one failure: still connecting
		await vi.advanceTimersByTimeAsync(10_000);
		await flush();
		expect(notice(container)!.textContent).toBe('No cameras are loading right now.');
	});

	it('warm tiles that stop refreshing say so, and recover (Codex r5 #2)', async () => {
		let failing = false;
		const load = vi.fn<Load>(async () =>
			failing ? null : { img: document.createElement('img'), capturedAt: null }
		);
		const r = render(CamStrip, { now: NOW, load });
		await flush();
		pageIO().fire(() => true);
		rowIO().fire((t) => ['alert-tam-east', 'alert-tam-west'].includes(slot(t)));
		await flush();
		expect(notice(r.container)).toBeNull(); // both live
		failing = true;
		await vi.advanceTimersByTimeAsync(240_000); // four failed minute refreshes
		await r.rerender({ now: NOW + 240_000, load });
		await flush();
		expect(notice(r.container)!.textContent).toBe('Cameras not updating right now.');
		failing = false;
		await vi.advanceTimersByTimeAsync(60_000);
		await r.rerender({ now: NOW + 300_000, load });
		await flush();
		expect(notice(r.container)).toBeNull();
	});

	it('back from offscreen with an old frame: no outage claimed until a refresh actually fails (Codex r6 #1)', async () => {
		let mode: 'ok' | 'hold' | 'fail' = 'ok';
		let release!: (f: LoadedFrame | null) => void;
		const load = vi.fn<Load>(() =>
			mode === 'ok'
				? Promise.resolve({ img: document.createElement('img'), capturedAt: null })
				: mode === 'fail'
					? Promise.resolve(null)
					: new Promise((r) => (release = r))
		);
		const r = render(CamStrip, { now: NOW, load });
		await flush();
		pageIO().fire(() => true);
		rowIO().fire((t) => slot(t) === 'alert-tam-east');
		await flush();
		pageIO().fire(() => false); // scrolled away for four minutes: no refreshes, frame ages
		await vi.advanceTimersByTimeAsync(240_000);
		await r.rerender({ now: NOW + 240_000, load });
		await flush();
		expect(load).toHaveBeenCalledTimes(1);
		mode = 'hold';
		pageIO().fire(() => true); // back in view: the refresh is out
		await flush();
		expect(load).toHaveBeenCalledTimes(2);
		expect(notice(r.container)).toBeNull();
		mode = 'fail';
		release(null); // that refresh fails
		await flush();
		expect(notice(r.container)!.textContent).toBe('Cameras not updating right now.');
	});

	it('a newly shown tile still loading clears the notice (Codex r1 #4)', async () => {
		const load = vi.fn<Load>((url) =>
			url.includes('TamEast') ? Promise.resolve(null) : new Promise(() => {})
		);
		const { container } = render(CamStrip, { now: NOW, load });
		await flush();
		pageIO().fire(() => true);
		rowIO().fire((t) => slot(t) === 'alert-tam-east');
		await vi.advanceTimersByTimeAsync(10_000);
		await flush();
		expect(notice(container)).not.toBeNull();
		rowIO().fire((t) => ['alert-tam-east', 'alert-tam-west'].includes(slot(t)));
		await flush();
		expect(notice(container)).toBeNull(); // TamWest's request is out: connecting
	});

	it('an abandoned request does not hold off the notice (Codex r2 #4)', async () => {
		const load = vi.fn<Load>((url) =>
			url.includes('TamEast') ? new Promise(() => {}) : Promise.resolve(null)
		);
		const { container } = render(CamStrip, { now: NOW, load });
		await flush();
		pageIO().fire(() => true);
		rowIO().fire((t) => slot(t) === 'alert-tam-east'); // TamEast's request goes out and never returns
		await flush();
		rowIO().fire((t) => slot(t) === 'alert-tam-west'); // swiped away; TamWest in view
		await flush();
		await vi.advanceTimersByTimeAsync(10_000);
		await flush();
		expect(notice(container)!.textContent).toBe('No cameras are loading right now.');
	});

	it('hidden by the ⚙ preference: says so, mounts no tile, requests nothing; Show brings them back', async () => {
		settings.toggleCamerasHidden();
		const load = never();
		const { container } = render(CamStrip, { now: NOW, load });
		await flush();
		expect(container.textContent).toContain('Cameras are hidden.');
		expect(container.querySelector('[data-cam-slot]')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Show cameras' }));
		await flush();
		expect(get(settings).camerasHidden).toBe(false);
		expect(container.querySelectorAll('[data-cam-slot]').length).toBe(stripCameras().length);
		expect(load).not.toHaveBeenCalled();
	});

	it('hide → show starts fresh: no stale notice, no request before new observations (Codex r1 #5)', async () => {
		const load = vi.fn<Load>(async () => null);
		const { container } = render(CamStrip, { now: NOW, load });
		await flush();
		pageIO().fire(() => true);
		rowIO().fire((t) => slot(t) === 'alert-tam-east');
		await vi.advanceTimersByTimeAsync(10_000);
		await flush();
		expect(notice(container)).not.toBeNull();
		const calls = load.mock.calls.length;
		settings.toggleCamerasHidden();
		await flush();
		settings.toggleCamerasHidden();
		await flush();
		expect(notice(container)).toBeNull();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(load.mock.calls.length).toBe(calls); // nothing until the new observers report
		pageIO().fire(() => true);
		rowIO().fire((t) => slot(t) === 'alert-tam-west');
		await flush();
		expect(load.mock.calls.length).toBe(calls + 1);
		expect(load.mock.calls.at(-1)![0]).toContain('Axis-TamWest');
	});

	it('desktop pager buttons scroll the row one view', async () => {
		const { container } = render(CamStrip, { now: NOW, load: never() });
		await flush();
		const row = container.querySelector('.cams-row') as HTMLElement;
		row.scrollBy = vi.fn() as unknown as typeof row.scrollBy;
		Object.defineProperty(row, 'clientWidth', { value: 1000 });
		await fireEvent.click(screen.getByRole('button', { name: 'Next cameras' }));
		expect(row.scrollBy).toHaveBeenCalledWith({ left: 1000, behavior: 'smooth' });
	});
});

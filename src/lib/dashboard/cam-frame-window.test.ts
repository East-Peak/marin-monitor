import { describe, expect, it, vi } from 'vitest';
import { CAMERAS } from '$lib/config/cameras';
import type { LoadedFrame } from './cam-frame-loader';
import { createFrameWindow } from './cam-frame-window';

const cam = (id: string) => CAMERAS.find((c) => c.id === id)!;
const A = cam('alert-tam-east');
const B = cam('alert-tam-west');
const C = cam('alert-muir-beach');
const D = cam('alert-wolfback-ridge');

const img = (src: string) => ({ src }) as HTMLImageElement;

/** A loader whose requests resolve when the test says so. */
function harness() {
	const calls: { url: string; signal: AbortSignal; resolve: (f: LoadedFrame | null) => void }[] =
		[];
	const load = vi.fn(
		(url: string, _w: boolean, opts: { signal?: AbortSignal } = {}) =>
			new Promise<LoadedFrame | null>((resolve) =>
				calls.push({ url, signal: opts.signal!, resolve })
			)
	);
	const release = vi.fn();
	let now = 1_000_000;
	const changes = vi.fn();
	const w = createFrameWindow({
		load,
		release,
		clock: () => now,
		refreshS: 60,
		onchange: changes
	});
	const settle = () => new Promise((r) => setTimeout(r, 0));
	const ok = (i: number, capturedAt: number | null = null) =>
		calls[i].resolve({ img: img(calls[i].url), capturedAt, placeholder: false });
	return { w, calls, load, release, settle, ok, tick: (ms: number) => (now += ms), changes };
}

describe('createFrameWindow', () => {
	it('loads the current camera’s full frame and its two neighbours, no more', () => {
		const h = harness();
		h.w.focus([B, A, C]);
		expect(h.calls.map((c) => c.url.split('?')[0])).toEqual([B.url, A.url, C.url]);
		expect(h.w.slot(B.id)).toMatchObject({ frame: null, loading: true, failed: false });
	});

	it('a loaded frame is shown with the source’s capture time and when we received it', async () => {
		const h = harness();
		h.w.focus([A]);
		h.ok(0, 123);
		await h.settle();
		expect(h.w.slot(A.id)).toMatchObject({
			loading: false,
			failed: false,
			frame: { capturedAt: 123, receivedAt: 1_000_000 }
		});
		expect(h.changes).toHaveBeenCalled();
	});

	it('moving on aborts loads left behind and drops (releases) their frames', async () => {
		const h = harness();
		h.w.focus([A, B]);
		h.ok(0);
		await h.settle();
		h.w.focus([C, D]); // A and B left behind
		expect(h.calls[1].signal.aborted).toBe(true);
		expect(h.release).toHaveBeenCalledWith(expect.objectContaining({ src: h.calls[0].url }));
		expect(h.w.slot(A.id)).toEqual({
			frame: null,
			loading: false,
			failed: false,
			placeholder: false
		});
	});

	it('a late completion for a camera no longer held is discarded and released', async () => {
		const h = harness();
		h.w.focus([A]);
		h.w.focus([B]);
		h.ok(0); // resolves despite the abort
		await h.settle();
		expect(h.w.slot(A.id).frame).toBeNull();
		expect(h.release).toHaveBeenCalledTimes(1);
	});

	it('keeps a frame already held when it stays in the window: no second request', async () => {
		const h = harness();
		h.w.focus([A, B]);
		h.ok(0);
		h.ok(1);
		await h.settle();
		h.w.focus([B, A, C]);
		expect(h.load).toHaveBeenCalledTimes(3);
	});

	it('never loads one camera twice at once, even under rapid stepping', () => {
		const h = harness();
		for (let i = 0; i < 10; i++) h.w.focus(i % 2 ? [B, A] : [A, B]);
		expect(h.load).toHaveBeenCalledTimes(2);
	});

	it('a never-loaded frame is failed, not blank', async () => {
		const h = harness();
		h.w.focus([A]);
		h.calls[0].resolve(null);
		await h.settle();
		expect(h.w.slot(A.id)).toMatchObject({ frame: null, failed: true, loading: false });
	});

	it('refresh reloads only the current camera, on the next cadence bucket, keeping the frame on failure', async () => {
		const h = harness();
		h.w.focus([A, B]);
		h.ok(0);
		h.ok(1);
		await h.settle();
		h.w.refresh(); // same bucket: nothing new to ask for
		expect(h.load).toHaveBeenCalledTimes(2);
		h.tick(60_000);
		h.w.refresh();
		expect(h.load).toHaveBeenCalledTimes(3);
		expect(h.calls[2].url.split('?')[0]).toBe(A.url);
		h.calls[2].resolve(null);
		await h.settle();
		const s = h.w.slot(A.id);
		expect(s.frame?.receivedAt).toBe(1_000_000);
		expect(s.failed).toBe(true);
		h.tick(60_000);
		h.w.refresh();
		h.ok(3);
		await h.settle();
		expect(h.w.slot(A.id)).toMatchObject({ failed: false, frame: { receivedAt: 1_120_000 } });
		// The replaced frame is released.
		expect(h.release).toHaveBeenCalledWith(expect.objectContaining({ src: h.calls[0].url }));
	});

	it('Caltrans’ stand-in card is unavailable: no frame shown, released', async () => {
		const h = harness();
		const T = cam('caltrans-spencer');
		h.w.focus([T]);
		h.calls[0].resolve({ img: img('blob:card'), capturedAt: 5, placeholder: true });
		await h.settle();
		expect(h.w.slot(T.id)).toMatchObject({ frame: null, placeholder: true, failed: false });
		expect(h.release).toHaveBeenCalledWith(expect.objectContaining({ src: 'blob:card' }));
	});

	it('dispose aborts everything and releases every frame', async () => {
		const h = harness();
		h.w.focus([A, B]);
		h.ok(0);
		await h.settle();
		h.w.dispose();
		expect(h.calls[1].signal.aborted).toBe(true);
		expect(h.release).toHaveBeenCalledTimes(1);
		h.ok(1);
		await h.settle();
		expect(h.release).toHaveBeenCalledTimes(2);
		h.w.focus([C]);
		expect(h.load).toHaveBeenCalledTimes(2);
	});
});

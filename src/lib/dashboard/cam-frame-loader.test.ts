import { describe, expect, it, vi } from 'vitest';
import { adoptFrame, loadFrame, releaseFrame } from './cam-frame-loader';

const URL_ = 'https://cwwp2.dot.ca.gov/x.jpg?t=1';
const img = (src = 'blob:frame') => Object.assign(document.createElement('img'), { src });
const LM = 'Tue, 13 Oct 2026 22:52:09 GMT';
const ok = (headers: Record<string, string> = { 'last-modified': LM }) =>
	new Response(new Blob(['jpeg']), { status: 200, headers });

type Preload = (u: string, s?: AbortSignal) => Promise<HTMLImageElement | null>;
/** Spies are built *after* the overrides, so their mock types survive (Codex r4 #1). */
function opts(over: { signal?: AbortSignal; fetch?: typeof fetch; preload?: Preload } = {}) {
	return {
		signal: over.signal,
		fetch: vi.fn<typeof fetch>(over.fetch ?? (async () => ok())),
		preload: vi.fn<Preload>(over.preload ?? (async (u) => img(u))),
		toObjectUrl: vi.fn((_b: Blob) => 'blob:frame'),
		revoke: vi.fn((_u: string) => {})
	};
}

describe('loadFrame', () => {
	it('without capture time: a plain decode-gated load, no age', async () => {
		const o = opts();
		const f = await loadFrame(URL_, false, o);
		expect(o.fetch).not.toHaveBeenCalled();
		expect(o.preload.mock.calls[0][0]).toBe(URL_);
		expect(f?.capturedAt).toBeNull();
	});
	it('with capture time: the shown bytes carry their own Last-Modified', async () => {
		const o = opts();
		const f = await loadFrame(URL_, true, o);
		expect(o.fetch).toHaveBeenCalledWith(URL_, expect.objectContaining({ mode: 'cors' }));
		expect(o.preload.mock.calls[0][0]).toBe('blob:frame');
		expect(f?.capturedAt).toBe(Date.parse(LM));
		expect(f?.img.src).toBe('blob:frame');
	});
	it('no Last-Modified header: the frame shows, with no age', async () => {
		const f = await loadFrame(URL_, true, opts({ fetch: async () => ok({}) }));
		expect(f?.img).toBeTruthy();
		expect(f?.capturedAt).toBeNull();
	});
	it('CORS lost (TypeError): falls back to a plain load, with no age', async () => {
		const o = opts({ fetch: async () => Promise.reject(new TypeError('Failed to fetch')) });
		const f = await loadFrame(URL_, true, o);
		expect(o.preload.mock.calls[0][0]).toBe(URL_);
		expect(f?.capturedAt).toBeNull();
	});
	/** A fetch that rejects only when its own signal aborts, like a browser's. */
	const hangingFetch =
		(seen: { init?: RequestInit }): typeof fetch =>
		(_u, init) => {
			seen.init = init;
			return new Promise((_r, reject) =>
				init!.signal!.addEventListener('abort', () =>
					reject(new DOMException('aborted', 'AbortError'))
				)
			);
		};
	it('a timeout aborts the fetch and is a failed frame, not a second 8 s attempt', async () => {
		vi.useFakeTimers();
		try {
			const seen: { init?: RequestInit } = {};
			const o = opts({ fetch: hangingFetch(seen) });
			const pending = loadFrame(URL_, true, o);
			await vi.advanceTimersByTimeAsync(8_000);
			expect(seen.init?.signal?.aborted).toBe(true);
			expect(await pending).toBeNull();
			expect(o.preload).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
	it('cancelled while the fetch is out: the fetch itself is aborted, no fallback request (Codex r1 #6, r2 #2)', async () => {
		const life = new AbortController();
		const seen: { init?: RequestInit } = {};
		const o = opts({ signal: life.signal, fetch: hangingFetch(seen) });
		const pending = loadFrame(URL_, true, o);
		life.abort();
		expect(seen.init?.signal?.aborted).toBe(true);
		expect(await pending).toBeNull();
		expect(o.preload).not.toHaveBeenCalled();
	});
	it('cancelled before anything starts: no request on either path (Codex r3 #6)', async () => {
		const life = new AbortController();
		life.abort();
		for (const withTime of [false, true]) {
			const o = opts({ signal: life.signal });
			expect(await loadFrame(URL_, withTime, o)).toBeNull();
			expect(o.preload).not.toHaveBeenCalled();
			expect(o.fetch).not.toHaveBeenCalled();
		}
	});
	it('a plain load hands the lifecycle signal to the preloader, so the download stops on cancel (Codex r3 #5)', async () => {
		const life = new AbortController();
		const o = opts({ signal: life.signal });
		await loadFrame(URL_, false, o);
		expect(o.preload.mock.calls[0][1]).toBe(life.signal);
	});
	it('headers arrive but the body stalls: the deadline aborts it, and the load settles (Codex r3 #4)', async () => {
		vi.useFakeTimers();
		try {
			let init: RequestInit | undefined;
			const o = opts({
				fetch: async (_u, i) => {
					init = i;
					const body = new ReadableStream({
						start(c) {
							i!.signal!.addEventListener('abort', () =>
								c.error(new DOMException('aborted', 'AbortError'))
							);
						}
					});
					return new Response(body, { status: 200, headers: { 'last-modified': LM } });
				}
			});
			const pending = loadFrame(URL_, true, o);
			await vi.advanceTimersByTimeAsync(8_000);
			expect(init?.signal?.aborted).toBe(true);
			expect(await pending).toBeNull();
			expect(o.preload).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
	it('an HTTP error is a failed frame', async () => {
		const o = opts({ fetch: async () => new Response('', { status: 404 }) });
		expect(await loadFrame(URL_, true, o)).toBeNull();
		expect(o.preload).not.toHaveBeenCalled();
	});
	it('bytes that never decode are a failed frame, and their object URL is released', async () => {
		const o = opts({ preload: async () => null });
		expect(await loadFrame(URL_, true, o)).toBeNull();
		expect(o.revoke).toHaveBeenCalledWith('blob:frame');
	});
});

describe('releaseFrame', () => {
	it('revokes object URLs only', () => {
		const revoke = vi.fn((_u: string) => {});
		releaseFrame(img('blob:a'), revoke);
		releaseFrame(img('https://x/y.jpg'), revoke);
		releaseFrame(null, revoke);
		expect(revoke.mock.calls).toEqual([['blob:a']]);
	});

	it('a Caltrans stand-in card is flagged, not shown as a picture (MAPX4b)', async () => {
		const isPlaceholder = vi.fn((_i: HTMLImageElement) => true);
		const f = await loadFrame(URL_, true, { ...opts(), isPlaceholder });
		expect(isPlaceholder).toHaveBeenCalledWith(f?.img);
		expect(f?.placeholder).toBe(true);
	});
	it('a real Caltrans frame is not flagged; a plain load is never checked', async () => {
		const isPlaceholder = vi.fn((_i: HTMLImageElement) => false);
		expect((await loadFrame(URL_, true, { ...opts(), isPlaceholder }))?.placeholder).toBe(false);
		isPlaceholder.mockClear();
		expect((await loadFrame(URL_, false, { ...opts(), isPlaceholder }))?.placeholder).toBe(false);
		expect(isPlaceholder).not.toHaveBeenCalled();
	});
});

describe('adoptFrame (LCP1: the frame the server put in the HTML)', () => {
	/** An <img> from the HTML; jsdom loads nothing, so its state is set by hand. */
	const served = (state: { complete: boolean; naturalWidth?: number }) => {
		const el = Object.assign(document.createElement('img'), { src: 'http://x/api/cams/frame/a' });
		Object.defineProperty(el, 'complete', { configurable: true, get: () => state.complete });
		Object.defineProperty(el, 'naturalWidth', { get: () => state.naturalWidth ?? 0 });
		return el;
	};

	it('already decoded: that element, at once, with no age', async () => {
		const el = served({ complete: true, naturalWidth: 240 });
		expect(await adoptFrame(el)).toEqual({ img: el, capturedAt: null, placeholder: false });
	});
	it('loaded before hydration but undecodable (corrupt bytes): no frame', async () => {
		const el = served({ complete: true, naturalWidth: 240 });
		el.decode = () => Promise.reject(new DOMException('', 'EncodingError'));
		expect(await adoptFrame(el)).toBeNull();
	});
	it('loaded before hydration: decoded before it is handed over', async () => {
		const el = served({ complete: true, naturalWidth: 240 });
		let decoded = false;
		el.decode = () => Promise.resolve().then(() => void (decoded = true));
		await adoptFrame(el);
		expect(decoded).toBe(true);
	});
	it('a decode that never ends: given up at the deadline (Codex LCP1 diff #1)', async () => {
		vi.useFakeTimers();
		try {
			const el = served({ complete: true, naturalWidth: 240 });
			el.decode = () => new Promise(() => {});
			const p = adoptFrame(el);
			await vi.advanceTimersByTimeAsync(8_000);
			expect(await p).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});
	it('cancelled while decoding: no frame', async () => {
		const el = served({ complete: true, naturalWidth: 240 });
		el.decode = () => new Promise(() => {});
		const ctl = new AbortController();
		const p = adoptFrame(el, ctl.signal);
		ctl.abort();
		expect(await p).toBeNull();
	});
	it('already failed (503, broken): no frame', async () => {
		expect(await adoptFrame(served({ complete: true, naturalWidth: 0 }))).toBeNull();
	});
	it('still loading: waits for it, then hands it over', async () => {
		const state = { complete: false, naturalWidth: 0 };
		const el = served(state);
		const p = adoptFrame(el);
		Object.assign(state, { complete: true, naturalWidth: 240 });
		el.dispatchEvent(new Event('load'));
		expect((await p)?.img).toBe(el);
	});
	it('still loading, then an error: no frame', async () => {
		const el = served({ complete: false });
		const p = adoptFrame(el);
		el.dispatchEvent(new Event('error'));
		expect(await p).toBeNull();
	});
	it('cancelled while loading: no frame, and the download is stopped', async () => {
		const el = served({ complete: false });
		const ctl = new AbortController();
		const p = adoptFrame(el, ctl.signal);
		ctl.abort();
		expect(await p).toBeNull();
		expect(el.getAttribute('src')).toBe('');
	});
	it('cancelled before it starts: no frame, the download stopped', async () => {
		const el = served({ complete: false });
		const ctl = new AbortController();
		ctl.abort();
		expect(await adoptFrame(el, ctl.signal)).toBeNull();
		expect(el.getAttribute('src')).toBe('');
	});
	it('a load that never ends: given up at the deadline, the download stopped', async () => {
		vi.useFakeTimers();
		try {
			const el = served({ complete: false });
			const p = adoptFrame(el);
			await vi.advanceTimersByTimeAsync(8_000);
			expect(await p).toBeNull();
			expect(el.getAttribute('src')).toBe('');
		} finally {
			vi.useRealTimers();
		}
	});
});

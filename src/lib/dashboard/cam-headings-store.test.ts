import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { HEADING_REFRESH_MS, createCamHeadings, fetchCamHeadings } from './cam-headings-store';
import type { HeadingRead } from './cam-heading';

const read = (headingAt: number): HeadingRead => ({
	headingAt,
	cams: [{ id: 'alert-tam-east', az: 163, fov: 65, patrolling: false, frameAt: headingAt }]
});
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('createCamHeadings', () => {
	it('reads nothing until something holds it', async () => {
		const load = vi.fn().mockResolvedValue(read(1));
		const headings = createCamHeadings({ load, signal: new AbortController().signal });
		await vi.advanceTimersByTimeAsync(HEADING_REFRESH_MS * 3);
		expect(load).not.toHaveBeenCalled();
		expect(get(headings)).toEqual({ state: 'loading', read: null });
	});

	it('reads at once when held, then every 30 s while held', async () => {
		const load = vi.fn().mockResolvedValueOnce(read(1)).mockResolvedValueOnce(read(2));
		const headings = createCamHeadings({ load, signal: new AbortController().signal });
		const release = headings.hold();
		await flush();
		expect(get(headings)).toEqual({ state: 'ok', read: read(1) });
		await vi.advanceTimersByTimeAsync(HEADING_REFRESH_MS);
		expect(load).toHaveBeenCalledTimes(2);
		expect(get(headings).read?.headingAt).toBe(2);
		release();
		await vi.advanceTimersByTimeAsync(HEADING_REFRESH_MS * 3);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('two holders share one read; it stops only when both release', async () => {
		const load = vi.fn().mockResolvedValue(read(1));
		const headings = createCamHeadings({ load, signal: new AbortController().signal });
		const a = headings.hold();
		const b = headings.hold();
		await flush();
		expect(load).toHaveBeenCalledTimes(1);
		a();
		await vi.advanceTimersByTimeAsync(HEADING_REFRESH_MS);
		expect(load).toHaveBeenCalledTimes(2);
		b();
		b(); // a second release is a no-op, not a negative count
		await vi.advanceTimersByTimeAsync(HEADING_REFRESH_MS * 2);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('a new holder within 30 s of the last read does not read again', async () => {
		const load = vi.fn().mockResolvedValue(read(1));
		const headings = createCamHeadings({ load, signal: new AbortController().signal });
		headings.hold()();
		await flush();
		await vi.advanceTimersByTimeAsync(5_000);
		headings.hold();
		await flush();
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('a failed read is unavailable with no headings: a kept heading would be a guess', async () => {
		const load = vi
			.fn()
			.mockResolvedValueOnce(read(1))
			.mockRejectedValueOnce(new Error('503: feed has no features array'));
		const headings = createCamHeadings({ load, signal: new AbortController().signal });
		headings.hold();
		await flush();
		await vi.advanceTimersByTimeAsync(HEADING_REFRESH_MS);
		expect(get(headings)).toEqual({ state: 'unavailable', read: null });
	});

	it('stops when its owner is aborted', async () => {
		const load = vi.fn().mockResolvedValue(read(1));
		const ctl = new AbortController();
		const headings = createCamHeadings({ load, signal: ctl.signal });
		headings.hold();
		await flush();
		ctl.abort();
		await vi.advanceTimersByTimeAsync(HEADING_REFRESH_MS * 2);
		expect(load).toHaveBeenCalledTimes(1);
	});
});

describe('fetchCamHeadings', () => {
	const respond = (body: unknown, status = 200) =>
		vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

	it('reads our endpoint', async () => {
		const fetch = respond(read(5));
		expect(await fetchCamHeadings(new AbortController().signal, fetch)).toEqual(read(5));
		expect(fetch.mock.calls[0][0]).toBe('/api/cams/heading');
	});

	it("a 503 throws the server's reason", async () => {
		const fetch = respond({ error: 'ALERTCalifornia feed HTTP 404' }, 503);
		await expect(fetchCamHeadings(new AbortController().signal, fetch)).rejects.toThrow(/404/);
	});

	it('an unexpected body throws', async () => {
		await expect(
			fetchCamHeadings(new AbortController().signal, respond({ cams: 'x' }))
		).rejects.toThrow();
	});
});

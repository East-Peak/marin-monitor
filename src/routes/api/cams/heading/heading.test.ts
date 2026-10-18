import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

const { GET } = await import('./+server');
const get = () => GET({} as never) as Promise<Response>;

const upstream = (body: unknown, status = 200) =>
	new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const tamEast = {
	type: 'Feature',
	geometry: { type: 'Point', coordinates: [-122.58, 37.93, 741] },
	properties: {
		id: 'Axis-TamEast',
		az_current: 162.64,
		fov: 65.1,
		is_patrol_mode: 0,
		is_currently_patrolling: 0,
		last_frame_ts: 1_792_293_751
	}
};

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
	vi.useFakeTimers({ now: 1_792_293_800_000, toFake: ['Date', 'setTimeout', 'clearTimeout'] });
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('GET /api/cams/heading', () => {
	it("reads ALERTCalifornia's all_cameras-v3.json", async () => {
		fetchMock.mockResolvedValueOnce(upstream({ features: [tamEast] }));
		await get();
		expect(fetchMock.mock.calls[0][0]).toBe(
			'https://cameras.alertcalifornia.org/public-camera-data/all_cameras-v3.json'
		);
	});

	it('returns our cams with the time we read the feed, cached 30 s publicly', async () => {
		fetchMock.mockResolvedValueOnce(upstream({ features: [tamEast] }));
		const res = await get();
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toBe('public, max-age=30, s-maxage=30');
		expect(await res.json()).toEqual({
			headingAt: 1_792_293_800_000,
			cams: [
				{
					id: 'alert-tam-east',
					az: 162.64,
					fov: 65.1,
					patrolling: false,
					frameAt: 1_792_293_751_000
				}
			]
		});
	});

	it('a renamed file (404 upstream) is 503 with a reason, not cached', async () => {
		fetchMock.mockResolvedValueOnce(upstream('Not Found', 404));
		const res = await get();
		expect(res.status).toBe(503);
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect((await res.json()).error).toMatch(/404/);
	});

	it('a schema miss is 503 with the reason', async () => {
		fetchMock.mockResolvedValueOnce(upstream({ cameras: [] }));
		const res = await get();
		expect(res.status).toBe(503);
		expect((await res.json()).error).toMatch(/features/);
	});

	it('headers arrive but the 2.8 MB body stalls: one deadline covers both, then 503 (Codex MAPX4 #4)', async () => {
		fetchMock.mockImplementationOnce(
			async (_url: string, init: RequestInit) =>
				new Response(
					new ReadableStream({
						start(c) {
							init.signal?.addEventListener('abort', () => c.error(new Error('aborted')));
						}
					})
				)
		);
		const res = get();
		await vi.advanceTimersByTimeAsync(10_000);
		expect((await res).status).toBe(503);
	});

	it('a network failure or non-JSON body is 503', async () => {
		fetchMock.mockRejectedValueOnce(new Error('timeout'));
		expect((await get()).status).toBe(503);
		fetchMock.mockResolvedValueOnce(upstream('<html>'));
		expect((await get()).status).toBe(503);
	});
});

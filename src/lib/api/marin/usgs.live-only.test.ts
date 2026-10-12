import { beforeEach, describe, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('$lib/services/client', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/services/client')>()),
	serviceClient: { request }
}));
import { fetchEarthquakesOrThrow } from './usgs';

const BODY = {
	features: [
		{
			id: 'nc1',
			properties: {
				mag: 3.1,
				place: '5 km N of Novato, CA',
				time: 0,
				url: 'https://e.example/nc1'
			},
			geometry: { coordinates: [-122.57, 38.15, 5] }
		}
	]
};
beforeEach(() => request.mockReset());

describe('fetchEarthquakesOrThrow liveOnly (v2; Codex r4 #2)', () => {
	it('default (TV): a cached fallback is returned as before', async () => {
		request.mockResolvedValue({ data: BODY, fromCache: 'stale-fallback', error: 'HTTP 503' });
		await expect(fetchEarthquakesOrThrow()).resolves.toHaveLength(1);
	});
	it('liveOnly: a cached fallback after a failed refresh is a failure; no background revalidation', async () => {
		request.mockResolvedValue({ data: BODY, fromCache: 'stale-fallback', error: 'HTTP 503' });
		await expect(fetchEarthquakesOrThrow({ liveOnly: true })).rejects.toThrow('HTTP 503');
		expect(request.mock.calls[0][2]).toMatchObject({ revalidateInBackground: false });
	});
});

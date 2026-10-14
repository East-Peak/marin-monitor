import { beforeEach, describe, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('$lib/services/client', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/services/client')>()),
	serviceClient: { request }
}));
import { fetchEarthquakesOrThrow, readEarthquakesOrThrow } from './usgs';

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

const GEN = Date.parse('2026-10-13T22:55:53Z');
describe('readEarthquakesOrThrow carries the payload’s own time (map coverage label)', () => {
	it('observedAt is metadata.generated', async () => {
		request.mockResolvedValue({
			data: { ...BODY, metadata: { generated: GEN } },
			fromCache: false
		});
		const r = await readEarthquakesOrThrow({ liveOnly: true });
		expect(r.observedAt).toBe(GEN);
		expect(r.quakes).toHaveLength(1);
	});
	it.each([
		[undefined],
		[{}],
		[{ generated: 'soon' }],
		[{ generated: NaN }],
		[{ generated: 0 }],
		[{ generated: -1 }],
		[{ generated: 1e20 }]
	])(
		'no usable generated (%j) → observedAt null, never NaN (negative control)',
		async (metadata) => {
			request.mockResolvedValue({ data: { ...BODY, metadata }, fromCache: false });
			expect((await readEarthquakesOrThrow({ liveOnly: true })).observedAt).toBeNull();
		}
	);
	it('fetchEarthquakesOrThrow is unchanged: the quakes only', async () => {
		request.mockResolvedValue({
			data: { ...BODY, metadata: { generated: GEN } },
			fromCache: false
		});
		await expect(fetchEarthquakesOrThrow()).resolves.toHaveLength(1);
	});
});

describe('a malformed feature never lets metadata.generated vouch for the list (Codex code review r2 #2)', () => {
	const good = BODY.features[0];
	it.each([
		[{ ...good, geometry: { coordinates: [null, null, 5] } }],
		[{ ...good, geometry: {} }],
		[{ ...good, properties: { ...good.properties, mag: null } }],
		[{ ...good, properties: { ...good.properties, time: 'soon' } }],
		[{ ...good, id: undefined }],
		[null]
	])('a malformed feature (%j) → observedAt null; the legacy list is unchanged', async (bad) => {
		const body = { features: [good, bad], metadata: { generated: GEN } };
		request.mockResolvedValue({ data: body, fromCache: false });
		const read = await readEarthquakesOrThrow({ liveOnly: true }).catch((e: Error) => e);
		const legacy = await fetchEarthquakesOrThrow({ liveOnly: true }).catch((e: Error) => e);
		if (read instanceof Error) {
			expect(legacy).toBeInstanceOf(Error); // legacy already rejects it: the read fails closed
		} else {
			expect(read.observedAt).toBeNull();
			expect(read.quakes).toEqual(legacy);
		}
	});
	it('well-formed features keep the time', async () => {
		request.mockResolvedValue({
			data: { features: [good, good], metadata: { generated: GEN } },
			fromCache: false
		});
		expect((await readEarthquakesOrThrow({ liveOnly: true })).observedAt).toBe(GEN);
	});
});

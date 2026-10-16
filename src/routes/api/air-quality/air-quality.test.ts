import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithTimeout, getAirnowApiKey } = vi.hoisted(() => ({
	fetchWithTimeout: vi.fn(),
	getAirnowApiKey: vi.fn()
}));
vi.mock('$lib/server/fetch-utils', () => ({ fetchWithTimeout }));
vi.mock('$lib/server/api-keys', () => ({ getAirnowApiKey }));

const { GET } = await import('./+server');
const get = () => GET({} as never) as Promise<Response>;

const observation = {
	dateObserved: '2026-10-16',
	hourObserved: '04:00',
	localTimeZone: 'PDT',
	reportingAreaName: 'San Rafael',
	parameterName: 'PM2.5',
	nowcastAQI: 9,
	aqiCategoryName: 'Good'
};
const upstream = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(() => {
	fetchWithTimeout.mockReset();
	getAirnowApiKey.mockReturnValue('test-key');
});

describe('GET /api/air-quality', () => {
	it("reads AirNow's current ziplatlong observations (the latLong endpoint retired 2026-09-30)", async () => {
		fetchWithTimeout.mockResolvedValueOnce(upstream([observation]));
		await get();
		const url = new URL(fetchWithTimeout.mock.calls[0][0]);
		expect(`${url.origin}${url.pathname}`).toBe(
			'https://www.airnowapi.org/aq/observation/current/ziplatlong/'
		);
		expect(url.searchParams.get('format')).toBe('application/json');
		expect(url.searchParams.get('latitude')).toBeTruthy();
		expect(url.searchParams.get('longitude')).toBeTruthy();
		expect(url.searchParams.get('API_KEY')).toBe('test-key');
	});

	it('returns the reading with its observation time', async () => {
		fetchWithTimeout.mockResolvedValueOnce(upstream([observation]));
		const res = await get();
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({
			aqi: 9,
			category: 'Good',
			pollutant: 'PM2.5',
			area: 'San Rafael',
			observedAt: Date.parse('2026-10-16T11:00:00Z')
		});
	});

	it('no current observation is 204, not a reading of 0', async () => {
		fetchWithTimeout.mockResolvedValueOnce(upstream([]));
		expect((await get()).status).toBe(204);
	});

	it('an upstream failure is a 502 that is not cached', async () => {
		fetchWithTimeout.mockResolvedValueOnce(
			upstream({ WebServiceError: [{ Message: 'retired' }] }, 410)
		);
		const res = await get();
		expect(res.status).toBe(502);
		expect(res.headers.get('cache-control')).toBe('no-store');
	});

	it('a 200 carrying a service error is a 502, not "no reading"', async () => {
		fetchWithTimeout.mockResolvedValueOnce(upstream({ WebServiceError: [{ Message: 'bad key' }] }));
		const res = await get();
		expect(res.status).toBe(502);
		expect(res.headers.get('cache-control')).toBe('no-store');
	});

	it('a network failure is a 502', async () => {
		fetchWithTimeout.mockRejectedValueOnce(new TypeError('fetch failed'));
		expect((await get()).status).toBe(502);
	});

	it('without a key it is 503 and makes no request', async () => {
		getAirnowApiKey.mockReturnValue('');
		expect((await get()).status).toBe(503);
		expect(fetchWithTimeout).not.toHaveBeenCalled();
	});
});

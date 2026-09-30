import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('$lib/services/client', async (orig) => ({
	...(await orig<object>()),
	serviceClient: { request }
}));
const { getGridPoint } = vi.hoisted(() => ({ getGridPoint: vi.fn() }));
vi.mock('./nws-common', () => ({ getGridPoint }));

import { fetchHourlyForecast, fetchHourlyPopOrThrow } from './nws-hourly';
import { fetchLatestObservation } from './nws-observation';
import { fetchTideEventsOrThrow } from './tides';

const ok = (data: unknown) => ({ data, fromCache: false });
const period = (startTime: string, endTime: string, value: number | null) => ({
	startTime,
	endTime,
	temperature: 60,
	temperatureUnit: 'F',
	windSpeed: '5 mph',
	windDirection: 'W',
	shortForecast: 'Sunny',
	isDaytime: true,
	probabilityOfPrecipitation: { value }
});

beforeEach(() => {
	request.mockReset();
	getGridPoint.mockReset();
	getGridPoint.mockResolvedValue({ office: 'MTR', gridX: 83, gridY: 115 });
});

describe('fetchHourlyPopOrThrow', () => {
	const body = {
		properties: {
			updateTime: '2026-09-29T14:30:00+00:00',
			periods: [
				period('2026-09-29T08:00:00-07:00', '2026-09-29T09:00:00-07:00', 20),
				period('2026-09-29T09:00:00-07:00', '2026-09-29T10:00:00-07:00', null),
				period('bad', '2026-09-29T11:00:00-07:00', 5)
			]
		}
	};
	it('keeps a missing probability as null, the forecast update time, and drops malformed periods', async () => {
		request.mockResolvedValue(ok(body));
		expect(await fetchHourlyPopOrThrow(37.97, -122.53)).toEqual({
			updatedAt: Date.parse('2026-09-29T14:30:00Z'),
			periods: [
				{
					startMs: Date.parse('2026-09-29T15:00:00Z'),
					endMs: Date.parse('2026-09-29T16:00:00Z'),
					pop: 20
				},
				{
					startMs: Date.parse('2026-09-29T16:00:00Z'),
					endMs: Date.parse('2026-09-29T17:00:00Z'),
					pop: null
				}
			]
		});
		expect(request.mock.calls[0][1]).toBe('/gridpoints/MTR/83,115/forecast/hourly');
	});
	it('passes the owner signal to the grid lookup and the forecast request', async () => {
		request.mockResolvedValue(ok(body));
		const owner = new AbortController();
		await fetchHourlyPopOrThrow(37.97, -122.53, { signal: owner.signal });
		expect(getGridPoint).toHaveBeenCalledWith(37.97, -122.53, owner.signal);
		expect(request.mock.calls[0][2]).toMatchObject({
			signal: owner.signal,
			revalidateInBackground: false
		});
	});
	it('a held /points lookup that finishes after the owner is gone starts no hourly request (Codex r1 #8)', async () => {
		let release!: (v: unknown) => void;
		getGridPoint.mockReturnValueOnce(new Promise((r) => (release = r)));
		const owner = new AbortController();
		const pending = fetchHourlyPopOrThrow(37.97, -122.53, { signal: owner.signal });
		owner.abort();
		release({ office: 'MTR', gridX: 83, gridY: 115 });
		await expect(pending).rejects.toThrow();
		expect(request).not.toHaveBeenCalled();
	});
	it('throws on failure or a body without periods', async () => {
		request.mockRejectedValueOnce(new Error('HTTP 500'));
		await expect(fetchHourlyPopOrThrow(1, 2)).rejects.toThrow('HTTP 500');
		request.mockResolvedValueOnce(ok({ properties: {} }));
		await expect(fetchHourlyPopOrThrow(1, 2)).rejects.toThrow('missing periods');
	});
	it('preservation guard: the legacy fetchHourlyForecast still reads a missing value as 0', async () => {
		request.mockResolvedValue(ok(body));
		const legacy = await fetchHourlyForecast(37.97, -122.53);
		expect(legacy[1].precipitationChance).toBe(0);
	});
});

describe('fetchLatestObservation', () => {
	const station = { id: 'KDVO', name: 'Gnoss Field (Novato)' };
	const obs = (temperature: unknown, timestamp: unknown = '2026-09-29T14:55:00+00:00') =>
		ok({ properties: { timestamp, textDescription: 'Clear', temperature } });
	it('reads the observation time, converts Celsius and labels our station', async () => {
		request.mockResolvedValue(obs({ value: 15.5, qualityControl: 'V' }));
		expect(await fetchLatestObservation(station)).toEqual({
			stationName: 'Gnoss Field (Novato)',
			observedAt: Date.parse('2026-09-29T14:55:00Z'),
			tempF: 60,
			text: 'Clear'
		});
		expect(request.mock.calls[0][1]).toBe('/stations/KDVO/observations/latest');
		const owner = new AbortController();
		await fetchLatestObservation(station, { signal: owner.signal });
		expect(request.mock.calls[1][2]).toMatchObject({
			signal: owner.signal,
			revalidateInBackground: false
		});
	});
	it('a null or QC-rejected temperature is unknown, not a number', async () => {
		request.mockResolvedValueOnce(obs({ value: null, qualityControl: 'Z' }));
		expect((await fetchLatestObservation(station)).tempF).toBeNull();
		request.mockResolvedValueOnce(obs({ value: 40, qualityControl: 'X' }));
		expect((await fetchLatestObservation(station)).tempF).toBeNull();
	});
	it('no timestamp means no observation', async () => {
		request.mockResolvedValue(obs({ value: 15 }, null));
		await expect(fetchLatestObservation(station)).rejects.toThrow('missing its timestamp');
	});
});

describe('fetchTideEventsOrThrow', () => {
	it('reads NOAA GMT times and drops malformed rows', async () => {
		request.mockResolvedValue(
			ok({
				predictions: [
					{ t: '2026-09-29 19:41', v: '6.287', type: 'H' },
					{ t: '2026-09-30 02:48', v: '-0.202', type: 'L' },
					{ t: '2026-13-08 02:30', v: '1.0', type: 'L' },
					{ t: '2026-09-30 09:21', v: 'x', type: 'H' }
				]
			})
		);
		expect(await fetchTideEventsOrThrow('9415020')).toEqual([
			{ atMs: Date.parse('2026-09-29T19:41:00Z'), heightFt: 6.287, type: 'H' },
			{ atMs: Date.parse('2026-09-30T02:48:00Z'), heightFt: -0.202, type: 'L' }
		]);
		const params = request.mock.calls[0][2].params;
		expect(params).toMatchObject({
			station: '9415020',
			range: 48,
			interval: 'hilo',
			time_zone: 'gmt'
		});
		expect(params.begin_date).toMatch(/^\d{8}$/);
		const owner = new AbortController();
		await fetchTideEventsOrThrow('9415020', { signal: owner.signal });
		expect(request.mock.calls[1][2]).toMatchObject({
			signal: owner.signal,
			revalidateInBackground: false
		});
	});
	it('a NOAA error body throws', async () => {
		request.mockResolvedValue(ok({ error: { message: 'No Predictions data was found.' } }));
		await expect(fetchTideEventsOrThrow('9415020')).rejects.toThrow('no predictions');
	});
});

describe('a cached copy served because the live request failed is a failure, never fresh (Codex PR 8 #2)', () => {
	const failedWithCache = (data: unknown) => ({
		data,
		fromCache: 'stale-fallback',
		error: 'HTTP 500'
	});
	const circuitOpen = (data: unknown) => ({ data, fromCache: 'fallback', circuitOpen: true });
	it.each([
		[
			'hourly',
			() => fetchHourlyPopOrThrow(1, 2),
			{ properties: { updateTime: '2026-09-29T14:30:00+00:00', periods: [] } }
		],
		[
			'observation',
			() => fetchLatestObservation({ id: 'KDVO', name: 'x' }),
			{ properties: { timestamp: '2026-09-29T14:55:00+00:00', temperature: { value: 15 } } }
		],
		['tides', () => fetchTideEventsOrThrow('9415020'), { predictions: [] }]
	] as const)('%s rejects a stale-fallback or circuit-open result', async (_n, run, body) => {
		request.mockResolvedValueOnce(failedWithCache(body));
		await expect(run()).rejects.toThrow('HTTP 500');
		request.mockResolvedValueOnce(circuitOpen(body));
		await expect(run()).rejects.toThrow(/circuit open/);
	});
});

describe('tide times are requested in GMT, so the repeated fall-back hour is unambiguous (Codex PR 8 #3)', () => {
	it('the second 1:30 AM on Nov 1 is 09:30Z, not 08:30Z', async () => {
		request.mockResolvedValue(
			ok({ predictions: [{ t: '2026-11-01 09:30', v: '5.1', type: 'H' }] })
		);
		expect(await fetchTideEventsOrThrow('9415020')).toEqual([
			{ atMs: Date.parse('2026-11-01T09:30:00Z'), heightFt: 5.1, type: 'H' }
		]);
		expect(request.mock.calls[0][2].params).toMatchObject({ time_zone: 'gmt' });
	});
});

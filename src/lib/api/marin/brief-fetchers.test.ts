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
					pop: 20,
					temperatureF: 60
				},
				{
					startMs: Date.parse('2026-09-29T16:00:00Z'),
					endMs: Date.parse('2026-09-29T17:00:00Z'),
					pop: null,
					temperatureF: 60
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
	const NOW = Date.parse('2026-09-29T15:00:00Z');
	const feature = (
		timestamp: unknown,
		temperature: unknown,
		textDescription: unknown = 'Clear'
	) => ({
		properties: { timestamp, textDescription, temperature }
	});
	const list = (...features: unknown[]) => ok({ features });

	it('reads the station’s observation list, converts Celsius and labels our station', async () => {
		request.mockResolvedValue(
			list(feature('2026-09-29T14:55:00+00:00', { value: 15.5, qualityControl: 'V' }))
		);
		expect(await fetchLatestObservation(station, { now: NOW })).toEqual({
			stationName: 'Gnoss Field (Novato)',
			observedAt: Date.parse('2026-09-29T14:55:00Z'),
			listNewestAt: Date.parse('2026-09-29T14:55:00Z'),
			tempF: 60,
			text: 'Clear'
		});
		expect(request.mock.calls[0][1]).toBe('/stations/KDVO/observations');
		expect(request.mock.calls[0][2]).toMatchObject({
			params: { limit: 8 },
			accept: 'application/geo+json'
		});
		const owner = new AbortController();
		await fetchLatestObservation(station, { signal: owner.signal, now: NOW });
		expect(request.mock.calls[1][2]).toMatchObject({
			signal: owner.signal,
			revalidateInBackground: false
		});
	});
	it('the prod case: newest report unprocessed (null, Z) → the previous QC’d one, with its time', async () => {
		request.mockResolvedValue(
			list(
				feature('2026-09-29T14:55:00+00:00', { value: null, qualityControl: 'Z' }),
				feature('2026-09-29T14:35:00+00:00', { value: 15.5, qualityControl: 'V' }, '')
			)
		);
		expect(await fetchLatestObservation(station, { now: NOW })).toEqual({
			stationName: 'Gnoss Field (Novato)',
			observedAt: Date.parse('2026-09-29T14:35:00Z'),
			listNewestAt: Date.parse('2026-09-29T14:55:00Z'),
			tempF: 60,
			text: null
		});
	});
	it.each([['X'], ['Q'], ['B']])(
		'a %s-flagged temperature is never a headline; the older V one is',
		async (qc) => {
			request.mockResolvedValue(
				list(
					feature('2026-09-29T14:55:00+00:00', { value: 40, qualityControl: qc }),
					feature('2026-09-29T14:35:00+00:00', { value: 15.5, qualityControl: 'V' })
				)
			);
			expect((await fetchLatestObservation(station, { now: NOW })).tempF).toBe(60);
		}
	);
	it('a null or QC-rejected temperature with nothing better is unknown, not a number (negative control)', async () => {
		request.mockResolvedValueOnce(
			list(feature('2026-09-29T14:55:00+00:00', { value: null, qualityControl: 'Z' }))
		);
		expect((await fetchLatestObservation(station, { now: NOW })).tempF).toBeNull();
		request.mockResolvedValueOnce(
			list(feature('2026-09-29T14:55:00+00:00', { value: 40, qualityControl: 'X' }))
		);
		expect((await fetchLatestObservation(station, { now: NOW })).tempF).toBeNull();
	});
	it('negative control: a usable temperature older than 90 min is not used', async () => {
		request.mockResolvedValue(
			list(
				feature('2026-09-29T14:55:00+00:00', { value: null, qualityControl: 'Z' }),
				feature('2026-09-29T13:15:00+00:00', { value: 15.5, qualityControl: 'V' })
			)
		);
		expect(await fetchLatestObservation(station, { now: NOW })).toMatchObject({
			observedAt: Date.parse('2026-09-29T14:55:00Z'),
			tempF: null
		});
	});
	it('the 90-min bound is judged when the list arrives, not when the request left (Codex code r1 #1)', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			vi.setSystemTime(NOW); // 13:30:05Z is 89m55s old now…
			request.mockImplementation(async () => {
				vi.setSystemTime(NOW + 10_000); // …and 90m05s old when the list lands.
				return list(
					feature('2026-09-29T14:55:00+00:00', { value: null, qualityControl: 'Z' }),
					feature('2026-09-29T13:30:05+00:00', { value: 15.5, qualityControl: 'V' })
				);
			});
			expect(await fetchLatestObservation(station)).toMatchObject({
				observedAt: Date.parse('2026-09-29T14:55:00Z'),
				tempF: null
			});
		} finally {
			vi.useRealTimers();
		}
	});
	it.each([
		[{}],
		[{ features: null }],
		[{ features: [] }],
		[{ features: [feature(null, { value: 15 })] }]
	])('no timestamped report (%j) means no observation', async (body) => {
		request.mockResolvedValue(ok(body));
		await expect(fetchLatestObservation(station, { now: NOW })).rejects.toThrow(
			'missing a timestamp'
		);
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
			{
				features: [
					{ properties: { timestamp: '2026-09-29T14:55:00+00:00', temperature: { value: 15 } } }
				]
			}
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

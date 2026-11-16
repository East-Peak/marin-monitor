import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./fetch-helpers', () => ({
	fetchWithTimeout: vi.fn()
}));

import { readMarineForecastOrThrow } from './marine';
import { fetchWithTimeout } from './fetch-helpers';

const mockFetch = vi.mocked(fetchWithTimeout);

function makeResponse(data: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		json: () => Promise.resolve(data)
	} as Response;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('readMarineForecastOrThrow (v2 surf: a forecast, read in feet)', () => {
	const H = 3_600;
	const body = (start: number) => ({
		hourly: {
			time: [start, start + H, start + 2 * H, start + 3 * H],
			wave_height: [4.1, 4.3, null, 4.9],
			wave_period: [11, 12, 12, 13],
			wave_direction: [250, 251, 252, 253]
		}
	});

	it('asks for feet and unix times, and keeps hours from the current one on, missing as null', async () => {
		const now = 1_792_000_000_000;
		const start = now / 1000 - H; // the hour before the current one is dropped
		mockFetch.mockResolvedValueOnce(makeResponse(body(start)));

		const read = await readMarineForecastOrThrow({ now: () => now + 60_000 });

		const url = new URL(String(mockFetch.mock.calls[0][0]));
		expect(url.searchParams.get('length_unit')).toBe('imperial');
		expect(url.searchParams.get('timeformat')).toBe('unixtime');
		expect(read.checkedAt).toBe(now + 60_000);
		expect(read.points).toEqual([
			{ atMs: now, waveFt: 4.3, periodS: 12, directionDeg: 251 },
			{ atMs: now + H * 1000, waveFt: null, periodS: 12, directionDeg: 252 },
			{ atMs: now + 2 * H * 1000, waveFt: 4.9, periodS: 13, directionDeg: 253 }
		]);
	});

	it('throws on an HTTP error or a body with no hours', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse({}, false, 500));
		await expect(readMarineForecastOrThrow()).rejects.toThrow(/500/);
		mockFetch.mockResolvedValueOnce(makeResponse({ hourly: { time: [] } }));
		await expect(readMarineForecastOrThrow()).rejects.toThrow(/no hours/);
	});
});

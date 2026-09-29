import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestResult } from '$lib/services/client';

vi.mock('$lib/services/client', () => ({ serviceClient: { request: vi.fn() } }));
vi.mock('./nws-common', () => ({ getGridPoint: vi.fn() }));
vi.mock('$lib/config/api', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { fetchHourlyForecast, fetchDailyRainForecast } from './nws-hourly';
import { serviceClient } from '$lib/services/client';
import { getGridPoint } from './nws-common';
import { logger } from '$lib/config/api';

const mockRequest = vi.mocked(serviceClient.request);
const mockGetGridPoint = vi.mocked(getGridPoint);
const GRID = { office: 'MTR', gridX: 82, gridY: 121 };
const empty = { data: { properties: {} }, fromCache: false } as RequestResult<never>;

beforeEach(() => {
	vi.clearAllMocks();
	mockGetGridPoint.mockResolvedValue(GRID);
	mockRequest.mockResolvedValue(empty);
});

describe('NWS hourly/QPF owner signal (dashboard spec §13.6; Codex PR1 C2)', () => {
	for (const [name, call] of [
		['fetchHourlyForecast', fetchHourlyForecast],
		['fetchDailyRainForecast', fetchDailyRainForecast]
	] as const) {
		it(`${name} starts no gridpoint request once the owner aborts during the grid lookup`, async () => {
			const owner = new AbortController();
			mockGetGridPoint.mockImplementationOnce(async () => {
				owner.abort(); // the panel is destroyed while /points is in flight
				return GRID;
			});

			expect(await call(38, -122.5, { signal: owner.signal })).toEqual([]);
			expect(mockRequest).not.toHaveBeenCalled();
		});

		it(`${name} threads the owner signal into the grid lookup and the request`, async () => {
			const owner = new AbortController();

			await call(38, -122.5, { signal: owner.signal });

			expect(mockGetGridPoint).toHaveBeenCalledWith(38, -122.5, owner.signal);
			expect(mockRequest.mock.calls[0][2]?.signal).toBe(owner.signal);
		});
	}

	for (const [name, call] of [
		['fetchHourlyForecast', fetchHourlyForecast],
		['fetchDailyRainForecast', fetchDailyRainForecast]
	] as const) {
		it(`${name}: an owner abort is not logged as a failure (post-push review item 3)`, async () => {
			const owner = new AbortController();
			mockRequest.mockImplementationOnce(async () => {
				owner.abort();
				throw new DOMException('Aborted', 'AbortError');
			});

			expect(await call(38, -122.5, { signal: owner.signal })).toEqual([]);
			expect(vi.mocked(logger.warn)).not.toHaveBeenCalled();
		});
	}
});

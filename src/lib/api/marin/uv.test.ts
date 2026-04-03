import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./fetch-helpers', () => ({
	fetchWithTimeout: vi.fn()
}));

vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('$lib/config/towns', () => ({
	MARIN_CENTER: { lat: 37.9735, lon: -122.5311 }
}));

import { fetchUvIndex } from './uv';
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
});

describe('fetchUvIndex', () => {
	const validResponse = {
		ok: true,
		now: { uvi: 6 },
		forecast: [
			{ time: '2024-03-15T08:00:00Z', uvi: 2 },
			{ time: '2024-03-15T10:00:00Z', uvi: 5 },
			{ time: '2024-03-15T12:00:00Z', uvi: 8 },
			{ time: '2024-03-15T14:00:00Z', uvi: 6 }
		]
	};

	it('parses valid UV response', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(validResponse));

		const result = await fetchUvIndex();

		expect(result).not.toBeNull();
		expect(result!.current).toBe(6);
		expect(result!.timestamp).toBeGreaterThan(0);
		expect(result!.forecast).toHaveLength(4);
	});

	it('maps UV index to correct category and color', async () => {
		// uvi=6 is "High" category
		mockFetch.mockResolvedValueOnce(makeResponse(validResponse));

		const result = await fetchUvIndex();

		expect(result!.category).toBe('High');
		expect(result!.color).toBe('#f95901');
	});

	it('categorizes Low UV (0-2)', async () => {
		mockFetch.mockResolvedValueOnce(
			makeResponse({ ok: true, now: { uvi: 1 }, forecast: [] })
		);

		const result = await fetchUvIndex();

		expect(result!.category).toBe('Low');
		expect(result!.color).toBe('#299501');
	});

	it('categorizes Moderate UV (3-5)', async () => {
		mockFetch.mockResolvedValueOnce(
			makeResponse({ ok: true, now: { uvi: 4 }, forecast: [] })
		);

		const result = await fetchUvIndex();

		expect(result!.category).toBe('Moderate');
		expect(result!.color).toBe('#f7e401');
	});

	it('categorizes Very High UV (8-10)', async () => {
		mockFetch.mockResolvedValueOnce(
			makeResponse({ ok: true, now: { uvi: 9 }, forecast: [] })
		);

		const result = await fetchUvIndex();

		expect(result!.category).toBe('Very High');
		expect(result!.color).toBe('#d90011');
	});

	it('categorizes Extreme UV (11+)', async () => {
		mockFetch.mockResolvedValueOnce(
			makeResponse({ ok: true, now: { uvi: 12 }, forecast: [] })
		);

		const result = await fetchUvIndex();

		expect(result!.category).toBe('Extreme');
		expect(result!.color).toBe('#6c49cb');
	});

	it('converts forecast time strings to timestamps', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(validResponse));

		const result = await fetchUvIndex();

		expect(result!.forecast[0].time).toBe(new Date('2024-03-15T08:00:00Z').getTime());
		expect(result!.forecast[0].uvi).toBe(2);
	});

	it('limits forecast to 24 points', async () => {
		const longForecast = Array.from({ length: 48 }, (_, i) => ({
			time: `2024-03-15T${String(i % 24).padStart(2, '0')}:00:00Z`,
			uvi: i
		}));
		mockFetch.mockResolvedValueOnce(
			makeResponse({ ok: true, now: { uvi: 5 }, forecast: longForecast })
		);

		const result = await fetchUvIndex();

		expect(result!.forecast).toHaveLength(24);
	});

	it('defaults current UVI to 0 when null', async () => {
		mockFetch.mockResolvedValueOnce(
			makeResponse({ ok: true, now: { uvi: null }, forecast: [] })
		);

		const result = await fetchUvIndex();

		expect(result!.current).toBe(0);
		expect(result!.category).toBe('Low');
	});

	it('returns null when response.ok is false', async () => {
		mockFetch.mockResolvedValueOnce(
			makeResponse({ ok: false, now: null })
		);

		const result = await fetchUvIndex();

		expect(result).toBeNull();
	});

	it('returns null when now field is missing', async () => {
		mockFetch.mockResolvedValueOnce(
			makeResponse({ ok: true })
		);

		const result = await fetchUvIndex();

		expect(result).toBeNull();
	});

	it('returns null on HTTP error', async () => {
		mockFetch.mockResolvedValueOnce(makeResponse(null, false, 503));

		const result = await fetchUvIndex();

		expect(result).toBeNull();
	});

	it('returns null on network error', async () => {
		mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

		const result = await fetchUvIndex();

		expect(result).toBeNull();
	});

	it('handles empty forecast array', async () => {
		mockFetch.mockResolvedValueOnce(
			makeResponse({ ok: true, now: { uvi: 3 }, forecast: [] })
		);

		const result = await fetchUvIndex();

		expect(result!.forecast).toEqual([]);
	});
});

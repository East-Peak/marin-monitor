import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestResult } from '$lib/services/client';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('$lib/services/client', () => ({
	serviceClient: {
		request: vi.fn()
	}
}));

vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('$lib/config/map', () => ({
	TIDE_STATIONS: {
		pointReyes: '9415020',
		sanFrancisco: '9414290'
	}
}));

import { fetchTidePredictions, fetchHourlyTides } from './tides';
import { serviceClient } from '$lib/services/client';

const mockRequest = vi.mocked(serviceClient.request);

// ── Helpers ────────────────────────────────────────────────────────────────

function wrapResult<T>(data: T): RequestResult<T> {
	return { data, fromCache: false };
}

function makeNoaaPrediction(overrides: Partial<{ t: string; v: string; type: string }> = {}) {
	return {
		t: '2026-04-01 14:30',
		v: '5.42',
		type: 'H',
		...overrides
	};
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NOAA Tides adapter', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── fetchTidePredictions ──────────────────────────────────────────────

	describe('fetchTidePredictions', () => {
		it('parses NOAA response into TidePrediction array', async () => {
			mockRequest.mockResolvedValueOnce(
				wrapResult({
					predictions: [
						makeNoaaPrediction({ t: '2026-04-01 06:12', v: '5.83', type: 'H' }),
						makeNoaaPrediction({ t: '2026-04-01 12:45', v: '-0.14', type: 'L' })
					]
				})
			);

			const result = await fetchTidePredictions();

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({
				time: '2026-04-01 06:12',
				height: 5.83,
				type: 'H'
			});
			expect(result[1]).toEqual({
				time: '2026-04-01 12:45',
				height: -0.14,
				type: 'L'
			});
		});

		it('maps type "H" to high and "L" to low', async () => {
			mockRequest.mockResolvedValueOnce(
				wrapResult({
					predictions: [
						makeNoaaPrediction({ type: 'H' }),
						makeNoaaPrediction({ type: 'L' })
					]
				})
			);

			const result = await fetchTidePredictions();

			expect(result[0].type).toBe('H');
			expect(result[1].type).toBe('L');
		});

		it('defaults non-H type values to "L"', async () => {
			mockRequest.mockResolvedValueOnce(
				wrapResult({
					predictions: [
						makeNoaaPrediction({ type: undefined }),
						makeNoaaPrediction({ type: 'X' })
					]
				})
			);

			const result = await fetchTidePredictions();

			expect(result[0].type).toBe('L');
			expect(result[1].type).toBe('L');
		});

		it('parses height string to float', async () => {
			mockRequest.mockResolvedValueOnce(
				wrapResult({
					predictions: [
						makeNoaaPrediction({ v: '3.140' }),
						makeNoaaPrediction({ v: '-1.250' })
					]
				})
			);

			const result = await fetchTidePredictions();

			expect(result[0].height).toBeCloseTo(3.14);
			expect(result[1].height).toBeCloseTo(-1.25);
		});

		it('extracts time string directly from NOAA response', async () => {
			mockRequest.mockResolvedValueOnce(
				wrapResult({
					predictions: [makeNoaaPrediction({ t: '2026-04-01 22:15' })]
				})
			);

			const result = await fetchTidePredictions();

			expect(result[0].time).toBe('2026-04-01 22:15');
		});

		it('uses default Point Reyes station when none specified', async () => {
			mockRequest.mockResolvedValueOnce(wrapResult({ predictions: [] }));

			await fetchTidePredictions();

			expect(mockRequest).toHaveBeenCalledWith(
				'NOAA_TIDES',
				'',
				expect.objectContaining({
					params: expect.objectContaining({
						station: '9415020',
						interval: 'hilo'
					})
				})
			);
		});

		it('passes custom station parameter', async () => {
			mockRequest.mockResolvedValueOnce(wrapResult({ predictions: [] }));

			await fetchTidePredictions('9414290');

			expect(mockRequest).toHaveBeenCalledWith(
				'NOAA_TIDES',
				'',
				expect.objectContaining({
					params: expect.objectContaining({
						station: '9414290'
					})
				})
			);
		});

		it('sends correct NOAA API parameters', async () => {
			mockRequest.mockResolvedValueOnce(wrapResult({ predictions: [] }));

			await fetchTidePredictions();

			expect(mockRequest).toHaveBeenCalledWith(
				'NOAA_TIDES',
				'',
				expect.objectContaining({
					params: expect.objectContaining({
						product: 'predictions',
						datum: 'MLLW',
						units: 'english',
						time_zone: 'lst_ldt',
						interval: 'hilo',
						format: 'json',
						application: 'MarinMonitor'
					})
				})
			);
		});

		it('returns empty array when predictions key is missing', async () => {
			mockRequest.mockResolvedValueOnce(wrapResult({}));

			const result = await fetchTidePredictions();

			expect(result).toEqual([]);
		});

		it('returns empty array when predictions is empty', async () => {
			mockRequest.mockResolvedValueOnce(wrapResult({ predictions: [] }));

			const result = await fetchTidePredictions();

			expect(result).toEqual([]);
		});

		it('returns empty array on network error', async () => {
			mockRequest.mockRejectedValueOnce(new Error('Network timeout'));

			const result = await fetchTidePredictions();

			expect(result).toEqual([]);
		});

		it('returns empty array on HTTP 500', async () => {
			mockRequest.mockRejectedValueOnce(new Error('HTTP 500: Internal Server Error'));

			const result = await fetchTidePredictions();

			expect(result).toEqual([]);
		});

		it('handles multiple predictions in correct order', async () => {
			const predictions = [
				makeNoaaPrediction({ t: '2026-04-01 03:00', v: '4.50', type: 'H' }),
				makeNoaaPrediction({ t: '2026-04-01 09:30', v: '0.20', type: 'L' }),
				makeNoaaPrediction({ t: '2026-04-01 15:45', v: '5.10', type: 'H' }),
				makeNoaaPrediction({ t: '2026-04-01 21:15', v: '-0.30', type: 'L' })
			];

			mockRequest.mockResolvedValueOnce(wrapResult({ predictions }));

			const result = await fetchTidePredictions();

			expect(result).toHaveLength(4);
			expect(result.map((p) => p.type)).toEqual(['H', 'L', 'H', 'L']);
			expect(result.map((p) => p.time)).toEqual([
				'2026-04-01 03:00',
				'2026-04-01 09:30',
				'2026-04-01 15:45',
				'2026-04-01 21:15'
			]);
		});
	});

	// ── fetchHourlyTides ─────────────────────────────────────────────────

	describe('fetchHourlyTides', () => {
		it('parses hourly predictions into time/height pairs', async () => {
			mockRequest.mockResolvedValueOnce(
				wrapResult({
					predictions: [
						{ t: '2026-04-01 00:00', v: '3.21' },
						{ t: '2026-04-01 01:00', v: '2.85' },
						{ t: '2026-04-01 02:00', v: '2.10' }
					]
				})
			);

			const result = await fetchHourlyTides();

			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ time: '2026-04-01 00:00', height: 3.21 });
			expect(result[1]).toEqual({ time: '2026-04-01 01:00', height: 2.85 });
			expect(result[2]).toEqual({ time: '2026-04-01 02:00', height: 2.1 });
		});

		it('does not include type field in output', async () => {
			mockRequest.mockResolvedValueOnce(
				wrapResult({
					predictions: [{ t: '2026-04-01 00:00', v: '3.21', type: 'H' }]
				})
			);

			const result = await fetchHourlyTides();

			expect(result[0]).not.toHaveProperty('type');
			expect(Object.keys(result[0])).toEqual(['time', 'height']);
		});

		it('uses default Point Reyes station when none specified', async () => {
			mockRequest.mockResolvedValueOnce(wrapResult({ predictions: [] }));

			await fetchHourlyTides();

			expect(mockRequest).toHaveBeenCalledWith(
				'NOAA_TIDES',
				'',
				expect.objectContaining({
					params: expect.objectContaining({
						station: '9415020',
						interval: '60'
					})
				})
			);
		});

		it('passes custom station parameter', async () => {
			mockRequest.mockResolvedValueOnce(wrapResult({ predictions: [] }));

			await fetchHourlyTides('9414290');

			expect(mockRequest).toHaveBeenCalledWith(
				'NOAA_TIDES',
				'',
				expect.objectContaining({
					params: expect.objectContaining({
						station: '9414290'
					})
				})
			);
		});

		it('sends interval=60 for hourly data', async () => {
			mockRequest.mockResolvedValueOnce(wrapResult({ predictions: [] }));

			await fetchHourlyTides();

			expect(mockRequest).toHaveBeenCalledWith(
				'NOAA_TIDES',
				'',
				expect.objectContaining({
					params: expect.objectContaining({
						interval: '60'
					})
				})
			);
		});

		it('returns empty array when predictions key is missing', async () => {
			mockRequest.mockResolvedValueOnce(wrapResult({}));

			const result = await fetchHourlyTides();

			expect(result).toEqual([]);
		});

		it('returns empty array when predictions is empty', async () => {
			mockRequest.mockResolvedValueOnce(wrapResult({ predictions: [] }));

			const result = await fetchHourlyTides();

			expect(result).toEqual([]);
		});

		it('returns empty array on network error', async () => {
			mockRequest.mockRejectedValueOnce(new Error('fetch failed'));

			const result = await fetchHourlyTides();

			expect(result).toEqual([]);
		});

		it('returns empty array on HTTP 500', async () => {
			mockRequest.mockRejectedValueOnce(new Error('HTTP 500: Internal Server Error'));

			const result = await fetchHourlyTides();

			expect(result).toEqual([]);
		});

		it('parses negative heights correctly', async () => {
			mockRequest.mockResolvedValueOnce(
				wrapResult({
					predictions: [{ t: '2026-04-01 05:00', v: '-0.45' }]
				})
			);

			const result = await fetchHourlyTides();

			expect(result[0].height).toBeCloseTo(-0.45);
		});
	});
});

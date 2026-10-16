/**
 * Tests for the AirNow/AQI client adapter
 *
 * Tests: response parsing, error handling, empty responses.
 * The color mapping / category / pollutant logic lives in $lib/server/airnow
 * and is tested there.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AirQualityData } from '$lib/types';

// ── Mocks ────────────────────────────────────────────────────────────
// Mock $app/environment before any module that imports it
vi.mock('$app/environment', () => ({ browser: true, dev: false, building: false }));

// Mock the logger so warn() calls don't pollute test output
vi.mock('$lib/config/api', () => ({
	logger: {
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

// ── Helpers ──────────────────────────────────────────────────────────
function mockFetchResponse(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
		...init
	});
}

function sampleAirQualityData(overrides: Partial<AirQualityData> = {}): AirQualityData {
	return {
		aqi: 42,
		category: 'Good',
		color: '#00e400',
		pollutant: 'PM2.5',
		area: 'San Rafael',
		observedAt: null,
		timestamp: Date.now(),
		...overrides
	};
}

// ── Client adapter tests ─────────────────────────────────────────────
describe('fetchAirQuality (client adapter)', () => {
	let fetchAirQuality: typeof import('./airnow').fetchAirQuality;
	const originalFetch = globalThis.fetch;

	beforeEach(async () => {
		vi.resetModules();
		const mod = await import('./airnow');
		fetchAirQuality = mod.fetchAirQuality;
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
		vi.restoreAllMocks();
	});

	// ── Successful responses ──

	it('parses a valid AQI response into AirQualityData', async () => {
		const data = sampleAirQualityData();
		globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(data));

		const result = await fetchAirQuality();

		expect(result).toEqual(data);
	});

	it('passes the correct URL and headers to fetch', async () => {
		const data = sampleAirQualityData();
		globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(data));

		await fetchAirQuality();

		expect(globalThis.fetch).toHaveBeenCalledWith(
			'/api/air-quality',
			expect.objectContaining({
				headers: { Accept: 'application/json' }
			})
		);
	});

	it('preserves all fields in AirQualityData', async () => {
		const data = sampleAirQualityData({
			aqi: 155,
			category: 'Unhealthy',
			color: '#ff0000',
			pollutant: 'O3',
			timestamp: 1700000000000
		});
		globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(data));

		const result = await fetchAirQuality();

		expect(result).not.toBeNull();
		expect(result!.aqi).toBe(155);
		expect(result!.category).toBe('Unhealthy');
		expect(result!.color).toBe('#ff0000');
		expect(result!.pollutant).toBe('O3');
		expect(result!.timestamp).toBe(1700000000000);
	});

	// ── Pollutant extraction ──

	it('correctly returns PM2.5 as the pollutant', async () => {
		const data = sampleAirQualityData({ pollutant: 'PM2.5' });
		globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(data));

		const result = await fetchAirQuality();
		expect(result!.pollutant).toBe('PM2.5');
	});

	it('correctly returns Ozone as the pollutant', async () => {
		const data = sampleAirQualityData({ pollutant: 'O3' });
		globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(data));

		const result = await fetchAirQuality();
		expect(result!.pollutant).toBe('O3');
	});

	it('correctly returns PM10 as the pollutant', async () => {
		const data = sampleAirQualityData({ pollutant: 'PM10' });
		globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(data));

		const result = await fetchAirQuality();
		expect(result!.pollutant).toBe('PM10');
	});

	// ── Category assignment ──

	it('correctly passes through "Good" category', async () => {
		const data = sampleAirQualityData({ aqi: 25, category: 'Good' });
		globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(data));

		const result = await fetchAirQuality();
		expect(result!.category).toBe('Good');
	});

	it('correctly passes through "Moderate" category', async () => {
		const data = sampleAirQualityData({ aqi: 75, category: 'Moderate' });
		globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(data));

		const result = await fetchAirQuality();
		expect(result!.category).toBe('Moderate');
	});

	it('correctly passes through "Unhealthy for Sensitive Groups" category', async () => {
		const data = sampleAirQualityData({
			aqi: 120,
			category: 'Unhealthy for Sensitive Groups'
		});
		globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(data));

		const result = await fetchAirQuality();
		expect(result!.category).toBe('Unhealthy for Sensitive Groups');
	});

	// ── Color mapping by AQI level ──

	it('returns green color for Good AQI', async () => {
		const data = sampleAirQualityData({ aqi: 30, color: '#00e400' });
		globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(data));

		const result = await fetchAirQuality();
		expect(result!.color).toBe('#00e400');
	});

	it('returns yellow color for Moderate AQI', async () => {
		const data = sampleAirQualityData({ aqi: 80, color: '#ffff00' });
		globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(data));

		const result = await fetchAirQuality();
		expect(result!.color).toBe('#ffff00');
	});

	it('returns red color for Unhealthy AQI', async () => {
		const data = sampleAirQualityData({ aqi: 170, color: '#ff0000' });
		globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(data));

		const result = await fetchAirQuality();
		expect(result!.color).toBe('#ff0000');
	});

	it('returns maroon color for Hazardous AQI', async () => {
		const data = sampleAirQualityData({ aqi: 350, color: '#7e0023' });
		globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(data));

		const result = await fetchAirQuality();
		expect(result!.color).toBe('#7e0023');
	});

	// ── Empty / no-data responses ──

	it('returns null for 204 No Content (no observations)', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

		const result = await fetchAirQuality();

		expect(result).toBeNull();
	});

	// ── Error handling ──

	it('returns null for 500 server error', async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

		const result = await fetchAirQuality();

		expect(result).toBeNull();
	});

	it('returns null for 503 service unavailable', async () => {
		globalThis.fetch = vi
			.fn()
			.mockResolvedValue(new Response('Service Unavailable', { status: 503 }));

		const result = await fetchAirQuality();

		expect(result).toBeNull();
	});

	it('returns null for 404 not found', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }));

		const result = await fetchAirQuality();

		expect(result).toBeNull();
	});

	it('returns null when fetch throws a network error', async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

		const result = await fetchAirQuality();

		expect(result).toBeNull();
	});

	it('returns null when fetch throws an abort error (timeout)', async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));

		const result = await fetchAirQuality();

		expect(result).toBeNull();
	});

	it('logs a warning when an error occurs', async () => {
		globalThis.fetch = vi.fn().mockRejectedValue(new Error('connection refused'));

		const { logger } = await import('$lib/config/api');

		await fetchAirQuality();

		expect(logger.warn).toHaveBeenCalledWith(
			'AirNow',
			expect.stringContaining('connection refused')
		);
	});

	it('logs a warning for non-ok HTTP responses', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(new Response('Bad Gateway', { status: 502 }));

		const { logger } = await import('$lib/config/api');

		await fetchAirQuality();

		expect(logger.warn).toHaveBeenCalledWith('AirNow', expect.stringContaining('502'));
	});
});

// ── v2 owner read ────────────────────────────────────────────────────
describe('readAirQualityOrThrow (v2 Outdoors)', () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it('returns the reading and when it was checked', async () => {
		const data = sampleAirQualityData({ area: 'San Rafael', observedAt: 1_700_000_000_000 });
		globalThis.fetch = vi.fn().mockResolvedValue(mockFetchResponse(data));
		const { readAirQualityOrThrow } = await import('./airnow');
		expect(await readAirQualityOrThrow({ now: () => 42 })).toEqual({
			reading: data,
			checkedAt: 42
		});
	});

	it('204 is a successful read with no current reading', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		const { readAirQualityOrThrow } = await import('./airnow');
		expect(await readAirQualityOrThrow({ now: () => 42 })).toEqual({
			reading: null,
			checkedAt: 42
		});
	});

	it('a failed read throws with its status, so the card can say why', async () => {
		globalThis.fetch = vi.fn().mockResolvedValue(new Response('x', { status: 502 }));
		const { readAirQualityOrThrow } = await import('./airnow');
		await expect(readAirQualityOrThrow()).rejects.toThrow('AirNow failed: 502');
	});

	it("passes the owner's signal through", async () => {
		const owner = new AbortController();
		owner.abort();
		globalThis.fetch = vi.fn((_url: string, init?: RequestInit) =>
			init?.signal?.aborted
				? Promise.reject(new DOMException('Aborted', 'AbortError'))
				: Promise.resolve(mockFetchResponse(sampleAirQualityData()))
		) as typeof fetch;
		const { readAirQualityOrThrow } = await import('./airnow');
		await expect(readAirQualityOrThrow({ signal: owner.signal })).rejects.toThrow();
	});
});

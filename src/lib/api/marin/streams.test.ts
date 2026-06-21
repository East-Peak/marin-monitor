import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StreamGauge } from './streams';

// Mock $lib/config/api (logger)
vi.mock('$lib/config/api', () => ({
	logger: {
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn()
	}
}));

// Mock fetchWithTimeout from fetch-helpers
const mockFetchWithTimeout = vi.fn();
vi.mock('./fetch-helpers', () => ({
	fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args)
}));

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────

/** Build a single USGS time series entry */
function makeTimeSeries(opts: {
	siteId: string;
	siteName: string;
	paramCode: string;
	value: string;
	dateTime: string;
	lat?: number;
	lon?: number;
}) {
	return {
		sourceInfo: {
			siteName: opts.siteName,
			siteCode: [{ value: opts.siteId }],
			geoLocation: {
				geogLocation: {
					latitude: opts.lat ?? 38.0,
					longitude: opts.lon ?? -122.5
				}
			}
		},
		variable: {
			variableCode: [{ value: opts.paramCode }]
		},
		values: [
			{
				value: [{ value: opts.value, dateTime: opts.dateTime }]
			}
		]
	};
}

/** Wrap time series array in a full USGS response structure */
function usgsResponse(timeSeries: ReturnType<typeof makeTimeSeries>[]) {
	return { value: { timeSeries } };
}

/** Create a mock Response object that resolves to JSON */
function mockResponse(body: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		json: () => Promise.resolve(body)
	} as unknown as Response;
}

// ────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────

describe('USGS Stream Gauge Adapter (fetchStreamGauges)', () => {
	let fetchStreamGauges: () => Promise<StreamGauge[]>;

	beforeEach(async () => {
		vi.clearAllMocks();
		// Dynamic import to get fresh module after mocks are set
		const mod = await import('./streams');
		fetchStreamGauges = mod.fetchStreamGauges;
	});

	// ── Request Construction ──────────────────

	describe('request construction', () => {
		it('calls USGS Water Services with correct URL parameters', async () => {
			mockFetchWithTimeout.mockResolvedValue(mockResponse(usgsResponse([])));

			await fetchStreamGauges();

			expect(mockFetchWithTimeout).toHaveBeenCalledOnce();
			const url = mockFetchWithTimeout.mock.calls[0][0] as string;
			expect(url).toContain('https://waterservices.usgs.gov/nwis/iv/');
			expect(url).toContain('countyCd=06041');
			expect(url).toContain('parameterCd=00060%2C00065');
			expect(url).toContain('format=json');
			expect(url).toContain('siteStatus=active');
		});

		it('sends Accept: application/json header', async () => {
			mockFetchWithTimeout.mockResolvedValue(mockResponse(usgsResponse([])));

			await fetchStreamGauges();

			const options = mockFetchWithTimeout.mock.calls[0][1] as RequestInit;
			expect(options.headers).toEqual({ Accept: 'application/json' });
		});
	});

	// ── Parsing Valid Responses ───────────────

	describe('parsing valid USGS response', () => {
		it('extracts streamflow (param 00060) from a single gauge', async () => {
			const data = usgsResponse([
				makeTimeSeries({
					siteId: '11459500',
					siteName: 'NOVATO C A NOVATO CA',
					paramCode: '00060',
					value: '12.5',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges).toHaveLength(1);
			expect(gauges[0].siteId).toBe('11459500');
			expect(gauges[0].streamflow).toBe(12.5);
			expect(gauges[0].gageHeight).toBeNull();
		});

		it('extracts gage height (param 00065) from a single gauge', async () => {
			const data = usgsResponse([
				makeTimeSeries({
					siteId: '11460000',
					siteName: 'CORTE MADERA C NR ROSS CA',
					paramCode: '00065',
					value: '3.78',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges).toHaveLength(1);
			expect(gauges[0].gageHeight).toBe(3.78);
			expect(gauges[0].streamflow).toBeNull();
		});

		it('merges streamflow and gage height for the same site', async () => {
			const data = usgsResponse([
				makeTimeSeries({
					siteId: '11459500',
					siteName: 'NOVATO C A NOVATO CA',
					paramCode: '00060',
					value: '12.5',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				}),
				makeTimeSeries({
					siteId: '11459500',
					siteName: 'NOVATO C A NOVATO CA',
					paramCode: '00065',
					value: '2.14',
					dateTime: '2026-03-15T10:15:00.000-08:00'
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges).toHaveLength(1);
			expect(gauges[0].streamflow).toBe(12.5);
			expect(gauges[0].gageHeight).toBe(2.14);
		});

		it('extracts latitude and longitude from geoLocation', async () => {
			const data = usgsResponse([
				makeTimeSeries({
					siteId: '11460151',
					siteName: 'REDWOOD C NR MUIR BEACH CA',
					paramCode: '00060',
					value: '5.0',
					dateTime: '2026-03-15T10:00:00.000-08:00',
					lat: 37.8653,
					lon: -122.5614
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges[0].lat).toBe(37.8653);
			expect(gauges[0].lon).toBe(-122.5614);
		});

		it('parses timestamp from dateTime string', async () => {
			const dt = '2026-03-15T10:30:00.000-08:00';
			const data = usgsResponse([
				makeTimeSeries({
					siteId: '11459500',
					siteName: 'NOVATO C A NOVATO CA',
					paramCode: '00060',
					value: '10',
					dateTime: dt
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges[0].timestamp).toBe(new Date(dt).getTime());
		});

		it('uses the latest timestamp across parameters for same site', async () => {
			const earlyDt = '2026-03-15T10:00:00.000-08:00';
			const lateDt = '2026-03-15T10:30:00.000-08:00';
			const data = usgsResponse([
				makeTimeSeries({
					siteId: '11459500',
					siteName: 'NOVATO C A NOVATO CA',
					paramCode: '00060',
					value: '10',
					dateTime: earlyDt
				}),
				makeTimeSeries({
					siteId: '11459500',
					siteName: 'NOVATO C A NOVATO CA',
					paramCode: '00065',
					value: '2',
					dateTime: lateDt
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges[0].timestamp).toBe(new Date(lateDt).getTime());
		});

		it('uses the last value in the values array (most recent reading)', async () => {
			const data = usgsResponse([
				{
					sourceInfo: {
						siteName: 'TEST CREEK',
						siteCode: [{ value: '11459500' }],
						geoLocation: {
							geogLocation: { latitude: 38.0, longitude: -122.5 }
						}
					},
					variable: {
						variableCode: [{ value: '00060' }]
					},
					values: [
						{
							value: [
								{ value: '5.0', dateTime: '2026-03-15T09:00:00.000-08:00' },
								{ value: '7.0', dateTime: '2026-03-15T09:15:00.000-08:00' },
								{ value: '12.0', dateTime: '2026-03-15T09:30:00.000-08:00' }
							]
						}
					]
				}
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges[0].streamflow).toBe(12.0);
		});
	});

	// ── Short Name Mapping ───────────────────

	describe('short name mapping', () => {
		it('maps known site IDs to short names', async () => {
			const knownSites: Record<string, string> = {
				'11459500': 'Novato Creek',
				'11460000': 'Corte Madera Ck',
				'11460151': 'Redwood Creek',
				'11460400': 'Lagunitas Ck (SPT)',
				'11460600': 'Lagunitas Ck (PR)',
				'11460605': 'Olema Creek',
				'11460750': 'Walker Creek'
			};

			const series = Object.entries(knownSites).map(([siteId]) =>
				makeTimeSeries({
					siteId,
					siteName: `FULL NAME FOR ${siteId}, MARIN COUNTY CA`,
					paramCode: '00060',
					value: '1',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				})
			);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(usgsResponse(series)));

			const gauges = await fetchStreamGauges();

			for (const gauge of gauges) {
				expect(gauge.shortName).toBe(knownSites[gauge.siteId]);
			}
		});

		it('falls back to first comma-separated segment for unknown sites', async () => {
			const data = usgsResponse([
				makeTimeSeries({
					siteId: '99999999',
					siteName: 'MYSTERY CREEK NR STINSON BEACH, MARIN COUNTY CA',
					paramCode: '00060',
					value: '3',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges[0].shortName).toBe('MYSTERY CREEK NR STINSON BEACH');
		});

		it('uses full siteName if no comma exists for unknown sites', async () => {
			const data = usgsResponse([
				makeTimeSeries({
					siteId: '88888888',
					siteName: 'SOME CREEK',
					paramCode: '00060',
					value: '1',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges[0].shortName).toBe('SOME CREEK');
		});
	});

	// ── Multiple Sites & Sorting ─────────────

	describe('multiple sites and sorting', () => {
		it('parses multiple gauges from a response', async () => {
			const data = usgsResponse([
				makeTimeSeries({
					siteId: '11459500',
					siteName: 'NOVATO C A NOVATO CA',
					paramCode: '00060',
					value: '12',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				}),
				makeTimeSeries({
					siteId: '11460151',
					siteName: 'REDWOOD C NR MUIR BEACH CA',
					paramCode: '00060',
					value: '5',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				}),
				makeTimeSeries({
					siteId: '11460605',
					siteName: 'OLEMA C NR BOLINAS CA',
					paramCode: '00060',
					value: '8',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges).toHaveLength(3);
		});

		it('sorts gauges alphabetically by name', async () => {
			const data = usgsResponse([
				makeTimeSeries({
					siteId: '11460151',
					siteName: 'REDWOOD C NR MUIR BEACH CA',
					paramCode: '00060',
					value: '5',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				}),
				makeTimeSeries({
					siteId: '11459500',
					siteName: 'NOVATO C A NOVATO CA',
					paramCode: '00060',
					value: '12',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				}),
				makeTimeSeries({
					siteId: '11460605',
					siteName: 'AOLEMA C NR BOLINAS CA',
					paramCode: '00060',
					value: '8',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			const names = gauges.map((g) => g.name);
			expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
		});
	});

	// ── Invalid / Edge-Case Values ───────────

	describe('filtering invalid values', () => {
		it('ignores negative streamflow values', async () => {
			const data = usgsResponse([
				makeTimeSeries({
					siteId: '11459500',
					siteName: 'NOVATO C A NOVATO CA',
					paramCode: '00060',
					value: '-999999',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges).toHaveLength(1);
			expect(gauges[0].streamflow).toBeNull();
		});

		it('ignores NaN values', async () => {
			const data = usgsResponse([
				makeTimeSeries({
					siteId: '11459500',
					siteName: 'NOVATO C A NOVATO CA',
					paramCode: '00060',
					value: 'Ice',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges).toHaveLength(1);
			expect(gauges[0].streamflow).toBeNull();
		});

		it('ignores Infinity values', async () => {
			const data = usgsResponse([
				makeTimeSeries({
					siteId: '11459500',
					siteName: 'NOVATO C A NOVATO CA',
					paramCode: '00060',
					value: 'Infinity',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges[0].streamflow).toBeNull();
		});

		it('accepts zero as a valid streamflow value', async () => {
			const data = usgsResponse([
				makeTimeSeries({
					siteId: '11459500',
					siteName: 'NOVATO C A NOVATO CA',
					paramCode: '00060',
					value: '0',
					dateTime: '2026-03-15T10:00:00.000-08:00'
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges[0].streamflow).toBe(0);
		});

		it('skips time series entries with no siteId', async () => {
			const data = usgsResponse([
				{
					sourceInfo: {
						siteName: 'GHOST GAUGE',
						siteCode: [{ value: '' }],
						geoLocation: {
							geogLocation: { latitude: 38.0, longitude: -122.5 }
						}
					},
					variable: { variableCode: [{ value: '00060' }] },
					values: [
						{
							value: [{ value: '10', dateTime: '2026-03-15T10:00:00.000-08:00' }]
						}
					]
				}
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges).toHaveLength(0);
		});

		it('skips time series entries with empty values array', async () => {
			const data = usgsResponse([
				{
					sourceInfo: {
						siteName: 'EMPTY GAUGE',
						siteCode: [{ value: '11459500' }],
						geoLocation: {
							geogLocation: { latitude: 38.0, longitude: -122.5 }
						}
					},
					variable: { variableCode: [{ value: '00060' }] },
					values: [{ value: [] }]
				}
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges).toHaveLength(0);
		});
	});

	// ── Empty Responses ──────────────────────

	describe('empty responses', () => {
		it('returns empty array for response with no time series', async () => {
			mockFetchWithTimeout.mockResolvedValue(mockResponse(usgsResponse([])));

			const gauges = await fetchStreamGauges();

			expect(gauges).toEqual([]);
		});

		it('returns empty array when value.timeSeries is undefined', async () => {
			mockFetchWithTimeout.mockResolvedValue(mockResponse({ value: {} }));

			const gauges = await fetchStreamGauges();

			expect(gauges).toEqual([]);
		});

		it('returns empty array when value is undefined', async () => {
			mockFetchWithTimeout.mockResolvedValue(mockResponse({}));

			const gauges = await fetchStreamGauges();

			expect(gauges).toEqual([]);
		});
	});

	// ── Error Handling ───────────────────────

	describe('error handling', () => {
		it('returns empty array on HTTP error response', async () => {
			mockFetchWithTimeout.mockResolvedValue(mockResponse(null, false, 503));

			const gauges = await fetchStreamGauges();

			expect(gauges).toEqual([]);
		});

		it('returns empty array when fetch throws a network error', async () => {
			mockFetchWithTimeout.mockRejectedValue(new Error('Network error'));

			const gauges = await fetchStreamGauges();

			expect(gauges).toEqual([]);
		});

		it('returns empty array when JSON parsing fails', async () => {
			mockFetchWithTimeout.mockResolvedValue({
				ok: true,
				status: 200,
				json: () => Promise.reject(new Error('Invalid JSON'))
			} as unknown as Response);

			const gauges = await fetchStreamGauges();

			expect(gauges).toEqual([]);
		});

		it('logs warning on fetch failure', async () => {
			const { logger } = await import('$lib/config/api');
			mockFetchWithTimeout.mockRejectedValue(new Error('timeout'));

			await fetchStreamGauges();

			expect(logger.warn).toHaveBeenCalledWith('USGS-Water', expect.stringContaining('timeout'));
		});

		it('logs warning on HTTP error status', async () => {
			const { logger } = await import('$lib/config/api');
			mockFetchWithTimeout.mockResolvedValue(mockResponse(null, false, 429));

			await fetchStreamGauges();

			expect(logger.warn).toHaveBeenCalledWith('USGS-Water', expect.stringContaining('429'));
		});
	});

	// ── Full Integration-Style Parsing ───────

	describe('realistic USGS response', () => {
		it('correctly parses a multi-gauge, multi-parameter response', async () => {
			const data = usgsResponse([
				// Novato Creek - streamflow
				makeTimeSeries({
					siteId: '11459500',
					siteName: 'NOVATO C A NOVATO CA',
					paramCode: '00060',
					value: '15.3',
					dateTime: '2026-03-15T14:00:00.000-08:00',
					lat: 38.1072,
					lon: -122.5697
				}),
				// Novato Creek - gage height
				makeTimeSeries({
					siteId: '11459500',
					siteName: 'NOVATO C A NOVATO CA',
					paramCode: '00065',
					value: '3.21',
					dateTime: '2026-03-15T14:00:00.000-08:00',
					lat: 38.1072,
					lon: -122.5697
				}),
				// Lagunitas Creek (SPT) - streamflow only
				makeTimeSeries({
					siteId: '11460400',
					siteName: 'LAGUNITAS C A SAMUEL P TAYLOR ST PK CA',
					paramCode: '00060',
					value: '42.0',
					dateTime: '2026-03-15T14:15:00.000-08:00',
					lat: 38.02,
					lon: -122.73
				}),
				// Walker Creek - gage height only
				makeTimeSeries({
					siteId: '11460750',
					siteName: 'WALKER C NR TOMALES CA',
					paramCode: '00065',
					value: '1.85',
					dateTime: '2026-03-15T14:10:00.000-08:00',
					lat: 38.2,
					lon: -122.88
				})
			]);
			mockFetchWithTimeout.mockResolvedValue(mockResponse(data));

			const gauges = await fetchStreamGauges();

			expect(gauges).toHaveLength(3);

			// Sorted alphabetically by name
			const lagunitas = gauges.find((g) => g.siteId === '11460400')!;
			expect(lagunitas.shortName).toBe('Lagunitas Ck (SPT)');
			expect(lagunitas.streamflow).toBe(42.0);
			expect(lagunitas.gageHeight).toBeNull();

			const novato = gauges.find((g) => g.siteId === '11459500')!;
			expect(novato.shortName).toBe('Novato Creek');
			expect(novato.streamflow).toBe(15.3);
			expect(novato.gageHeight).toBe(3.21);

			const walker = gauges.find((g) => g.siteId === '11460750')!;
			expect(walker.shortName).toBe('Walker Creek');
			expect(walker.streamflow).toBeNull();
			expect(walker.gageHeight).toBe(1.85);
		});
	});
});

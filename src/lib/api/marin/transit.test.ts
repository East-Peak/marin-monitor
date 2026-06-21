import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./fetch-helpers', () => ({
	fetchWithTimeout: vi.fn()
}));

vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { fetchTransitAlerts } from './transit';
import { fetchWithTimeout } from './fetch-helpers';

const mockFetch = vi.mocked(fetchWithTimeout);

function makeResponse(data: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		json: () => Promise.resolve(data)
	} as Response;
}

function makeGtfsResponse(entities: unknown[] = []): object {
	return {
		Header: { Timestamp: 1711900000 },
		Entities: entities
	};
}

function makeAlertEntity(
	overrides: {
		id?: string;
		header?: string;
		description?: string;
		url?: string;
		routes?: string[];
		startTime?: number;
	} = {}
): object {
	return {
		Id: overrides.id ?? 'alert-1',
		Alert: {
			ActivePeriods: overrides.startTime ? [{ Start: overrides.startTime }] : [],
			InformedEntities: (overrides.routes ?? []).map((r) => ({
				AgencyId: 'GG',
				RouteId: r
			})),
			HeaderText: {
				Translations: [{ Text: overrides.header ?? 'Service Alert', Language: 'en' }]
			},
			DescriptionText: overrides.description
				? { Translations: [{ Text: overrides.description, Language: 'en' }] }
				: undefined,
			Url: overrides.url ? { Translations: [{ Text: overrides.url, Language: 'en' }] } : undefined
		}
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('fetchTransitAlerts', () => {
	it('fetches alerts from all 5 Marin agencies', async () => {
		// Each agency returns empty alerts
		mockFetch.mockResolvedValue(makeResponse(makeGtfsResponse([])));

		const promise = fetchTransitAlerts();
		// Advance past all the 500ms delays
		await vi.advanceTimersByTimeAsync(3000);
		const result = await promise;

		expect(result.items).toEqual([]);
		expect(result.errors).toEqual([]);
		// 5 agencies
		expect(mockFetch).toHaveBeenCalledTimes(5);
	});

	it('parses GTFS alert entities into NewsItems', async () => {
		const entity = makeAlertEntity({
			id: 'gg-alert-42',
			header: 'Route 4 Detour',
			description: 'Detour via 101 due to construction.',
			url: 'https://goldengate.org/alert',
			routes: ['4', '92'],
			startTime: 1711900000
		});

		// First agency (GG) returns an alert, rest empty
		mockFetch
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([entity])))
			.mockResolvedValue(makeResponse(makeGtfsResponse([])));

		const promise = fetchTransitAlerts();
		await vi.advanceTimersByTimeAsync(3000);
		const result = await promise;

		expect(result.items).toHaveLength(1);
		const item = result.items[0];
		expect(item.id).toBe('511-GG-gg-alert-42');
		expect(item.title).toBe('Route 4 Detour (4, 92)');
		expect(item.link).toBe('https://goldengate.org/alert');
		expect(item.description).toBe('Detour via 101 due to construction.');
		expect(item.source).toBe('511 \u2013 Golden Gate Transit');
		expect(item.category).toBe('safety');
		expect(item.isAlert).toBe(true);
		expect(item.timestamp).toBe(1711900000 * 1000);
	});

	it('uses ferry source name for GF and AF agencies', async () => {
		// Return empty for all except GF (index 1) and AF (index 4)
		const ferryAlert = makeAlertEntity({ id: 'f-1', header: 'Ferry Delay' });

		mockFetch
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([]))) // GG
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([ferryAlert]))) // GF
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([]))) // MA
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([]))) // SA
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([ferryAlert]))); // AF

		const promise = fetchTransitAlerts();
		await vi.advanceTimersByTimeAsync(3000);
		const result = await promise;

		expect(result.items).toHaveLength(2);
		// Ferry agencies use direct name, not "511 – " prefix
		expect(result.items.find((i) => i.id.includes('GF'))?.source).toBe('Golden Gate Ferry');
		expect(result.items.find((i) => i.id.includes('AF'))?.source).toBe('Angel Island Ferry');
	});

	it('deduplicates route IDs in title', async () => {
		const entity = makeAlertEntity({
			routes: ['101', '101', '92']
		});
		// routes with duplicates
		(entity as any).Alert.InformedEntities = [
			{ RouteId: '101' },
			{ RouteId: '101' },
			{ RouteId: '92' }
		];

		mockFetch
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([entity])))
			.mockResolvedValue(makeResponse(makeGtfsResponse([])));

		const promise = fetchTransitAlerts();
		await vi.advanceTimersByTimeAsync(3000);
		const result = await promise;

		expect(result.items[0].title).toBe('Service Alert (101, 92)');
	});

	it('sorts results by timestamp descending (newest first)', async () => {
		const old = makeAlertEntity({ id: 'old', header: 'Old', startTime: 1000 });
		const recent = makeAlertEntity({ id: 'new', header: 'New', startTime: 9999 });

		mockFetch
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([old, recent])))
			.mockResolvedValue(makeResponse(makeGtfsResponse([])));

		const promise = fetchTransitAlerts();
		await vi.advanceTimersByTimeAsync(3000);
		const result = await promise;

		expect(result.items[0].id).toContain('new');
		expect(result.items[1].id).toContain('old');
	});

	it('collects errors from failed agencies without stopping others', async () => {
		mockFetch
			.mockResolvedValueOnce(makeResponse(null, false, 503)) // GG fails
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([]))) // GF ok
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([]))) // MA ok
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([]))) // SA ok
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([]))); // AF ok

		const promise = fetchTransitAlerts();
		await vi.advanceTimersByTimeAsync(3000);
		const result = await promise;

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain('Golden Gate Transit');
	});

	it('handles network failure for all agencies', async () => {
		mockFetch.mockRejectedValue(new Error('Network down'));

		const promise = fetchTransitAlerts();
		await vi.advanceTimersByTimeAsync(3000);
		const result = await promise;

		expect(result.items).toEqual([]);
		expect(result.errors).toHaveLength(5);
	});

	it('uses fallback URL when alert has no Url', async () => {
		const entity = makeAlertEntity({ id: 'no-url' });
		// No URL set

		mockFetch
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([entity])))
			.mockResolvedValue(makeResponse(makeGtfsResponse([])));

		const promise = fetchTransitAlerts();
		await vi.advanceTimersByTimeAsync(3000);
		const result = await promise;

		expect(result.items[0].link).toBe('https://511.org/transit/service-alerts');
	});
});

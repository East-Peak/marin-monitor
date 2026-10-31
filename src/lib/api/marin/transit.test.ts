import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./fetch-helpers', () => {
	const fetchWithTimeout = vi.fn();
	return {
		fetchWithTimeout,
		// The body is read by the same call; the tests' fake responses flow through `read`.
		fetchAndRead: vi.fn(
			(url: string, options: RequestInit | undefined, read: (r: Response) => Promise<unknown>) =>
				fetchWithTimeout(url, options).then(read)
		)
	};
});

vi.mock('$lib/config/api', () => ({
	logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import { fetchTransitAlerts, timingAt } from './transit';
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
		informedEntities?: Array<{ RouteId?: string; AgencyId?: string }>;
	} = {}
): object {
	return {
		Id: overrides.id ?? 'alert-1',
		Alert: {
			ActivePeriods: overrides.startTime ? [{ Start: overrides.startTime }] : [],
			InformedEntities:
				overrides.informedEntities ??
				(overrides.routes ?? []).map((r) => ({
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
		expect(item.alertLive?.seenAt).toEqual(expect.any(Number));
	});

	it("keeps 511's active periods for the alert's status", async () => {
		const entity = {
			Id: 'closed',
			Alert: {
				HeaderText: { Translations: [{ Text: 'closed' }] },
				ActivePeriods: [{ Start: 100, End: 200 }, { Start: 300 }]
			}
		};
		mockFetch
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([entity] as never)))
			.mockResolvedValue(makeResponse(makeGtfsResponse([])));

		const promise = fetchTransitAlerts();
		await vi.advanceTimersByTimeAsync(3000);
		const { items } = await promise;
		expect(items[0].alertLive?.periods).toEqual([
			{ start: 100_000, end: 200_000 },
			{ start: 300_000, end: null }
		]);
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
			routes: ['101', '101', '92'],
			// Override InformedEntities to test dedup with exact duplicate RouteIds (no AgencyId)
			informedEntities: [{ RouteId: '101' }, { RouteId: '101' }, { RouteId: '92' }]
		});

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

	it('reports each agency in order: its own alerts in feed order, its feed time, or its failure (v2)', async () => {
		const linked = makeAlertEntity({
			id: 'a1',
			header: 'Route 35 detour',
			url: 'https://marintransit.gov/35',
			routes: ['35']
		});
		const unsafe = makeAlertEntity({
			id: 'a2',
			header: 'Night closure',
			url: 'javascript:alert(1)'
		});
		const plain = makeAlertEntity({ id: 'a3', header: 'Stop moved' });
		mockFetch
			.mockResolvedValueOnce(makeResponse(null, false, 503)) // GG
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([]))) // GF
			.mockResolvedValueOnce(makeResponse(makeGtfsResponse([linked, unsafe, plain]))) // MA
			.mockRejectedValueOnce(new Error('Network down')) // SA
			.mockResolvedValueOnce(makeResponse({ Entities: [] })); // AF: no Header
		const promise = fetchTransitAlerts();
		await vi.advanceTimersByTimeAsync(3000);
		const { agencies, items } = await promise;
		expect(agencies).toEqual([
			{
				id: 'GG',
				name: 'Golden Gate Transit',
				alerts: null,
				observedAt: null,
				error: 'Golden Gate Transit: Transit proxy failed for GG: 503'
			},
			{ id: 'GF', name: 'Golden Gate Ferry', alerts: [], observedAt: 1711900000000, error: null },
			{
				id: 'MA',
				name: 'Marin Transit',
				alerts: [
					{
						id: '511-MA-a1',
						title: 'Route 35 detour (35)',
						headline: 'Route 35 detour',
						description: null,
						stopIds: [],
						periods: [],
						url: 'https://marintransit.gov/35'
					},
					{
						id: '511-MA-a2',
						title: 'Night closure',
						headline: 'Night closure',
						description: null,
						stopIds: [],
						periods: [],
						url: null
					},
					{
						id: '511-MA-a3',
						title: 'Stop moved',
						headline: 'Stop moved',
						description: null,
						stopIds: [],
						periods: [],
						url: null
					}
				],
				observedAt: 1711900000000,
				error: null
			},
			{ id: 'SA', name: 'SMART', alerts: null, observedAt: null, error: 'SMART: Network down' },
			{ id: 'AF', name: 'Angel Island Ferry', alerts: [], observedAt: null, error: null }
		]);
		// The legacy shape is untouched: the unsafe link still falls back as before.
		expect(items.find((i) => i.id === '511-MA-a2')?.link).toBe('javascript:alert(1)');
	});

	/** One live Marin Transit entity (fixtures-getting-around-2026-10-16/MA.json), feed time 1792149658. */
	const READ_AT = 1792149658;
	const live = (
		periods: { Start?: number; End?: number }[],
		over: Record<string, unknown> = {}
	) => ({
		Id: 'MA_Night Closure - SB Terra Linda-1791823141476',
		Alert: {
			ActivePeriods: periods,
			InformedEntities: [
				{ AgencyId: 'MA', Trip: null, StopId: '42112' },
				{ AgencyId: 'MA', Trip: null, StopId: '42112' },
				{ AgencyId: 'MA', Trip: null, StopId: '40268' }
			],
			HeaderText: { Translations: [{ Text: 'Night Closure - SB Terra Linda', Language: 'en' }] },
			DescriptionText: {
				Translations: [
					{
						Text: ' Due to construction, this stop will be closed from 8pm to 6am the next day from 10/12 to 10/16. ',
						Language: 'en'
					}
				]
			},
			...over
		}
	});
	async function maAlerts(entities: unknown[]) {
		mockFetch.mockImplementation(async (url) =>
			makeResponse(
				String(url).endsWith('MA')
					? { Header: { Timestamp: READ_AT }, Entities: entities }
					: makeGtfsResponse([])
			)
		);
		const promise = fetchTransitAlerts();
		await vi.advanceTimersByTimeAsync(3000);
		return (await promise).agencies.find((a) => a.id === 'MA')!.alerts!;
	}

	it('keeps headline, description, distinct stop IDs (v2: the description explains a night closure)', async () => {
		const [a] = await maAlerts([live([{ Start: READ_AT - 60, End: READ_AT + 60 }])]);
		expect(a).toMatchObject({
			headline: 'Night Closure - SB Terra Linda',
			description:
				'Due to construction, this stop will be closed from 8pm to 6am the next day from 10/12 to 10/16.',
			stopIds: ['42112', '40268'],
			periods: [{ start: (READ_AT - 60) * 1000, end: (READ_AT + 60) * 1000 }]
		});
		const [blank] = await maAlerts([
			live([], { DescriptionText: { Translations: [{ Text: '', Language: 'en' }] } })
		]);
		expect(blank.description).toBeNull();
	});

	it('inverted period → timing unverified; readable periods none containing now → not-now; judged by the clock passed in (Codex GA-v2 #4)', () => {
		const T = READ_AT * 1000;
		const H = 3_600_000;
		// The live 2026-10-16 night closures: every end before its start.
		expect(
			timingAt(
				[
					{ start: 1792119600_000, end: 1792069200_000 },
					{ start: 1792206000_000, end: 1792155600_000 }
				],
				T
			)
		).toBe('unverified');
		expect(timingAt([{ start: T + H, end: T + 2 * H }], T)).toBe('not-now');
		expect(timingAt([{ start: T - H, end: null }], T)).toBe('now'); // open-ended
		expect(timingAt([], T)).toBe('now'); // no period: GTFS-RT says always active
		expect(
			timingAt(
				[
					{ start: T + H, end: T + 2 * H },
					{ start: T - 60_000, end: T + 60_000 }
				],
				T
			)
		).toBe('now');
		expect(
			timingAt(
				[
					{ start: T + H, end: T + 2 * H },
					{ start: null, end: null }
				],
				T
			)
		).toBe('unverified');
		// Starting a minute after the feed was read: in effect two minutes later.
		const later = [{ start: T + 60_000, end: T + H }];
		expect([timingAt(later, T), timingAt(later, T + 120_000)]).toEqual(['not-now', 'now']);
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

	// ---------- Owner lifetime (dashboard spec §13.6; Codex PR1 C1) ----------

	it('starts no further agency request or delay once the owner signal aborts', async () => {
		const owner = new AbortController();
		mockFetch.mockImplementation(async () => {
			owner.abort(); // the dashboard unmounts while the first agency is in flight
			return makeResponse(makeGtfsResponse([]));
		});

		const promise = fetchTransitAlerts({ signal: owner.signal });
		await vi.advanceTimersByTimeAsync(3000);
		await promise;

		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('passes the owner signal to each agency request', async () => {
		const owner = new AbortController();
		mockFetch.mockResolvedValue(makeResponse(makeGtfsResponse([])));

		const promise = fetchTransitAlerts({ signal: owner.signal });
		await vi.advanceTimersByTimeAsync(3000);
		await promise;

		for (const [, init] of mockFetch.mock.calls) expect(init?.signal).toBe(owner.signal);
	});
});

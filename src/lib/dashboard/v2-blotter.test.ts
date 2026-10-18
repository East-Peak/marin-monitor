import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { SheriffCrimeRecord } from '$lib/api/marin/blotter';

vi.mock('$app/environment', () => ({ browser: true, version: 'test' }));
// The real liveData: a cached copy after a failed read must reach the reader as a failure.
vi.mock('$lib/services/client', async (orig) => ({
	...(await orig<object>()),
	serviceClient: { request: vi.fn() }
}));
vi.mock('$lib/config/api', () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
// Every other part v2 reads settles at once with nothing.
const nothing = async () => [];
vi.mock('$lib/api/marin/nps', async (orig) => ({
	...(await orig<object>()),
	fetchNpsAlerts: nothing
}));
vi.mock('$lib/api/marin/usgs', async (orig) => ({
	...(await orig<object>()),
	readEarthquakesOrThrow: async () => ({ quakes: [], observedAt: null })
}));
vi.mock('$lib/api/marin/transit', async (orig) => ({
	...(await orig<object>()),
	fetchTransitAlerts: async () => ({ items: [], agencies: [] })
}));
vi.mock('$lib/api/marin/police-logs', async (orig) => ({
	...(await orig<object>()),
	fetchSupplementalPoliceLogs: nothing
}));
vi.mock('$lib/api/marin/activity', async (orig) => ({
	...(await orig<object>()),
	fetchSupplementalActivityFeeds: nothing
}));
vi.mock('$lib/api/marin/seeclickfix', async (orig) => ({
	...(await orig<object>()),
	readSeeClickFixIssues: async () => ({ items: [], observedAt: null })
}));
vi.mock('$lib/api/marin/news-snapshot', async (orig) => ({
	...(await orig<object>()),
	fetchNewsSnapshot: async () => ({ status: 'unavailable', reason: 'test' })
}));

const { serviceClient } = await import('$lib/services/client');
const { createDashboardV2Controller } = await import('./v2-controller');
const { blotterView } = await import('./v2-blotter');
const request = vi.mocked(serviceClient.request);

const H = 3_600_000;
// 3:20 PM PDT, Sunday Oct 18.
const START = Date.parse('2026-10-18T15:20:00-07:00');
let clock = START;
const owners: AbortController[] = [];
const record = (over: Partial<SheriffCrimeRecord> = {}): SheriffCrimeRecord => ({
	unique_id: 'SO1',
	incident_date_time: '2026-10-18T09:00:00.000',
	crime: 'BURG AUTO',
	crime_class: 'BURGLARY',
	incident_street_address: '2XX BON AIR RD',
	incident_city_town: 'KENTFIELD',
	incident_city_town_mapping: 'KENTFIELD',
	latitude: '37.95',
	longitude: '-122.55',
	...over
});

function blotterRead(data: SheriffCrimeRecord[], fromCache: false | 'stale-fallback' = false) {
	return { data, fromCache } as never;
}

function controller() {
	const owner = new AbortController();
	owners.push(owner);
	return createDashboardV2Controller({
		signal: owner.signal,
		now: () => clock,
		datasets: [],
		briefFetchers: {
			hourly: vi.fn(),
			observation: vi.fn(),
			tides: vi.fn(),
			history: vi.fn(),
			tideHourly: vi.fn()
		} as never,
		fetchAdvisories: async () => ({ advisories: [], unreadable: 0 })
	});
}

async function cycle(c: ReturnType<typeof controller>, first: boolean) {
	if (first) await c.start();
	else await c.refresh({ force: true });
	const entry = get(c.sources).find((e) => e.id === 'part:sheriff-blotter');
	return { entry, view: blotterView(entry, get(c.blotter), clock) };
}

beforeEach(() => {
	clock = START;
	request.mockReset();
});
afterEach(() => {
	for (const o of owners.splice(0)) o.abort();
});

describe('the sheriff blotter, through the real reader and the controller (NEWSPIN1)', () => {
	it('an upstream failure on the first read: unavailable, no count', async () => {
		request.mockRejectedValueOnce(new Error('HTTP 500'));
		const { entry, view } = await cycle(controller(), true);
		expect(entry?.state).toBe('unavailable');
		expect(view).toMatchObject({ state: 'unavailable', reports: [], count: null, hidden: null });
	});

	it('a cached copy served after a failed read is a failure too', async () => {
		request.mockResolvedValueOnce(blotterRead([record()], 'stale-fallback'));
		const { entry, view } = await cycle(controller(), true);
		expect(entry?.state).toBe('unavailable');
		expect(view.count).toBeNull();
	});

	it('an empty read is ok: 0 reports, said only on that fresh read', async () => {
		request.mockResolvedValueOnce(blotterRead([]));
		const { entry, view } = await cycle(controller(), true);
		expect(entry?.state).toBe('ok');
		expect(view).toMatchObject({ state: 'value', kept: null, count: 0, hidden: 0 });
	});

	it('a failure after a success keeps the rows with a note, and they age out past 36 h', async () => {
		const c = controller();
		request.mockResolvedValueOnce(
			blotterRead([
				record(),
				record({ unique_id: 'SO2', crime: 'DOM VIOL', crime_class: 'ASSAULT' })
			])
		);
		const first = await cycle(c, true);
		expect(first.view).toMatchObject({ state: 'value', count: 1, hidden: 1, capped: false });

		clock = START + H;
		request.mockRejectedValueOnce(new Error('HTTP 503'));
		const kept = await cycle(c, false);
		expect(kept.entry?.state).toBe('stale');
		expect(kept.view.kept).toBe('Kept from 3:20 PM · HTTP 503');
		expect(kept.view.reports.map((r) => r.id)).toEqual(['blotter-SO1']);

		// 9 AM Oct 18 + 36 h = 9 PM Oct 19.
		clock = Date.parse('2026-10-19T21:01:00-07:00');
		request.mockRejectedValueOnce(new Error('HTTP 503'));
		const aged = await cycle(c, false);
		expect(aged.view.reports).toEqual([]);
		expect(aged.view.count).toBeNull(); // a kept read never vouches for "0"
	});
});

describe('blotterView', () => {
	it('says when the row cap was hit', () => {
		const entry = {
			id: 'part:sheriff-blotter',
			name: 'Sheriff blotter',
			state: 'ok' as const,
			observedAt: START,
			maxAgeMs: 30 * 60_000,
			detail: null
		};
		const view = blotterView(
			entry,
			{ reports: [], hiddenAt: [], capped: true, observedAt: START },
			START
		);
		expect(view.capped).toBe(true);
	});
});

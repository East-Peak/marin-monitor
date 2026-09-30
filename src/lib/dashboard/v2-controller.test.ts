import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { NewsSnapshotResponse } from '$lib/news/snapshot';
import type { NewsItem } from '$lib/types';
import { SOURCE_INVENTORY } from '$lib/server/health/inventory';
import { getLocationById } from '$lib/config/locations';

vi.mock('$app/environment', () => ({ browser: true, version: 'test' }));
vi.mock('$lib/services/client', () => ({ serviceClient: { request: vi.fn() } }));
const { loadAllNews } = vi.hoisted(() => ({ loadAllNews: vi.fn() }));
vi.mock('$lib/api/marin/load-all', () => ({ loadAllNews }));
const fetchers = vi.hoisted(() => ({
	gas: vi.fn(),
	ev: vi.fn(),
	coffee: vi.fn(),
	fitness: vi.fn(),
	strava: vi.fn()
}));
// Keep every other export real: $lib/api/marin/index.ts re-exports these modules.
vi.mock('$lib/api/marin/gas-prices', async (orig) => ({
	...(await orig<object>()),
	fetchGasPriceDataWithStatus: fetchers.gas
}));
vi.mock('$lib/api/marin/ev-charging', async (orig) => ({
	...(await orig<object>()),
	fetchEvChargingDataWithStatus: fetchers.ev
}));
vi.mock('$lib/api/marin/coffee', async (orig) => ({
	...(await orig<object>()),
	fetchCoffeeIndexDataWithStatus: fetchers.coffee
}));
vi.mock('$lib/api/marin/fitness', async (orig) => ({
	...(await orig<object>()),
	fetchFitnessDataWithStatus: fetchers.fitness
}));
vi.mock('$lib/stores/strava', async (orig) => ({
	...(await orig<object>()),
	loadStravaData: fetchers.strava
}));

const { createDashboardV2Controller, DATASET_POLICY } = await import('./v2-controller');
const { effectiveState } = await import('./source-status');
const { gasPriceStore } = await import('$lib/stores/gas-prices');
const { evChargingStore } = await import('$lib/stores/ev-charging');
const { coffeeIndexStore } = await import('$lib/stores/coffee');
const { fitnessStore } = await import('$lib/stores/fitness');
const { news } = await import('$lib/stores/news');
type Deps = Parameters<typeof createDashboardV2Controller>[0];
type Sources = NonNullable<Deps['newsSources']>;

const NOW = Date.parse('2026-09-29T18:00:00.000Z');
const SCRAPED = '2026-09-29T12:00:00.000Z';
const live = (data: unknown) => ({ ok: true, data, dataSource: 'live' });
const SNAPSHOT: NewsSnapshotResponse = {
	status: 'ok',
	snapshot: {
		schemaVersion: 1,
		revision: 7,
		generatedAt: '2026-09-29T17:55:00.000Z',
		lastSuccessfulScrapeAt: '2026-09-29T17:55:00.000Z',
		sources: [
			{
				id: 'pacific-sun',
				name: 'Pacific Sun',
				category: 'local',
				verification: 'local_media',
				status: 'retained',
				lastAttemptAt: '2026-09-29T17:55:00.000Z',
				lastSuccessAt: '2026-09-29T12:00:00.000Z',
				lastError: 'http-status: HTTP 404',
				consecutiveFailures: 20,
				itemCount: 2
			}
		],
		items: []
	}
};
const story = (id: string): NewsItem => ({
	id,
	title: 'Mill Valley council approves budget',
	link: `https://example.com/${id}`,
	timestamp: NOW - 60_000,
	source: 'X',
	category: 'local',
	verification: 'local_media'
});

function newsSources(over: Partial<Sources> = {}): Sources {
	const empty = async (): Promise<NewsItem[]> => [];
	return {
		snapshot: async () => SNAPSHOT,
		nps: empty,
		earthquakes: empty,
		transit: empty,
		'sheriff-blotter': empty,
		'police-logs': empty,
		'supplemental-activity': empty,
		seeclickfix: empty,
		...over
	};
}

let clock = NOW;
const owners: AbortController[] = [];
const fakeBrief = () => ({
	hourly: vi.fn(async () => ({ updatedAt: NOW, periods: [] })),
	observation: vi.fn(async () => ({
		stationName: 'Gnoss Field (Novato)',
		observedAt: NOW,
		tempF: 60,
		text: null
	})),
	tides: vi.fn(async () => [])
});
function controller(over: Partial<Deps> = {}) {
	const owner = new AbortController();
	owners.push(owner);
	return createDashboardV2Controller({
		signal: owner.signal,
		now: () => clock,
		newsSources: newsSources(),
		briefFetchers: fakeBrief(),
		fetchAdvisories: async () => ({ advisories: [], unreadable: 0 }),
		...over
	});
}

beforeEach(() => {
	clock = NOW;
	for (const f of Object.values(fetchers)) f.mockReset();
	fetchers.gas.mockResolvedValue(
		live({ current: { stations: [{ id: 'g1' }], lastSuccessfulScrapeAt: SCRAPED }, history: [] })
	);
	fetchers.ev.mockResolvedValue(live({ current: { stations: [{ id: 'e1' }] }, history: [] })); // no scrape time
	fetchers.coffee.mockResolvedValue(
		live({ current: { shops: [{ id: 'c1' }], lastSuccessfulScrapeAt: SCRAPED }, history: [] })
	);
	fetchers.fitness.mockResolvedValue(
		live({ current: { studios: [{ id: 'f1' }], lastSuccessfulScrapeAt: SCRAPED }, history: [] })
	);
	for (const s of [gasPriceStore, evChargingStore, coffeeIndexStore, fitnessStore]) {
		s.set({ current: null, history: [] } as never);
	}
});
afterEach(() => {
	// Every controller releases its claim on the news store.
	for (const o of owners.splice(0)) o.abort();
	vi.useRealTimers();
});

describe('createDashboardV2Controller', () => {
	it('fills every map store once on start, with no panel mounted (§13.7)', async () => {
		await controller().start();
		expect(get(gasPriceStore).current).not.toBeNull();
		expect(get(evChargingStore).current).not.toBeNull();
		expect(get(coffeeIndexStore).current).not.toBeNull();
		expect(get(fitnessStore).current).not.toBeNull();
		for (const f of [fetchers.gas, fetchers.ev, fetchers.coffee, fetchers.fitness]) {
			expect(f).toHaveBeenCalledTimes(1);
			expect(f.mock.calls[0][0]).toEqual({ signal: expect.any(AbortSignal) });
		}
	});

	it('the dataset freshness policy is G0a’s own (pinned to SOURCE_INVENTORY)', () => {
		for (const { healthName, maxAgeDays } of Object.values(DATASET_POLICY)) {
			const policy = SOURCE_INVENTORY.find((p) => p.name === healthName);
			expect(policy, healthName).toBeDefined();
			expect(policy!.maxAgeDays).toBe(maxAgeDays);
			expect(policy!.observedAt).toBe('content'); // = the payload's lastSuccessfulScrapeAt
		}
	});

	it('never runs the browser feed chain or Strava; Strava only through ensure', async () => {
		const c = controller();
		await c.start();
		clock += 10 * 60_000;
		await c.refresh();
		expect(loadAllNews).not.toHaveBeenCalled();
		expect(fetchers.strava).not.toHaveBeenCalled();
		await c.ensure('strava');
		expect(fetchers.strava).toHaveBeenCalledTimes(1);
	});

	it('deduplicates: start twice, an early refresh and a refresh during a cycle make no extra requests', async () => {
		const c = controller();
		const first = c.start();
		const second = c.start();
		const joined = c.refresh({ force: true });
		await Promise.all([first, second, joined]);
		await c.refresh(); // inside the 60 s gap
		expect(fetchers.gas).toHaveBeenCalledTimes(1);
		clock += 61_000;
		await c.refresh();
		expect(fetchers.gas).toHaveBeenCalledTimes(2);
	});

	it('a body that never arrives does not wedge later cycles (Codex r1 #4)', async () => {
		vi.useFakeTimers();
		fetchers.gas.mockReturnValueOnce(new Promise(() => {}));
		const c = controller({ deadlineMs: 1_000 });
		const started = c.start();
		await vi.advanceTimersByTimeAsync(1_000);
		await started;
		clock += 61_000;
		await c.refresh();
		expect(fetchers.gas).toHaveBeenCalledTimes(2);
		expect(get(gasPriceStore).current).not.toBeNull();
	});

	it('news comes from the snapshot loader into the claimed news store', async () => {
		const c = controller({
			newsSources: newsSources({ 'supplemental-activity': async () => [story('v2:1')] })
		});
		await c.start();
		expect(news.getItems('local').map((i) => i.id)).toContain('v2:1');
	});

	it('while v2 owns the store, a late legacy (untokened) write cannot overwrite it; after disposal the store is released (Codex r1 #9)', async () => {
		const owner = new AbortController();
		const c = controller({
			signal: owner.signal,
			newsSources: newsSources({ 'supplemental-activity': async () => [story('v2:1')] })
		});
		await c.start();
		news.setItems('local', [story('legacy:late')]); // what a destroyed legacy controller would do
		expect(news.getItems('local').map((i) => i.id)).toEqual(['v2:1']);
		owner.abort();
		news.setItems('local', [story('legacy:next')]); // the next owner (legacy) may write again
		expect(news.getItems('local').map((i) => i.id)).toEqual(['legacy:next']);
	});

	it('hand-off v2 → TV → legacy: v2 disposing after TV claimed never unclaims TV; TV releasing hands back to legacy (Codex r2 #2)', async () => {
		const v2Owner = new AbortController();
		const c = controller({
			signal: v2Owner.signal,
			newsSources: newsSources({ 'supplemental-activity': async () => [story('v2:1')] })
		});
		await c.start();
		const tv = news.claim(); // /tv mounts before v2's onDestroy has run
		v2Owner.abort(); // v2's obsolete release
		news.setItems('local', [story('legacy:late')]);
		expect(news.getItems('local')).toEqual([]); // claim() cleared; the untokened write was dropped
		news.setItems('local', [story('tv:1')], { owner: tv.token });
		expect(news.getItems('local').map((i) => i.id)).toEqual(['tv:1']);
		tv.release();
		news.setItems('local', [story('legacy:1')]);
		expect(news.getItems('local').map((i) => i.id)).toEqual(['legacy:1']);
	});

	it('an obsolete v2 controller disposing never unclaims a newer v2 controller', async () => {
		const first = new AbortController();
		controller({ signal: first.signal });
		const second = controller({
			newsSources: newsSources({ 'supplemental-activity': async () => [story('v2:second')] })
		});
		first.abort();
		await second.start();
		news.setItems('local', [story('legacy:late')]);
		expect(news.getItems('local').map((i) => i.id)).toEqual(['v2:second']);
	});

	it('reports per-source status with provenance from the values themselves', async () => {
		let fail = false;
		const c = controller({
			newsSources: newsSources({
				seeclickfix: async () => {
					if (fail) throw new Error('HTTP 500');
					return [];
				}
			})
		});
		await c.start();
		fail = true;
		clock += 61_000;
		await c.refresh();
		const byId = Object.fromEntries(get(c.sources).map((e) => [e.id, e]));
		expect(byId['part:snapshot'].state).toBe('ok');
		expect(byId['news:pacific-sun']).toMatchObject({
			state: 'stale',
			detail: 'http-status: HTTP 404'
		});
		expect(byId['part:transit']).toMatchObject({ state: 'unknown' });
		expect(byId['part:seeclickfix']).toMatchObject({
			state: 'stale',
			observedAt: null,
			detail: 'HTTP 500'
		});
		expect(byId['dataset:gas']).toMatchObject({
			state: 'ok',
			observedAt: Date.parse(SCRAPED),
			maxAgeMs: 2 * 86_400_000
		});
		expect(effectiveState(byId['dataset:ev'], clock)).toBe('unknown'); // no scrape time in the payload
	});

	it('a destroyed owner writes nothing', async () => {
		const owner = new AbortController();
		let release!: () => void;
		fetchers.gas.mockReturnValueOnce(
			new Promise((r) => (release = () => r(live({ current: { stations: [] }, history: [] }))))
		);
		const c = controller({ signal: owner.signal });
		const running = c.start();
		owner.abort();
		release();
		await running;
		expect(get(gasPriceStore).current).toBeNull();
	});

	it('a subscriber that disposes the owner mid-cycle stops every later write (Codex PR 6 #2)', async () => {
		const owner = new AbortController();
		const c = controller({ signal: owner.signal });
		const unsubscribe = c.sources.subscribe((entries) => {
			if (entries.some((e) => e.id === 'part:snapshot' && e.state !== 'loading')) owner.abort();
		});
		await c.start();
		unsubscribe();
		// The snapshot settled first; applying it (and its per-source entries) came after the abort.
		expect(get(c.sources).some((e) => e.id === 'news:pacific-sun')).toBe(false);
	});

	it('a cycle refreshes the advisories and, once a location is set, the brief for it', async () => {
		const briefFetchers = fakeBrief();
		const fetchAdvisories = vi.fn(async () => ({ advisories: [], unreadable: 0 }));
		const c = controller({ briefFetchers, fetchAdvisories });
		c.setLocation(getLocationById('central-marin'));
		await c.start();
		expect(fetchAdvisories).toHaveBeenCalledTimes(1);
		expect(briefFetchers.hourly).toHaveBeenCalledWith(37.9735, -122.5311, expect.any(AbortSignal));
		expect(get(c.advisories)).toMatchObject({ lastSuccessAt: NOW, lastError: null });
		expect(get(c.brief).forecast.scope).toBe('Central Marin forecast');
	});

	it('a town change reloads only the brief, at once; the same town again does nothing', async () => {
		const briefFetchers = fakeBrief();
		const fetchAdvisories = vi.fn(async () => ({ advisories: [], unreadable: 0 }));
		const c = controller({ briefFetchers, fetchAdvisories });
		c.setLocation(getLocationById('central-marin'));
		await c.start();
		c.setLocation(getLocationById('mill-valley'));
		await vi.waitFor(() =>
			expect(briefFetchers.hourly).toHaveBeenLastCalledWith(
				37.906,
				-122.5449,
				expect.any(AbortSignal)
			)
		);
		c.setLocation(getLocationById('mill-valley'));
		expect(briefFetchers.hourly).toHaveBeenCalledTimes(2);
		expect(fetchers.gas).toHaveBeenCalledTimes(1);
		expect(fetchAdvisories).toHaveBeenCalledTimes(1);
	});

	it('disposal cancels in-flight brief and advisory requests (Codex r1 #8)', async () => {
		const owner = new AbortController();
		const seen: AbortSignal[] = [];
		const hold = <T>(signal: AbortSignal) => {
			seen.push(signal);
			return new Promise<T>(() => {});
		};
		const c = controller({
			signal: owner.signal,
			briefFetchers: {
				hourly: (_a, _b, s) => hold(s),
				observation: (_st, s) => hold(s),
				tides: (_id, s) => hold(s)
			},
			fetchAdvisories: (s) => hold(s)
		});
		c.setLocation(getLocationById('central-marin'));
		void c.start();
		await vi.waitFor(() => expect(seen).toHaveLength(4));
		owner.abort();
		expect(seen.every((s) => s.aborted)).toBe(true);
	});
});

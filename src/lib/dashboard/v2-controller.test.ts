import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { NewsSnapshotResponse } from '$lib/news/snapshot';
import type { Advisory } from '$lib/weather/advisories';
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
	strava: vi.fn(),
	health: vi.fn(),
	airport: vi.fn(),
	traffic: vi.fn(),
	marine: vi.fn(),
	fires: vi.fn(),
	quakesWeek: vi.fn(),
	air: vi.fn(),
	composite: vi.fn(),
	cappuccino: vi.fn(),
	grocery: vi.fn(),
	wine: vi.fn(),
	school: vi.fn(),
	housing: vi.fn(),
	activity: vi.fn(),
	police: vi.fn(),
	nps: vi.fn()
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
vi.mock('$lib/api/marin/health-report', async (orig) => ({
	...(await orig<object>()),
	fetchHealthReport: fetchers.health
}));
vi.mock('$lib/api/marin/airport-status', async (orig) => ({
	...(await orig<object>()),
	fetchAirportStatusOrThrow: fetchers.airport
}));
vi.mock('$lib/api/marin/marine', async (orig) => ({
	...(await orig<object>()),
	readMarineForecastOrThrow: fetchers.marine
}));
vi.mock('$lib/api/marin/calfire', async (orig) => ({
	...(await orig<object>()),
	readFireIncidentsOrThrow: fetchers.fires
}));
vi.mock('$lib/api/marin/usgs', async (orig) => ({
	...(await orig<object>()),
	readEarthquakesWeekOrThrow: fetchers.quakesWeek
}));
vi.mock('$lib/api/marin/airnow', async (orig) => ({
	...(await orig<object>()),
	readAirQualityOrThrow: fetchers.air
}));
vi.mock('$lib/api/marin/composite', async (orig) => ({
	...(await orig<object>()),
	fetchCompositeDataWithStatus: fetchers.composite
}));
vi.mock('$lib/api/marin/cappuccino', async (orig) => ({
	...(await orig<object>()),
	fetchCappuccinoDataWithStatus: fetchers.cappuccino
}));
vi.mock('$lib/api/marin/grocery-basket', async (orig) => ({
	...(await orig<object>()),
	fetchGroceryBasketDataWithStatus: fetchers.grocery
}));
vi.mock('$lib/api/marin/wine-index', async (orig) => ({
	...(await orig<object>()),
	fetchWineIndexDataWithStatus: fetchers.wine
}));
vi.mock('$lib/api/marin/school-tuition', async (orig) => ({
	...(await orig<object>()),
	fetchSchoolTuitionDataWithStatus: fetchers.school
}));
vi.mock('$lib/api/marin/housing', async (orig) => ({
	...(await orig<object>()),
	fetchHousingDataWithStatus: fetchers.housing
}));
vi.mock('$lib/api/marin/activity', async (orig) => ({
	...(await orig<object>()),
	fetchActivityReadWithStatus: fetchers.activity
}));
vi.mock('$lib/api/marin/police-logs', async (orig) => ({
	...(await orig<object>()),
	fetchPoliceLogsDataWithStatus: fetchers.police
}));
vi.mock('$lib/api/marin/nps', async (orig) => ({
	...(await orig<object>()),
	fetchNpsAlertsWithStatus: fetchers.nps
}));
vi.mock('$lib/api/marin/traffic-corridors', async (orig) => ({
	...(await orig<object>()),
	fetchTrafficCorridorsOrThrow: fetchers.traffic
}));

const { createDashboardV2Controller, DATASET_POLICY, V2_MIN_REFRESH_GAP_MS } =
	await import('./v2-controller');
const { effectiveState } = await import('./source-status');
const { COST_DATASETS } = await import('./cost');
const { CIVIC_DATASETS } = await import('./news-civic');
const { EVENTS_DATASETS } = await import('./events');
const { gasPriceStore } = await import('$lib/stores/gas-prices');
const { evChargingStore } = await import('$lib/stores/ev-charging');
const { coffeeIndexStore } = await import('$lib/stores/coffee');
const { fitnessStore } = await import('$lib/stores/fitness');
const { news } = await import('$lib/stores/news');
const { seededSnapshotEntries } = await import('./source-adapters');
const { snapshotView, story: snapshotStory } = await import('./__fixtures__/snapshot-view');
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

/** A status-aware part's read with no payload time. */
const untimedRead = (items: NewsItem[]) => ({ items, observedAt: null });

function newsSources(over: Partial<Sources> = {}): Sources {
	const empty = async (): Promise<NewsItem[]> => [];
	const untimed = async () => untimedRead([]);
	return {
		snapshot: async () => SNAPSHOT,
		nps: empty,
		earthquakes: untimed,
		transit: empty,
		'sheriff-blotter': untimed,
		'police-logs': empty,
		'supplemental-activity': empty,
		seeclickfix: untimed,
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
		listNewestAt: NOW,
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
	fetchers.health.mockResolvedValue(
		live({
			status: 'healthy',
			sources: [
				{
					name: 'Gas Prices',
					status: 'stale',
					reason: 'older than 2d',
					maxAgeDays: 2,
					observedAt: '2026-09-26T00:00:00.000Z'
				}
			],
			subsources: []
		})
	);
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
	fetchers.airport.mockResolvedValue({ airports: [], lastUpdated: '2026-09-29T17:58:00.000Z' });
	fetchers.traffic.mockResolvedValue({
		checkedAt: '2026-09-29T17:59:00.000Z',
		upstreamCount: 40,
		events: []
	});
	fetchers.marine.mockResolvedValue({ points: [], checkedAt: NOW - 60_000 });
	fetchers.fires.mockResolvedValue({ fires: [], checkedAt: NOW - 60_000 });
	fetchers.quakesWeek.mockResolvedValue({ quakes: [], observedAt: NOW - 120_000 });
	fetchers.air.mockResolvedValue({ reading: null, checkedAt: NOW - 60_000 });
	const scraped = (iso: string) => ({ timestamp: iso, lastSuccessfulScrapeAt: iso });
	for (const f of [
		fetchers.composite,
		fetchers.cappuccino,
		fetchers.grocery,
		fetchers.wine,
		fetchers.school
	])
		f.mockResolvedValue({
			ok: true,
			data: { current: scraped(new Date(NOW - 86_400_000).toISOString()), history: [] },
			dataSource: 'live'
		});
	fetchers.housing.mockResolvedValue({ ok: true, data: [], dataSource: 'live' });
	for (const f of [fetchers.police, fetchers.nps])
		f.mockResolvedValue({ ok: true, data: [], dataSource: 'live' });
	fetchers.activity.mockResolvedValue({
		ok: true,
		data: { items: [], syncedAt: null },
		dataSource: 'live'
	});
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

	it('the map reads gas, EV and coffee from its own stores, never a shared one (MAPX2b)', async () => {
		const c = controller();
		expect(get(c.places.gas)).toBeNull();
		// Another owner's value in the shared store is not the map's.
		gasPriceStore.set({ current: { stations: [{ placeId: 'stale' }] }, history: [] } as never);
		expect(get(c.places.gas)).toBeNull();
		await c.start();
		expect(get(c.places.gas)?.current).toBeTruthy();
		expect(get(c.places.ev)?.current).toBeTruthy();
		expect(get(c.places.coffee)?.current).toBeTruthy();
	});

	it('fitness too, from its own store (MAPX2c)', async () => {
		const c = controller();
		fitnessStore.set({ current: { studios: [{ id: 'stale' }] }, history: [] } as never);
		expect(get(c.places.fitness)).toBeNull();
		await c.start();
		expect(get(c.places.fitness)?.current).toBeTruthy();
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

	it('cycling reads true from a cycle’s start until it settles, a joined refresh included (E2E-TIDY2)', async () => {
		const c = controller();
		expect(get(c.cycling)).toBe(false);
		const first = c.start();
		expect(get(c.cycling)).toBe(true);
		const joined = c.refresh({ force: true });
		await Promise.all([first, joined]);
		expect(get(c.cycling)).toBe(false);
		clock += 61_000;
		const next = c.refresh();
		expect(get(c.cycling)).toBe(true);
		await next;
		expect(get(c.cycling)).toBe(false);
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
					return untimedRead([]);
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

	it('311 and quakes read ok with their payload time; a later failure keeps that time as stale (map coverage label)', async () => {
		let up = true;
		const T311 = NOW - 2 * 3_600_000;
		const c = controller({
			newsSources: newsSources({
				seeclickfix: async () => {
					if (!up) throw new Error('HTTP 503');
					return { items: [], observedAt: T311 };
				},
				earthquakes: async () => ({ items: [], observedAt: NOW - 60_000 })
			})
		});
		await c.start();
		const entry = (id: string) => get(c.sources).find((e) => e.id === id)!;
		expect(entry('part:seeclickfix')).toMatchObject({ state: 'ok', observedAt: T311 });
		expect(effectiveState(entry('part:earthquakes'), NOW)).toBe('ok');
		up = false;
		clock += V2_MIN_REFRESH_GAP_MS + 1;
		await c.refresh({ force: true });
		expect(entry('part:seeclickfix')).toMatchObject({
			state: 'stale',
			observedAt: T311,
			detail: 'HTTP 503'
		});
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

	it('the server’s advisory read is the starting row; the first cycle refreshes it (MOBILE1)', async () => {
		const seeded = {
			advisories: [{ id: 'a1', event: 'Coastal Flood Advisory' } as Advisory],
			unreadable: 0,
			lastAttemptAt: NOW - 60_000,
			lastSuccessAt: NOW - 60_000,
			lastError: null
		};
		const fetchAdvisories = vi.fn(async () => ({ advisories: [], unreadable: 0 }));
		const c = controller({ fetchAdvisories, initialAdvisories: seeded });
		expect(get(c.advisories)).toEqual(seeded);
		await c.start();
		expect(fetchAdvisories).toHaveBeenCalledTimes(1);
		expect(get(c.advisories)).toMatchObject({ advisories: [], lastSuccessAt: NOW });
	});

	it('enableBriefDetail (desktop) adds the 12-hour trace and the hourly tide to the brief (MAPX1)', async () => {
		const briefFetchers = {
			...fakeBrief(),
			history: vi.fn(async () => [{ atMs: NOW, tempF: 61 }]),
			tideHourly: vi.fn(async () => [{ atMs: NOW, heightFt: 2 }])
		};
		const c = controller({ briefFetchers });
		c.setLocation(getLocationById('central-marin'));
		await c.start();
		expect(briefFetchers.history).not.toHaveBeenCalled();
		await c.enableBriefDetail();
		expect(get(c.brief).history.value).toEqual([{ atMs: NOW, tempF: 61 }]);
		expect(get(c.brief).tideHourly.state).toBe('ok');
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

	it('loads /api/health as an essential for the indicator only: it never re-dates a dataset (Codex r1 #3)', async () => {
		const c = controller();
		await c.start();
		expect(fetchers.health).toHaveBeenCalledTimes(1);
		expect(fetchers.health.mock.calls[0][0]).toEqual({ signal: expect.any(AbortSignal) });
		expect(get(c.healthReport)?.sources[0].name).toBe('Gas Prices');
		const gas = get(c.sources).find((e) => e.id === 'dataset:gas');
		expect(gas).toMatchObject({ state: 'ok', observedAt: Date.parse(SCRAPED) }); // its own payload, not the report's 2026-09-26
		expect(get(c.sources).some((e) => e.id === 'dataset:health')).toBe(false);
	});

	it('exposes the applied snapshot view, and its own Fix It items (null until its first commit)', async () => {
		const fix = {
			...story('seeclickfix-1'),
			category: '311' as const,
			town: 'San Rafael',
			townSlug: 'san-rafael'
		};
		const c = controller({
			newsSources: newsSources({ seeclickfix: async () => untimedRead([fix]) })
		});
		expect(get(c.snapshot)).toBeNull();
		expect(get(c.fixIt)).toBeNull();
		await c.start();
		expect(get(c.snapshot)?.revision).toBe(7);
		expect(get(c.fixIt)?.map((i) => i.id)).toEqual(['seeclickfix-1']);
	});

	it('a located 311 report with no town in its text is still drawn: the reader already placed it in Marin (Codex code review r3 #1)', async () => {
		const located: NewsItem = {
			id: 'seeclickfix-2',
			title: 'Pothole',
			description: 'Pothole in road',
			link: 'https://seeclickfix.com/issues/2',
			timestamp: NOW - 60_000,
			source: 'Fix It Marin',
			category: '311',
			verification: 'official',
			lat: 37.97,
			lon: -122.53
		};
		const c = controller({
			newsSources: newsSources({
				seeclickfix: async () => ({ items: [located], observedAt: NOW - 60_000 })
			})
		});
		await c.start();
		expect(get(c.fixIt)?.map((i) => i.id)).toEqual(['seeclickfix-2']);
	});

	it('a failed first Fix It read leaves fixIt null: nothing inherited is ever offered', async () => {
		const c = controller({
			newsSources: newsSources({
				seeclickfix: async () => {
					throw new Error('HTTP 503');
				}
			})
		});
		await c.start();
		expect(get(c.fixIt)).toBeNull();
	});

	it('a successful, empty first Fix It read is an empty list, not "never read" (Codex 9a2 #2)', async () => {
		const c = controller({
			newsSources: newsSources({ seeclickfix: async () => untimedRead([]) })
		});
		await c.start();
		expect(get(c.fixIt)).toEqual([]);
	});

	it('Getting Around details load only through ensure, once, then with every cycle (§13.7)', async () => {
		const c = controller();
		await c.start();
		expect(fetchers.airport).not.toHaveBeenCalled();
		expect(fetchers.traffic).not.toHaveBeenCalled();
		await Promise.all([c.ensure('airport'), c.ensure('airport'), c.ensure('traffic')]);
		expect(fetchers.airport).toHaveBeenCalledTimes(1);
		expect(fetchers.airport.mock.calls[0][0]).toEqual({ signal: expect.any(AbortSignal) });
		expect(get(c.airport)?.lastUpdated).toBe('2026-09-29T17:58:00.000Z');
		expect(get(c.traffic)?.upstreamCount).toBe(40);
		expect(get(c.datasetOutcomes).airport).toEqual({
			kind: 'live',
			observedAt: Date.parse('2026-09-29T17:58:00.000Z')
		});
		expect(get(c.datasetOutcomes).traffic).toEqual({
			kind: 'live',
			observedAt: Date.parse('2026-09-29T17:59:00.000Z')
		});
		expect(
			get(c.sources).some((s) => s.id === 'dataset:airport' || s.id === 'dataset:traffic')
		).toBe(false);
		clock += V2_MIN_REFRESH_GAP_MS + 1;
		await c.refresh();
		expect(fetchers.airport).toHaveBeenCalledTimes(2);
		expect(fetchers.traffic).toHaveBeenCalledTimes(2);
	});

	it('Cost reads (composite and the sub-indexes) load only through ensure, timed by their own scrape', async () => {
		const c = controller();
		await c.start();
		const costFetchers = [
			fetchers.composite,
			fetchers.cappuccino,
			fetchers.grocery,
			fetchers.wine,
			fetchers.school,
			fetchers.housing
		];
		for (const f of costFetchers) expect(f).not.toHaveBeenCalled();
		await Promise.all(Object.values(COST_DATASETS).map((d) => c.ensure(d.id)));
		for (const f of costFetchers) expect(f).toHaveBeenCalledTimes(1);
		expect(get(c.cost).composite?.current?.timestamp).toBe(
			new Date(NOW - 86_400_000).toISOString()
		);
		expect(get(c.cost).housing).toEqual([]);
		expect(get(c.datasetOutcomes).composite).toEqual({
			kind: 'live',
			observedAt: NOW - 86_400_000
		});
		// Housing's payload carries no time of its own (G0a dates it by upload).
		expect(get(c.datasetOutcomes).housing).toEqual({ kind: 'live', observedAt: null });
	});

	it('News & Civic and Events reads (police, NPS, activity) load only through ensure; a failure is carried, not emptied', async () => {
		const c = controller();
		await c.start();
		const own = [fetchers.activity, fetchers.police, fetchers.nps];
		for (const f of own) expect(f).not.toHaveBeenCalled();
		fetchers.police.mockResolvedValue({ ok: false, error: 'HTTP 503', fallback: [] });
		const ids = [CIVIC_DATASETS.police.id, CIVIC_DATASETS.nps.id, EVENTS_DATASETS.activity.id];
		await Promise.all(ids.map((id) => c.ensure(id)));
		for (const f of own) expect(f).toHaveBeenCalledTimes(1);
		expect(get(c.civic)).toEqual({ police: null, nps: [], activity: [] });
		expect(get(c.datasetOutcomes).police).toEqual({
			kind: 'failed',
			error: 'HTTP 503',
			retained: false,
			observedAt: null
		});
		// Police and parks payloads carry no time of their own; this activity payload reported none.
		expect(get(c.datasetOutcomes).activity).toEqual({ kind: 'live', observedAt: null });
	});

	it('activity is dated by the sync time its own payload carries, kept with it (NEWSPIN1)', async () => {
		const items = [story('shows:1')];
		fetchers.activity.mockResolvedValueOnce({
			ok: true,
			data: { items, syncedAt: '2026-09-29T12:00:05.000Z' },
			dataSource: 'live'
		});
		const c = controller();
		await c.start();
		await c.ensure(EVENTS_DATASETS.activity.id);
		expect(get(c.civic).activity).toEqual(items);
		const synced = Date.parse('2026-09-29T12:00:05.000Z');
		expect(get(c.datasetOutcomes).activity).toEqual({ kind: 'live', observedAt: synced });
		// A failed refresh keeps the items with the time they came with, never the request's.
		fetchers.activity.mockResolvedValueOnce({ ok: false, error: 'HTTP 503', fallback: null });
		clock = NOW + V2_MIN_REFRESH_GAP_MS;
		await c.refresh({ force: true });
		expect(get(c.civic).activity).toEqual(items);
		expect(get(c.datasetOutcomes).activity).toEqual({
			kind: 'failed',
			error: 'HTTP 503',
			retained: true,
			observedAt: synced
		});
	});

	it('Outdoors reads (marine, fires, 7-day quakes) load only through ensure, with their own times', async () => {
		const c = controller();
		await c.start();
		for (const f of [fetchers.marine, fetchers.fires, fetchers.quakesWeek])
			expect(f).not.toHaveBeenCalled();
		await Promise.all(['marine', 'fires', 'quakes-week'].map((id) => c.ensure(id)));
		expect(get(c.marine)).toEqual({ points: [], checkedAt: NOW - 60_000 });
		expect(get(c.fires)?.fires).toEqual([]);
		expect(get(c.quakesWeek)?.observedAt).toBe(NOW - 120_000);
		expect(get(c.datasetOutcomes)['quakes-week']).toEqual({
			kind: 'live',
			observedAt: NOW - 120_000
		});
		expect(get(c.datasetOutcomes).fires).toEqual({ kind: 'live', observedAt: NOW - 60_000 });
	});

	it("air quality loads only through ensure, timed by AirNow's observation hour", async () => {
		const observedAt = NOW - 2 * 3_600_000;
		const read = {
			reading: {
				aqi: 14,
				category: 'Good',
				color: '#00e400',
				pollutant: 'OZONE',
				area: 'San Rafael',
				observedAt,
				timestamp: NOW - 60_000
			},
			checkedAt: NOW - 60_000
		};
		fetchers.air.mockResolvedValue(read);
		const c = controller();
		await c.start();
		expect(fetchers.air).not.toHaveBeenCalled();
		await c.ensure('air-quality');
		expect(get(c.airQuality)).toEqual(read);
		expect(get(c.datasetOutcomes)['air-quality']).toEqual({ kind: 'live', observedAt });
	});

	it('a read with no current AQI is timed by when we checked', async () => {
		const c = controller();
		await c.start();
		await c.ensure('air-quality');
		expect(get(c.datasetOutcomes)['air-quality']).toEqual({
			kind: 'live',
			observedAt: NOW - 60_000
		});
	});

	it('a failed detail refresh keeps the last value, retained with its own time', async () => {
		const c = controller();
		await c.start();
		await c.ensure('airport');
		fetchers.airport.mockRejectedValueOnce(new Error('HTTP 502'));
		clock += V2_MIN_REFRESH_GAP_MS + 1;
		await c.refresh();
		expect(get(c.airport)).not.toBeNull();
		expect(get(c.datasetOutcomes).airport).toEqual({
			kind: 'failed',
			error: 'HTTP 502',
			retained: true,
			observedAt: Date.parse('2026-09-29T17:58:00.000Z')
		});
	});

	describe('seeded with the server-rendered snapshot (DASH-FLIP1)', () => {
		const at = (ms: number, title: string, revision: number) => ({
			...snapshotView(ms, [snapshotStory(ms, { title, id: `point-reyes-light:${title}` })]),
			revision
		});
		const SEED = at(NOW - 5 * 60_000, 'seed', 7);
		const ids = () => news.getItems('local').map((i) => i.id);
		const answering = (view: ReturnType<typeof at>) =>
			newsSources({ snapshot: async () => ({ status: 'ok', snapshot: view }) });

		it('the initial view is there without a fetch: the view, the shared news store and an ok status dated by the snapshot', () => {
			const read = vi.fn(async () => SNAPSHOT);
			const c = controller({ initialSnapshot: SEED, newsSources: newsSources({ snapshot: read }) });
			expect(get(c.snapshot)).toBe(SEED);
			expect(ids()).toContain('point-reyes-light:seed');
			const entries = get(c.sources);
			for (const e of seededSnapshotEntries(SEED))
				expect(entries.find((x) => x.id === e.id)).toEqual(e);
			expect(entries.find((e) => e.id === 'part:snapshot')?.state).toBe('ok');
			expect(read).not.toHaveBeenCalled();
		});

		it('the seeded status is dated by the snapshot’s own generatedAt, never its scrape or the request time', () => {
			const seed = {
				...SEED,
				generatedAt: '2026-09-29T17:50:00.000Z',
				lastSuccessfulScrapeAt: '2026-09-29T17:40:00.000Z'
			};
			clock = Date.parse('2026-09-29T18:00:00.000Z');
			const c = controller({ initialSnapshot: seed });
			const read = get(c.sources).find((e) => e.id === 'part:snapshot');
			expect(read).toMatchObject({
				state: 'ok',
				observedAt: Date.parse('2026-09-29T17:50:00.000Z')
			});
		});

		it('an older client response replaces neither the controller view nor the shared news stores', async () => {
			const c = controller({
				initialSnapshot: SEED,
				newsSources: answering(at(NOW - 20 * 60_000, 'older', 9))
			});
			await c.start();
			expect(get(c.snapshot)).toBe(SEED);
			expect(ids()).toContain('point-reyes-light:seed');
			expect(ids()).not.toContain('point-reyes-light:older');
		});

		it('a newer client response replaces both', async () => {
			const newer = at(NOW, 'newer', 8);
			const c = controller({ initialSnapshot: SEED, newsSources: answering(newer) });
			await c.start();
			expect(get(c.snapshot)).toBe(newer);
			expect(ids()).toContain('point-reyes-light:newer');
			expect(ids()).not.toContain('point-reyes-light:seed');
		});
	});
});

describe('camera headings (MAPX4)', () => {
	it('one shared store, read through deps, nothing until a holder asks', async () => {
		const loadCamHeadings = vi.fn().mockResolvedValue({ headingAt: 1, cams: [] });
		const c = controller({ loadCamHeadings });
		await c.start();
		expect(loadCamHeadings).not.toHaveBeenCalled();
		const release = c.camHeadings.hold();
		await vi.waitFor(() => expect(get(c.camHeadings).state).toBe('ok'));
		expect(loadCamHeadings).toHaveBeenCalledTimes(1);
		release();
	});
});

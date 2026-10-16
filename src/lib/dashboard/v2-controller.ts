/**
 * The v2 dashboard's one owner of data (spec §13.7). Created by DashboardV2,
 * aborted when it is destroyed. It loads the brief/map essentials whatever
 * sections are open, reads news from the shared snapshot (never the browser
 * feed/article/geocode chain), owns the news store while mounted, and
 * exposes per-source status whose provenance comes from the values.
 */
import { derived, writable, type Readable, type Writable } from 'svelte/store';
import { news } from '$lib/stores/news';
import type { StoreClaim } from '$lib/stores/ownership';
import { gasPriceStore } from '$lib/stores/gas-prices';
import { evChargingStore } from '$lib/stores/ev-charging';
import { coffeeIndexStore } from '$lib/stores/coffee';
import { fitnessStore } from '$lib/stores/fitness';
import { loadStravaData } from '$lib/stores/strava';
import { fetchGasPriceDataWithStatus } from '$lib/api/marin/gas-prices';
import { fetchEvChargingDataWithStatus } from '$lib/api/marin/ev-charging';
import { fetchCoffeeIndexDataWithStatus } from '$lib/api/marin/coffee';
import { fetchFitnessDataWithStatus } from '$lib/api/marin/fitness';
import {
	earthquakesToNewsItems,
	fetchNpsAlerts,
	fetchSheriffCrimeBlotter,
	fetchSupplementalActivityFeeds,
	fetchSupplementalPoliceLogs,
	fetchTransitAlerts,
	readEarthquakesOrThrow,
	readSeeClickFixIssues
} from '$lib/api/marin';
import { boundedOp, DEFAULT_OP_DEADLINE_MS } from '$lib/api/marin/bounded-op';
import { fetchAirportStatusOrThrow } from '$lib/api/marin/airport-status';
import { readFireIncidentsOrThrow, type FireRead } from '$lib/api/marin/calfire';
import { readMarineForecastOrThrow, type MarineForecastRead } from '$lib/api/marin/marine';
import { readEarthquakesWeekOrThrow, type EarthquakeRead } from '$lib/api/marin/usgs';
import { fetchHealthReport, type HealthReportJson } from '$lib/api/marin/health-report';
import { fetchMarinAdvisories } from '$lib/api/marin/nws-advisories';
import { fetchHourlyPopOrThrow } from '$lib/api/marin/nws-hourly';
import { fetchLatestObservation } from '$lib/api/marin/nws-observation';
import { fetchTideEventsOrThrow } from '$lib/api/marin/tides';
import {
	fetchTrafficCorridorsOrThrow,
	type TrafficCorridorsData
} from '$lib/api/marin/traffic-corridors';
import type { TransitAgencyRead } from '$lib/api/marin/transit';
import type { AirportStatusData } from '$lib/types/airport';
import type { LocationPreset } from '$lib/config/locations';
import type { AdvisoryFeedState, ParsedAlerts } from '$lib/weather/advisories';
import { createAdvisoryFeed } from './advisory-feed';
import { createBriefStore, type BriefFetchers, type BriefState } from './brief-store';
import { AIRPORT_MAX_AGE_MS, TRAFFIC_MAX_AGE_MS, type TransitState } from './getting-around';
import { OUTDOORS_DATASETS, OUTDOORS_MAX_AGE_MS } from './outdoors';
import { COST_DATASETS, costMaxAgeMs } from './cost';
import { CIVIC_DATASETS } from './news-civic';
import { EVENTS_DATASETS } from './events';
import { fetchActivityDataWithStatus } from '$lib/api/marin/activity';
import { fetchPoliceLogsDataWithStatus } from '$lib/api/marin/police-logs';
import { fetchNpsAlertsWithStatus, type NpsAlert } from '$lib/api/marin/nps';
import { fetchCompositeDataWithStatus } from '$lib/api/marin/composite';
import { fetchCappuccinoDataWithStatus } from '$lib/api/marin/cappuccino';
import { fetchGroceryBasketDataWithStatus } from '$lib/api/marin/grocery-basket';
import { fetchWineIndexDataWithStatus } from '$lib/api/marin/wine-index';
import { fetchSchoolTuitionDataWithStatus } from '$lib/api/marin/school-tuition';
import { fetchHousingDataWithStatus, type HousingMetric } from '$lib/api/marin/housing';
import type { FetchResult } from '$lib/api/marin/data-fetcher';
import type { CompositeData } from '$lib/types/composite';
import type { CoffeeData } from '$lib/types/coffee';
import type { GroceryBasketData } from '$lib/types/grocery';
import type { WineIndexData } from '$lib/types/wine';
import type { SchoolIndexData } from '$lib/types/school';
import {
	createTvNewsLoader,
	TV_NEWS_SOURCES,
	type PartOutcome,
	type TvNewsPart,
	type TvNewsSources
} from '$lib/components/tv/tv-news';
import type { NewsSnapshotView } from '$lib/news/snapshot';
import type { NewsItem } from '$lib/types';
import { createDatasetRegistry, dataset, type DatasetDef } from './datasets';
import { DATASET_POLICY } from './dataset-policy';
import {
	PART_NAMES,
	datasetEntry,
	fromLoaderPart,
	fromSnapshotRead,
	fromSnapshotSource,
	type DatasetFetch
} from './source-adapters';
import type { SourceStatusEntry } from './source-status';

export const V2_REFRESH_MS = 5 * 60_000;
export const V2_MIN_REFRESH_GAP_MS = 60_000;
const DAY_MS = 86_400_000;

export { DATASET_POLICY };
type PolicyId = keyof typeof DATASET_POLICY;
const maxAge = (id: PolicyId) => DATASET_POLICY[id].maxAgeDays * DAY_MS;
/** Provenance travels with the value: the payload's own scrape time. */
const scrapedAt = (d: { current: { lastSuccessfulScrapeAt?: string | null } | null }) =>
	d.current?.lastSuccessfulScrapeAt;

export const ESSENTIAL_DATASETS: readonly DatasetDef[] = [
	dataset({
		id: 'gas',
		name: 'Gas prices',
		tier: 'essential',
		load: (signal) => fetchGasPriceDataWithStatus({ signal }),
		commit: (d) => gasPriceStore.set(d),
		observedAtOf: scrapedAt,
		maxAgeMs: maxAge('gas')
	}),
	dataset({
		id: 'ev',
		name: 'EV charging',
		tier: 'essential',
		load: (signal) => fetchEvChargingDataWithStatus({ signal }),
		commit: (d) => evChargingStore.set(d),
		observedAtOf: scrapedAt,
		maxAgeMs: maxAge('ev')
	}),
	dataset({
		id: 'coffee',
		name: 'Coffee index',
		tier: 'essential',
		load: (signal) => fetchCoffeeIndexDataWithStatus({ signal }),
		commit: (d) => coffeeIndexStore.set(d),
		observedAtOf: scrapedAt,
		maxAgeMs: maxAge('coffee')
	}),
	dataset({
		id: 'fitness',
		name: 'Fitness drop-ins',
		tier: 'essential',
		load: (signal) => fetchFitnessDataWithStatus({ signal }),
		commit: (d) => fitnessStore.set(d),
		observedAtOf: scrapedAt,
		maxAgeMs: maxAge('fitness')
	})
];

/** Full inventories: loaded only on browse. Nothing in D1 browses Strava (§13.9). */
export const INVENTORY_DATASETS: readonly DatasetDef[] = [
	dataset<null>({
		id: 'strava',
		name: 'Strava',
		tier: 'inventory',
		load: async (signal) => {
			await loadStravaData({ signal });
			return { ok: true, data: null, dataSource: 'live' };
		},
		commit: () => {},
		observedAtOf: () => null,
		maxAgeMs: null
	})
];

/** Getting Around's details (§13.7): loaded through ensure() when the section opens, then each cycle. */
function detailDatasets(
	airport: Writable<AirportStatusData | null>,
	traffic: Writable<TrafficCorridorsData | null>
): DatasetDef[] {
	return [
		dataset<AirportStatusData>({
			id: 'airport',
			name: 'FAA airport status',
			tier: 'detail',
			load: async (signal) => ({
				ok: true,
				data: await fetchAirportStatusOrThrow({ signal }),
				dataSource: 'live'
			}),
			commit: (d) => airport.set(d),
			observedAtOf: (d) => d.lastUpdated,
			maxAgeMs: AIRPORT_MAX_AGE_MS
		}),
		dataset<TrafficCorridorsData>({
			id: 'traffic',
			name: '511 traffic',
			tier: 'detail',
			load: async (signal) => ({
				ok: true,
				data: await fetchTrafficCorridorsOrThrow({ signal }),
				dataSource: 'live'
			}),
			commit: (d) => traffic.set(d),
			observedAtOf: (d) => d.checkedAt,
			maxAgeMs: TRAFFIC_MAX_AGE_MS
		})
	];
}

const isoOrNull = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/** Outdoors' detail reads (desktop Goal 2): loaded through ensure() when the section opens. */
function outdoorsDatasets(stores: OutdoorsStores): DatasetDef[] {
	const D = OUTDOORS_DATASETS;
	return [
		dataset<MarineForecastRead>({
			...D.marine,
			tier: 'detail',
			load: async (signal) => ({
				ok: true,
				data: await readMarineForecastOrThrow({ signal }),
				dataSource: 'live'
			}),
			commit: (d) => stores.marine.set(d),
			observedAtOf: (d) => isoOrNull(d.checkedAt),
			maxAgeMs: OUTDOORS_MAX_AGE_MS
		}),
		dataset<FireRead>({
			...D.fires,
			tier: 'detail',
			load: async (signal) => ({
				ok: true,
				data: await readFireIncidentsOrThrow({ signal }),
				dataSource: 'live'
			}),
			commit: (d) => stores.fires.set(d),
			observedAtOf: (d) => isoOrNull(d.checkedAt),
			maxAgeMs: OUTDOORS_MAX_AGE_MS
		}),
		dataset<EarthquakeRead>({
			...D.quakes,
			tier: 'detail',
			load: async (signal) => ({
				ok: true,
				data: await readEarthquakesWeekOrThrow({ signal }),
				dataSource: 'live'
			}),
			commit: (d) => stores.quakesWeek.set(d),
			observedAtOf: (d) => isoOrNull(d.observedAt),
			maxAgeMs: OUTDOORS_MAX_AGE_MS
		})
	];
}

/** Cost & Character's own reads (gas, coffee and fitness are already essentials). */
export interface CostReads {
	composite: CompositeData | null;
	cappuccino: CoffeeData | null;
	grocery: GroceryBasketData | null;
	wine: WineIndexData | null;
	school: SchoolIndexData | null;
	housing: HousingMetric[] | null;
}

/** Cost's detail reads (desktop Goal 3): loaded through ensure() when the section opens. */
function costDatasets(store: Writable<CostReads>): DatasetDef[] {
	const def = <K extends keyof CostReads>(
		key: K,
		load: (signal: AbortSignal) => Promise<FetchResult<NonNullable<CostReads[K]>>>,
		observedAtOf: (d: NonNullable<CostReads[K]>) => unknown
	) =>
		dataset<NonNullable<CostReads[K]>>({
			id: COST_DATASETS[key].id,
			name: COST_DATASETS[key].name,
			tier: 'detail',
			load,
			commit: (d) => store.update((all) => ({ ...all, [key]: d })),
			observedAtOf,
			maxAgeMs: costMaxAgeMs(key)
		});
	return [
		def('composite', (signal) => fetchCompositeDataWithStatus({ signal }), scrapedAt),
		def('cappuccino', (signal) => fetchCappuccinoDataWithStatus({ signal }), scrapedAt),
		def('grocery', (signal) => fetchGroceryBasketDataWithStatus({ signal }), scrapedAt),
		def('wine', (signal) => fetchWineIndexDataWithStatus({ signal }), scrapedAt),
		def('school', (signal) => fetchSchoolTuitionDataWithStatus({ signal }), scrapedAt),
		// Redfin's months carry no read time; G0a dates the blob by upload, which v2 can't see.
		def(
			'housing',
			() => fetchHousingDataWithStatus(),
			() => null
		)
	];
}

/** News & Civic's police and parks reads and Events' calendar (desktop Goal 4). */
export interface CivicReads {
	police: NewsItem[] | null;
	nps: NpsAlert[] | null;
	activity: NewsItem[] | null;
}

/** Loaded through ensure() when News & Civic or Events opens; the payloads carry no time of their own. */
function civicDatasets(store: Writable<CivicReads>): DatasetDef[] {
	const def = <K extends keyof CivicReads>(
		key: K,
		meta: { id: string; name: string },
		load: (signal: AbortSignal) => Promise<FetchResult<NonNullable<CivicReads[K]>>>
	) =>
		dataset<NonNullable<CivicReads[K]>>({
			...meta,
			tier: 'detail',
			load,
			commit: (d) => store.update((all) => ({ ...all, [key]: d })),
			observedAtOf: () => null,
			maxAgeMs: null
		});
	return [
		def('police', CIVIC_DATASETS.police, (signal) => fetchPoliceLogsDataWithStatus({ signal })),
		def('nps', CIVIC_DATASETS.nps, (signal) => fetchNpsAlertsWithStatus({ signal })),
		def('activity', EVENTS_DATASETS.activity, (signal) => fetchActivityDataWithStatus({ signal }))
	];
}

interface OutdoorsStores {
	marine: Writable<MarineForecastRead | null>;
	fires: Writable<FireRead | null>;
	quakesWeek: Writable<EarthquakeRead | null>;
}

export const BRIEF_FETCHERS: BriefFetchers = {
	hourly: (lat, lon, signal) => fetchHourlyPopOrThrow(lat, lon, { signal }),
	observation: (station, signal) => fetchLatestObservation(station, { signal }),
	tides: (stationId, signal) => fetchTideEventsOrThrow(stationId, { signal })
};

/**
 * TV slice 3's sources, each owned by v2 (Codex PR 6 #1): every adapter request
 * gets its own signal, aborted by the owner's disposal or by a deadline that
 * covers the body, so no request outlives the page or its part deadline.
 */
export function v2NewsSources(
	signal: AbortSignal,
	{
		deadlineMs = DEFAULT_OP_DEADLINE_MS,
		onTransit
	}: { deadlineMs?: number; onTransit?: (reads: readonly TransitAgencyRead[]) => void } = {}
): TvNewsSources {
	const owned =
		<T>(part: string, run: (s: AbortSignal) => Promise<T>) =>
		() =>
			boundedOp(`news ${part}`, run, { owner: signal, timeoutMs: deadlineMs });
	return {
		...TV_NEWS_SOURCES,
		nps: owned('nps', (s) => fetchNpsAlerts({ signal: s })),
		earthquakes: owned('earthquakes', async (s) => {
			const { quakes, observedAt } = await readEarthquakesOrThrow({ signal: s, liveOnly: true });
			return { items: earthquakesToNewsItems(quakes), observedAt };
		}),
		transit: owned('transit', async (s) => {
			const read = await fetchTransitAlerts({ signal: s });
			// A read cut short by its deadline or the owner didn't check every agency: not published.
			if (!s.aborted) onTransit?.(read.agencies);
			return read.items;
		}),
		'sheriff-blotter': owned('sheriff-blotter', (s) =>
			fetchSheriffCrimeBlotter(undefined, undefined, { signal: s })
		),
		'police-logs': owned('police-logs', (s) => fetchSupplementalPoliceLogs({ signal: s })),
		'supplemental-activity': owned('supplemental-activity', (s) =>
			fetchSupplementalActivityFeeds({ signal: s })
		),
		seeclickfix: owned('seeclickfix', (s) => readSeeClickFixIssues({ signal: s }))
	};
}

type AdapterPart = Exclude<TvNewsPart, 'snapshot'>;
const ADAPTER_PARTS = (Object.keys(PART_NAMES) as TvNewsPart[]).filter(
	(p): p is AdapterPart => p !== 'snapshot'
);

interface PartRecord {
	outcome: PartOutcome;
	hadSuccess: boolean;
	/** The last successful read's payload time; a failure leaves it as it was. */
	observedAt: number | null;
}

export interface ControllerDeps {
	signal: AbortSignal;
	now?: () => number;
	newsSources?: TvNewsSources;
	datasets?: readonly DatasetDef[];
	/** Whole-operation deadline for each dataset read (default 15 s). */
	deadlineMs?: number;
	briefFetchers?: BriefFetchers;
	fetchAdvisories?: (signal: AbortSignal) => Promise<ParsedAlerts>;
}

export interface DashboardV2Controller {
	start(): Promise<void>;
	refresh(options?: { force?: boolean }): Promise<void>;
	ensure(id: string): Promise<void>;
	earthquakes: Readable<NewsItem[]>;
	sources: Readable<SourceStatusEntry[]>;
	/** The applied news snapshot view (Latest reporting and the map read it; D1 PR 9). */
	snapshot: Readable<NewsSnapshotView | null>;
	/** This controller's own Fix It (311) items; null until its first successful commit. */
	fixIt: Readable<NewsItem[] | null>;
	brief: Readable<BriefState>;
	advisories: Readable<AdvisoryFeedState>;
	setLocation(preset: LocationPreset): void;
	healthReport: Readable<HealthReportJson | null>;
	datasetOutcomes: Readable<Readonly<Record<string, DatasetFetch>>>;
	/** Each transit agency's last complete read (null until the first) and the latest read's error. */
	transit: Readable<TransitState>;
	/** Getting Around's details, loaded through ensure('airport' | 'traffic'). */
	airport: Readable<AirportStatusData | null>;
	traffic: Readable<TrafficCorridorsData | null>;
	/** Outdoors' details, loaded through ensure(OUTDOORS_DATASETS.*.id). */
	marine: Readable<MarineForecastRead | null>;
	fires: Readable<FireRead | null>;
	quakesWeek: Readable<EarthquakeRead | null>;
	/** Cost & Character's own reads, loaded through ensure(COST_DATASETS.*.id). */
	cost: Readable<CostReads>;
	/** News & Civic's and Events' own reads, loaded through ensure(CIVIC_DATASETS / EVENTS_DATASETS). */
	civic: Readable<CivicReads>;
}

export function createDashboardV2Controller(deps: ControllerDeps): DashboardV2Controller {
	const now = deps.now ?? Date.now;
	const healthReport = writable<HealthReportJson | null>(null);
	const airport = writable<AirportStatusData | null>(null);
	const traffic = writable<TrafficCorridorsData | null>(null);
	const transit = writable<TransitState>({ reads: null, error: null });
	const outdoors: OutdoorsStores = {
		marine: writable(null),
		fires: writable(null),
		quakesWeek: writable(null)
	};
	const cost = writable<CostReads>({
		composite: null,
		cappuccino: null,
		grocery: null,
		wine: null,
		school: null,
		housing: null
	});
	const civic = writable<CivicReads>({ police: null, nps: null, activity: null });
	// /api/health feeds the header indicator only; it never re-dates a dataset (Codex r1 #3).
	const defs = deps.datasets ?? [
		...ESSENTIAL_DATASETS,
		dataset({
			id: 'health',
			name: 'Source health',
			tier: 'essential',
			load: (signal) => fetchHealthReport({ signal }),
			commit: (d) => healthReport.set(d),
			observedAtOf: () => null,
			maxAgeMs: null
		}),
		...detailDatasets(airport, traffic),
		...outdoorsDatasets(outdoors),
		...costDatasets(cost),
		...civicDatasets(civic),
		...INVENTORY_DATASETS
	];
	const registry = createDatasetRegistry(defs, deps.signal, { deadlineMs: deps.deadlineMs });
	const earthquakes = writable<NewsItem[]>([]);
	const snapshot = writable<NewsSnapshotView | null>(null);
	const fixIt = writable<NewsItem[] | null>(null);
	const parts = writable<Partial<Record<TvNewsPart, PartRecord>>>({});
	const brief = createBriefStore(deps.briefFetchers ?? BRIEF_FETCHERS, deps.signal, {
		deadlineMs: deps.deadlineMs
	});
	const advisories = createAdvisoryFeed({
		fetch: deps.fetchAdvisories ?? ((signal) => fetchMarinAdvisories({ signal })),
		signal: deps.signal,
		now
	});
	let location: LocationPreset | null = null;

	// v2 owns the news store while mounted (TV slice 3's claim): writes without
	// this token (a destroyed legacy controller, a late TV) are dropped.
	let claim: StoreClaim | null = null;
	// Store notifications run synchronously and may dispose the owner mid-refresh:
	// every write re-checks it.
	const live = () => !deps.signal.aborted;
	const newsLoader = createTvNewsLoader({
		sources:
			deps.newsSources ??
			v2NewsSources(deps.signal, {
				onTransit: (reads) => {
					if (live()) transit.set({ reads, error: null });
				}
			}),
		signal: deps.signal,
		reset: () => {
			claim = news.claim();
		},
		commit: (category, items, keep) => {
			if (live()) news.setItems(category, items, { keep, owner: claim?.token });
			// v2's own 311 layer takes every report: the reader already placed each in Marin, and the
			// news-wire text filter would drop a located report whose text names no town (Codex r3 #1).
			if (live() && category === '311') fixIt.set(items);
		},
		onEarthquakes: (items) => {
			if (live()) earthquakes.set(items);
		},
		onSnapshotApplied: (view) => {
			if (live()) snapshot.set(view);
		},
		onPartSettled: (part, outcome) => {
			if (!live()) return;
			if (part === 'transit' && !outcome.ok)
				transit.update((t) => ({ ...t, error: outcome.error }));
			// A successful first read with no items commits no category: it is an empty list,
			// never "not read yet" (Codex 9a2 #2). Items, when any, were committed before this.
			if (part === 'seeclickfix' && outcome.ok) fixIt.update((items) => items ?? []);
			parts.update((all) => ({
				...all,
				[part]: {
					outcome,
					hadSuccess: outcome.ok || (all[part]?.hadSuccess ?? false),
					observedAt: outcome.ok ? outcome.observedAt : (all[part]?.observedAt ?? null)
				}
			}));
		},
		now
	});
	const releaseClaim = () => claim?.release();
	if (deps.signal.aborted) releaseClaim();
	else deps.signal.addEventListener('abort', releaseClaim, { once: true });

	const sources = derived(
		[registry.outcomes, parts, snapshot],
		([$outcomes, $parts, $snapshot]): SourceStatusEntry[] => [
			fromSnapshotRead($parts.snapshot?.outcome, $snapshot),
			...($snapshot?.sources ?? []).map(fromSnapshotSource),
			...ADAPTER_PARTS.map((p) =>
				fromLoaderPart(
					p,
					$parts[p]?.outcome,
					$parts[p]?.hadSuccess ?? false,
					$parts[p]?.observedAt ?? null
				)
			),
			...defs
				.filter((d) => d.id in DATASET_POLICY)
				.map((d) => datasetEntry(d.id, d.name, $outcomes[d.id], d.maxAgeMs))
		]
	);

	let started = false;
	let lastCycleAt = -Infinity;
	let running: Promise<void> | null = null;

	function cycle(): Promise<void> {
		if (running) return running;
		lastCycleAt = now();
		running = Promise.all([
			registry.refresh('essential'),
			registry.refresh('detail'),
			newsLoader.refresh(),
			advisories.refresh(),
			location ? brief.load(location) : undefined
		])
			.then(() => undefined)
			.finally(() => {
				running = null;
			});
		return running;
	}

	return {
		start() {
			if (started) return running ?? Promise.resolve();
			started = true;
			return cycle();
		},
		refresh({ force = false } = {}) {
			if (deps.signal.aborted || !started) return Promise.resolve();
			if (running) return running;
			if (!force && now() - lastCycleAt < V2_MIN_REFRESH_GAP_MS) return Promise.resolve();
			return cycle();
		},
		ensure: (id) => registry.ensure(id),
		snapshot: { subscribe: snapshot.subscribe },
		fixIt: { subscribe: fixIt.subscribe },
		healthReport: { subscribe: healthReport.subscribe },
		transit: { subscribe: transit.subscribe },
		airport: { subscribe: airport.subscribe },
		traffic: { subscribe: traffic.subscribe },
		marine: { subscribe: outdoors.marine.subscribe },
		fires: { subscribe: outdoors.fires.subscribe },
		quakesWeek: { subscribe: outdoors.quakesWeek.subscribe },
		cost: { subscribe: cost.subscribe },
		civic: { subscribe: civic.subscribe },
		datasetOutcomes: registry.outcomes,
		brief: { subscribe: brief.subscribe },
		advisories: { subscribe: advisories.subscribe },
		setLocation(preset) {
			if (location?.id === preset.id) return;
			location = preset;
			// A town switch is the user asking; it is not held to the refresh gap.
			if (started && !deps.signal.aborted) void brief.load(preset);
		},
		earthquakes: { subscribe: earthquakes.subscribe },
		sources
	};
}

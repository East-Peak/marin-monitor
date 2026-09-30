/**
 * The v2 dashboard's one owner of data (spec §13.7). Created by DashboardV2,
 * aborted when it is destroyed. It loads the brief/map essentials whatever
 * sections are open, reads news from the shared snapshot (never the browser
 * feed/article/geocode chain), owns the news store while mounted, and
 * exposes per-source status whose provenance comes from the values.
 */
import { derived, writable, type Readable } from 'svelte/store';
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
	fetchEarthquakesOrThrow,
	fetchNpsAlerts,
	fetchSeeClickFixIssues,
	fetchSheriffCrimeBlotter,
	fetchSupplementalActivityFeeds,
	fetchSupplementalPoliceLogs,
	fetchTransitAlerts
} from '$lib/api/marin';
import { boundedOp, DEFAULT_OP_DEADLINE_MS } from '$lib/api/marin/bounded-op';
import { fetchMarinAdvisories } from '$lib/api/marin/nws-advisories';
import { fetchHourlyPopOrThrow } from '$lib/api/marin/nws-hourly';
import { fetchLatestObservation } from '$lib/api/marin/nws-observation';
import { fetchTideEventsOrThrow } from '$lib/api/marin/tides';
import type { LocationPreset } from '$lib/config/locations';
import type { AdvisoryFeedState, ParsedAlerts } from '$lib/weather/advisories';
import { createAdvisoryFeed } from './advisory-feed';
import { createBriefStore, type BriefFetchers, type BriefState } from './brief-store';
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
import {
	PART_NAMES,
	datasetEntry,
	fromLoaderPart,
	fromSnapshotRead,
	fromSnapshotSource
} from './source-adapters';
import type { SourceStatusEntry } from './source-status';

export const V2_REFRESH_MS = 5 * 60_000;
export const V2_MIN_REFRESH_GAP_MS = 60_000;
const DAY_MS = 86_400_000;

/** Each map dataset's G0a policy (SOURCE_INVENTORY; a test pins them equal). */
export const DATASET_POLICY = {
	gas: { healthName: 'Gas Prices', maxAgeDays: 2 },
	ev: { healthName: 'EV Charging', maxAgeDays: 2 },
	coffee: { healthName: 'Marin Coffee Index', maxAgeDays: 10 },
	fitness: { healthName: 'Fitness', maxAgeDays: 45 }
} as const;
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
	{ deadlineMs = DEFAULT_OP_DEADLINE_MS }: { deadlineMs?: number } = {}
): TvNewsSources {
	const owned =
		<T>(part: string, run: (s: AbortSignal) => Promise<T>) =>
		() =>
			boundedOp(`news ${part}`, run, { owner: signal, timeoutMs: deadlineMs });
	return {
		...TV_NEWS_SOURCES,
		nps: owned('nps', (s) => fetchNpsAlerts({ signal: s })),
		earthquakes: owned('earthquakes', async (s) =>
			earthquakesToNewsItems(await fetchEarthquakesOrThrow({ signal: s }))
		),
		transit: owned('transit', async (s) => (await fetchTransitAlerts({ signal: s })).items),
		'sheriff-blotter': owned('sheriff-blotter', (s) =>
			fetchSheriffCrimeBlotter(undefined, undefined, { signal: s })
		),
		'police-logs': owned('police-logs', (s) => fetchSupplementalPoliceLogs({ signal: s })),
		'supplemental-activity': owned('supplemental-activity', (s) =>
			fetchSupplementalActivityFeeds({ signal: s })
		),
		seeclickfix: owned('seeclickfix', (s) => fetchSeeClickFixIssues({ signal: s }))
	};
}

type AdapterPart = Exclude<TvNewsPart, 'snapshot'>;
const ADAPTER_PARTS = (Object.keys(PART_NAMES) as TvNewsPart[]).filter(
	(p): p is AdapterPart => p !== 'snapshot'
);

interface PartRecord {
	outcome: PartOutcome;
	hadSuccess: boolean;
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
	brief: Readable<BriefState>;
	advisories: Readable<AdvisoryFeedState>;
	setLocation(preset: LocationPreset): void;
}

export function createDashboardV2Controller(deps: ControllerDeps): DashboardV2Controller {
	const now = deps.now ?? Date.now;
	const defs = deps.datasets ?? [...ESSENTIAL_DATASETS, ...INVENTORY_DATASETS];
	const registry = createDatasetRegistry(defs, deps.signal, { deadlineMs: deps.deadlineMs });
	const earthquakes = writable<NewsItem[]>([]);
	const snapshot = writable<NewsSnapshotView | null>(null);
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
		sources: deps.newsSources ?? v2NewsSources(deps.signal),
		signal: deps.signal,
		reset: () => {
			claim = news.claim();
		},
		commit: (category, items, keep) => {
			if (live()) news.setItems(category, items, { keep, owner: claim?.token });
		},
		onEarthquakes: (items) => {
			if (live()) earthquakes.set(items);
		},
		onSnapshotApplied: (view) => {
			if (live()) snapshot.set(view);
		},
		onPartSettled: (part, outcome) => {
			if (!live()) return;
			parts.update((all) => ({
				...all,
				[part]: { outcome, hadSuccess: outcome.ok || (all[part]?.hadSuccess ?? false) }
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
				fromLoaderPart(p, $parts[p]?.outcome, $parts[p]?.hadSuccess ?? false)
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

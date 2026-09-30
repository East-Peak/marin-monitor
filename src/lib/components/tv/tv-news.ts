/**
 * The TV's news loader (TV slice 3). It owns the news store while /tv is
 * mounted. News comes from the producer's snapshot (GET /api/news/snapshot);
 * the non-RSS adapters are read directly. No feed parsing, article
 * enrichment or geocoding runs on the TV (TV spec Principle 1).
 *
 * - Arrival: every part commits the moment it lands; pins (311, quakes)
 *   never wait on news.
 * - Ownership: creating the loader resets the store (deps.reset) — the TV
 *   takes every category at mount and starts empty; inherited dashboard data
 *   has no value on a wallboard (Codex r2 #2/#3). From then on each category
 *   is exactly the composition of the TV parts' own last-good values. A success
 *   re-commits every category it touches now or touched before (a successful
 *   empty clears its own previous items). A failure commits nothing.
 * - Last-good: a failing part keeps its previous value. Only status-aware
 *   parts can fail (snapshot, seeclickfix, earthquakes); the other adapters
 *   swallow failures as before (out of scope; see the slice-3 plan).
 * - Order: snapshots move forward by (generatedAt, revision).
 * - Lifetime: after the owner's signal aborts, or once a newer refresh has
 *   started, nothing is written; every part is bounded by a deadline.
 * - Relevance: snapshot stories were judged by the producer with article
 *   text the browser never sees; the store must not re-judge them.
 */
import type { NewsCategory, NewsItem } from '$lib/types';
import type { NewsSnapshotResponse, NewsSnapshotView } from '$lib/news/snapshot';
import { compareByTimestamp } from '$lib/news/order';
import { isLocallyRelevant } from '$lib/config/relevance';
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
import {
	fetchNewsSnapshot,
	snapshotItemToNewsItem,
	snapshotProblems
} from '$lib/api/marin/news-snapshot';

/** Store placement, as load-all places it ('own' = the item's own category). */
const ADAPTER_BUCKET = {
	nps: 'outdoors',
	earthquakes: 'safety',
	transit: 'safety',
	'sheriff-blotter': 'safety',
	'police-logs': 'safety',
	'supplemental-activity': 'own',
	seeclickfix: '311'
} as const satisfies Record<string, NewsCategory | 'own'>;

type AdapterPart = keyof typeof ADAPTER_BUCKET;
export type TvNewsPart = 'snapshot' | AdapterPart;
type Part = TvNewsPart;
/** One part's result in one refresh (for per-source status; the TV ignores it). */
export type PartOutcome = { ok: true; at: number } | { ok: false; error: string; at: number };
type Buckets = Map<NewsCategory, NewsItem[]>;

export type TvNewsSources = {
	snapshot: (signal: AbortSignal) => Promise<NewsSnapshotResponse>;
} & Record<AdapterPart, () => Promise<NewsItem[]>>;

export const TV_NEWS_SOURCES: TvNewsSources = {
	snapshot: (signal) => fetchNewsSnapshot({ signal }),
	nps: () => fetchNpsAlerts(),
	earthquakes: async () => earthquakesToNewsItems(await fetchEarthquakesOrThrow()),
	transit: async () => (await fetchTransitAlerts()).items,
	'sheriff-blotter': () => fetchSheriffCrimeBlotter(),
	'police-logs': () => fetchSupplementalPoliceLogs(),
	'supplemental-activity': () => fetchSupplementalActivityFeeds(),
	seeclickfix: () => fetchSeeClickFixIssues()
};

const ADAPTER_PARTS = Object.keys(ADAPTER_BUCKET) as AdapterPart[];
const PARTS: readonly Part[] = ['snapshot', ...ADAPTER_PARTS];
const DEFAULT_PART_DEADLINE_MS = 15_000;

function bucketed(entries: Iterable<[NewsCategory, NewsItem]>): Buckets {
	const buckets: Buckets = new Map();
	for (const [category, item] of entries) {
		const list = buckets.get(category);
		if (list) list.push(item);
		else buckets.set(category, [item]);
	}
	return buckets;
}

/** One category-specific copy per category, as the browser path had one copy per feed. */
function snapshotBuckets(view: NewsSnapshotView): Buckets {
	return bucketed(
		view.items.flatMap((story) => {
			const item = snapshotItemToNewsItem(story);
			return story.categories.map((category): [NewsCategory, NewsItem] => [
				category,
				{ ...item, category }
			]);
		})
	);
}

function adapterBuckets(part: AdapterPart, items: NewsItem[]): Buckets {
	const bucket = ADAPTER_BUCKET[part];
	return bucketed(
		items.map((item): [NewsCategory, NewsItem] => [bucket === 'own' ? item.category : bucket, item])
	);
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
	});
	return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

interface Applied {
	revision: number;
	generatedAtMs: number;
	view: NewsSnapshotView;
}

/** Newer = later generatedAt, or the same instant with a higher revision. */
function isNewer(applied: Applied, view: NewsSnapshotView): boolean {
	const t = Date.parse(view.generatedAt);
	return (
		t > applied.generatedAtMs || (t === applied.generatedAtMs && view.revision > applied.revision)
	);
}

export function createTvNewsLoader(deps: {
	sources: TvNewsSources;
	signal: AbortSignal;
	/** Called once, now: the TV takes the whole news store at mount. */
	reset: () => void;
	commit: (category: NewsCategory, items: NewsItem[], keep: (item: NewsItem) => boolean) => void;
	onEarthquakes: (items: NewsItem[]) => void;
	onSnapshotApplied?: (view: NewsSnapshotView) => void;
	/** Called once per part per live refresh, never after disposal or supersession. */
	onPartSettled?: (part: TvNewsPart, outcome: PartOutcome) => void;
	now: () => number;
	partDeadlineMs?: number;
}): { refresh(): Promise<string[]> } {
	deps.reset();
	const deadlineMs = deps.partDeadlineMs ?? DEFAULT_PART_DEADLINE_MS;
	const lastGood = new Map<Part, Buckets>();
	let applied: Applied | null = null;
	let snapshotIds: ReadonlySet<string> = new Set();
	let generation = 0;
	const keep = (item: NewsItem) => snapshotIds.has(item.id) || isLocallyRelevant(item);

	/** Replace one part's value; re-commit every category it touches now or touched before. */
	function store(part: Part, buckets: Buckets) {
		const touched = new Set([...(lastGood.get(part)?.keys() ?? []), ...buckets.keys()]);
		lastGood.set(part, buckets);
		for (const category of touched) {
			const items = PARTS.flatMap((p) => lastGood.get(p)?.get(category) ?? []).sort(
				compareByTimestamp
			);
			deps.commit(category, items, keep);
		}
	}

	function apply(view: NewsSnapshotView): Applied {
		applied = { revision: view.revision, generatedAtMs: Date.parse(view.generatedAt), view };
		snapshotIds = new Set(view.items.map((story) => story.id));
		store('snapshot', snapshotBuckets(view));
		deps.onSnapshotApplied?.(view);
		return applied;
	}

	async function loadSnapshot(live: () => boolean, problems: string[]) {
		let response: NewsSnapshotResponse | null = null;
		let failure: string | null = null;
		try {
			response = await withDeadline(deps.sources.snapshot(deps.signal), deadlineMs);
		} catch (err) {
			failure = `news-snapshot: ${message(err)}`;
		}
		if (!live()) return;
		if (response && response.status !== 'ok') {
			failure = `news-snapshot: ${response.status} (${response.reason})`;
		}
		if (failure) problems.push(failure);
		deps.onPartSettled?.(
			'snapshot',
			failure ? { ok: false, error: failure, at: deps.now() } : { ok: true, at: deps.now() }
		);
		// The callback may dispose or supersede this refresh.
		if (!live()) return;
		if (response?.status === 'ok' && (applied === null || isNewer(applied, response.snapshot))) {
			apply(response.snapshot);
		}
		// Evaluated every refresh, whatever this read did (Codex r1 #12).
		if (applied) problems.push(...snapshotProblems(applied.view, deps.now()));
	}

	async function loadAdapter(part: AdapterPart, live: () => boolean, problems: string[]) {
		let items: NewsItem[];
		try {
			items = await withDeadline(deps.sources[part](), deadlineMs);
		} catch (err) {
			if (live()) {
				problems.push(`${part}: ${message(err)}`);
				deps.onPartSettled?.(part, { ok: false, error: message(err), at: deps.now() });
			}
			return;
		}
		if (!live()) return;
		if (part === 'earthquakes') deps.onEarthquakes(items);
		store(part, adapterBuckets(part, items));
		// The callbacks above may dispose or supersede this refresh.
		if (live()) deps.onPartSettled?.(part, { ok: true, at: deps.now() });
	}

	return {
		async refresh() {
			const gen = ++generation;
			const live = () => !deps.signal.aborted && gen === generation;
			if (!live()) return [];
			const problems: string[] = [];
			await Promise.all([
				loadSnapshot(live, problems),
				...ADAPTER_PARTS.map((part) => loadAdapter(part, live, problems))
			]);
			return live() ? problems : [];
		}
	};
}

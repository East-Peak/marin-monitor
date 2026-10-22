/**
 * Cost & Character (desktop Goal 3): a pure view over the composite index, gas prices and the
 * sub-index blobs. Every number keeps its own read: a failed or unverified source is
 * "Unavailable" / "Unknown", never $0, and a series too short to draw says "No history yet".
 */
import type { HousingMetric } from '$lib/api/marin/housing';
import type { LifestyleCard } from '$lib/lifestyle/view';
import type { CoffeeData, CoffeeIndexData } from '$lib/types/coffee';
import type { CompositeData, CompositeSnapshot, MarinNumberItem } from '$lib/types/composite';
import type { FitnessData } from '$lib/types/fitness';
import type { GasPriceData, GasStation } from '$lib/types/gas';
import type { GroceryBasketData } from '$lib/types/grocery';
import type { SchoolIndexData } from '$lib/types/school';
import type { WineIndexData } from '$lib/types/wine';
import { gasChangeOverDays } from '$lib/utils/gas-change';
import { mapMeasured, measuredFromEntry, type Measured } from './measured';
import { datasetEntry, type DatasetFetch } from './source-adapters';
import { presentSection, type SectionPresentation } from './source-status';
import { DATASET_POLICY } from './dataset-policy';

const DAY_MS = 86_400_000;

/** Cost's own detail reads (loaded when the section opens); each pinned to its G0a policy. */
export const COST_DATASETS = {
	composite: {
		id: 'composite',
		name: 'Composite index',
		healthName: 'Composite Index',
		maxAgeDays: 10
	},
	cappuccino: { id: 'cappuccino', name: 'Cappuccino', healthName: 'Cappuccino', maxAgeDays: 10 },
	grocery: { id: 'grocery', name: 'Grocery basket', healthName: 'Grocery Basket', maxAgeDays: 10 },
	wine: { id: 'wine', name: 'Wine index', healthName: 'Wine Index', maxAgeDays: 10 },
	school: { id: 'school', name: 'School tuition', healthName: 'School Tuition', maxAgeDays: 45 },
	housing: { id: 'housing', name: 'Redfin housing', healthName: 'Housing', maxAgeDays: 45 },
	lifestyle: {
		id: 'lifestyle',
		name: 'Lifestyle index',
		healthName: 'Lifestyle Index',
		maxAgeDays: 10
	}
} as const;
type CostDatasetId = keyof typeof COST_DATASETS;

/** The section's reads: the Lifestyle Index (behind its flag) or the old composite, never both. */
export const costDatasetIds = (lifestyleOn: boolean): string[] =>
	Object.values(COST_DATASETS)
		.filter((d) => d.id !== (lifestyleOn ? 'composite' : 'lifestyle'))
		.map((d) => d.id);

export const costMaxAgeMs = (id: CostDatasetId) => COST_DATASETS[id].maxAgeDays * DAY_MS;

// ── The composite: hero, trend and tier bars ────────────────────────────

export interface CompositeView {
	score: number;
	/** Against the previous weekly reading; null with only one. */
	change: number | null;
	previousAtMs: number | null;
	/** Weekly readings, oldest first. */
	series: { atMs: number; score: number }[];
	readings: number;
	sinceMs: number;
	tiers: { label: string; category: string; weightPct: number; score: number; bar: TierBar }[];
	marinNumber: CompositeSnapshot['marinNumber'];
}

export interface TierBar {
	side: 'left' | 'right';
	/** Half the track is ±20 points; a tier further out pins at the edge. */
	widthPct: number;
}

const TIER_SPAN_POINTS = 20;

export function tierBar(score: number): TierBar {
	const d = score - 100;
	return {
		side: d >= 0 ? 'right' : 'left',
		widthPct: Math.min(50, (Math.abs(d) / TIER_SPAN_POINTS) * 50)
	};
}

/** History and current, one per timestamp, oldest first (the blob repeats current at its head). */
function readings<T extends { timestamp: string }>(current: T | null, history: readonly T[]): T[] {
	const byAt = new Map<number, T>();
	for (const s of [...history, ...(current ? [current] : [])]) {
		const at = Date.parse(s.timestamp);
		if (Number.isFinite(at)) byAt.set(at, s);
	}
	return [...byAt.entries()].sort((a, b) => a[0] - b[0]).map(([, s]) => s);
}

export function compositeView(data: CompositeData): CompositeView | null {
	const current = data.current;
	if (!current) return null;
	const series = readings(current, data.history).map((s) => ({
		atMs: Date.parse(s.timestamp),
		score: s.compositeScore
	}));
	const previous = series.length >= 2 ? series[series.length - 2] : null;
	return {
		score: current.compositeScore,
		change: previous ? current.compositeScore - previous.score : null,
		previousAtMs: previous?.atMs ?? null,
		series,
		readings: series.length,
		sinceMs: series[0].atMs,
		tiers: current.tiers.map((t) => ({
			label: t.label,
			category: t.category,
			weightPct: Math.round(t.weight * 100),
			score: t.score,
			bar: tierBar(t.score)
		})),
		marinNumber: current.marinNumber
	};
}

// ── Gas ──────────────────────────────────────────────────────────────────

export interface GasStationPrice {
	name: string;
	address: string;
	price: number;
}

export interface GasView {
	avg: number | null;
	change7: number | null;
	stationCount: number;
	cheapest: GasStationPrice[];
	priciest: GasStationPrice | null;
	diesel: number | null;
	premium: number | null;
	/** Average with its low–high band, oldest first. */
	series: { atMs: number; avg: number; min: number | null; max: number | null }[];
}

const regular = (s: GasStation) => s.fuelPrices.find((f) => f.type === 'REGULAR_UNLEADED')?.price;

export function gasView(data: GasPriceData): GasView | null {
	const current = data.current;
	if (!current) return null;
	const priced = current.stations
		.flatMap((s) => {
			const price = regular(s);
			return price === undefined ? [] : [{ name: s.name, address: s.address, price }];
		})
		.sort((a, b) => a.price - b.price);
	return {
		avg: current.avgRegular,
		change7: gasChangeOverDays(data.history, current, 7),
		stationCount: current.stationCount,
		cheapest: priced.slice(0, 3),
		priciest: priced.length > 3 ? priced[priced.length - 1] : null,
		diesel: current.avgDiesel,
		premium: current.avgPremium,
		series: readings(current, data.history).flatMap((s) =>
			s.avgRegular === null
				? []
				: [
						{
							atMs: Date.parse(s.timestamp),
							avg: s.avgRegular,
							min: s.minRegular,
							max: s.maxRegular
						}
					]
		)
	};
}

// ── Sub-index tiles ─────────────────────────────────────────────────────

export interface SubIndexTile {
	id: string;
	title: string;
	color: string;
	kind: 'value' | 'loading' | 'unknown' | 'unavailable';
	value: string;
	detail: string | null;
	/** At least two points, oldest first; null otherwise. */
	spark: number[] | null;
	noHistory: boolean;
	/** Why there is no sparkline, for a tile whose source publishes none. */
	noHistoryReason: string | null;
	measured: Measured<unknown>;
	/** A source line for a value with no time of its own (e.g. the latest month published). */
	untimed?: string;
	/** No freshness claim: the source line shows no time and no green dot. */
	muted: boolean;
}

const usd = (n: number, dec = 2) =>
	`$${n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
const usd0 = (n: number) => usd(n, 0);
export const signed = (n: number, dec: number, pre = '$') =>
	`${n > 0 ? '+' : n < 0 ? '−' : '±'}${pre}${Math.abs(n).toFixed(dec)}`;

interface TileSpec<T> {
	id: string;
	title: string;
	color: string;
	measured: Measured<T>;
	value: (v: T) => string;
	detail: (v: T) => string | null;
	/** Values oldest first; nulls are dropped, never drawn as 0. */
	series: ((v: T) => (number | null)[]) | null;
	noHistoryReason?: string;
	untimed?: (v: T) => string | undefined;
	/** The source can't vouch for when the value was true (a fixed estimate, a maintained list). */
	muted?: (v: T) => boolean;
}

function tile<T>(spec: TileSpec<T>): SubIndexTile {
	const { measured: m } = spec;
	const base = {
		id: spec.id,
		title: spec.title,
		color: spec.color,
		measured: m as Measured<unknown>
	};
	if (m.kind !== 'value') {
		const value = { loading: 'Loading…', unknown: 'Unknown', unavailable: 'Unavailable' }[m.kind];
		return {
			...base,
			kind: m.kind,
			value,
			detail: m.kind === 'loading' ? null : m.reason,
			spark: null,
			noHistory: false,
			noHistoryReason: null,
			muted: false
		};
	}
	const muted = spec.muted?.(m.value) ?? false;
	const points = spec.series ? spec.series(m.value).filter((n): n is number => n !== null) : [];
	const spark = points.length >= 2 ? points : null;
	return {
		...base,
		// A muted value keeps its read's status but never shows that read's time as its own.
		measured: muted ? { ...m, observedAt: null } : m,
		muted,
		kind: 'value',
		value: spec.value(m.value),
		detail: spec.detail(m.value),
		spark,
		noHistory: spark === null,
		noHistoryReason: spark === null ? (spec.noHistoryReason ?? null) : null,
		untimed: spec.untimed?.(m.value)
	};
}

const monthName = (month: string) =>
	new Date(`${month}T12:00:00Z`).toLocaleDateString('en-US', {
		month: 'short',
		year: 'numeric',
		timeZone: 'UTC'
	});

/** Start, middle and end of `n` points, each index once (two points are two ticks). */
export function axisTicks(n: number): number[] {
	return n <= 0 ? [] : [...new Set([0, Math.floor((n - 1) / 2), n - 1])];
}

/** Composite line items with a source of their own but no published history yet. */
const COMPOSITE_ITEM_TILES = [
	{
		id: 'rivian-lease',
		title: 'Rivian R1S lease',
		color: '#10b981',
		detail: 'R1S payment'
	},
	{ id: 'dog-walker', title: 'The Dog', color: '#84cc16', detail: 'Walker + upkeep, monthly' },
	{ id: 'ikon-pass', title: 'Ikon Pass', color: '#06b6d4', detail: 'Ski season, amortized' },
	{ id: 'camp-prices', title: 'Summer camp', color: '#eab308', detail: '2 kids, amortized' }
] as const;

// ── The section's one view ──────────────────────────────────────────────

export interface CostInput {
	composite: CompositeData | null;
	gas: GasPriceData | null;
	coffee: CoffeeIndexData | null;
	cappuccino: CoffeeData | null;
	grocery: GroceryBasketData | null;
	wine: WineIndexData | null;
	fitness: FitnessData | null;
	school: SchoolIndexData | null;
	housing: HousingMetric[] | null;
	lifestyle: LifestyleCard | null;
	/** The server-side flag: the Lifestyle Index's card replaces every composite consumer. */
	lifestyleOn: boolean;
	outcomes: Readonly<Record<string, DatasetFetch>>;
	now: number;
}

export interface CostView {
	composite: Measured<CompositeView>;
	/** Null while the flag is off. */
	lifestyle: Measured<LifestyleCard> | null;
	/** The phone's Cost section is the Lifestyle card alone: its status is that read's. Null while off. */
	lifestyleStatus: SectionPresentation | null;
	gas: Measured<GasView>;
	tiles: SubIndexTile[];
	status: SectionPresentation;
}

/** A blob with no current snapshot is a read with no value, never an empty one. */
const withCurrent = <T extends { current: unknown }>(d: T | null) => (d?.current ? d : null);

export function costView(input: CostInput): CostView {
	const { outcomes, now } = input;
	const essential = (id: keyof typeof DATASET_POLICY, name: string) =>
		datasetEntry(id, name, outcomes[id], DATASET_POLICY[id].maxAgeDays * DAY_MS);
	const own = (id: CostDatasetId) =>
		datasetEntry(
			COST_DATASETS[id].id,
			COST_DATASETS[id].name,
			outcomes[COST_DATASETS[id].id],
			costMaxAgeMs(id)
		);
	const entries = {
		composite: own('composite'),
		gas: essential('gas', 'Gas prices'),
		coffee: essential('coffee', 'Coffee index'),
		fitness: essential('fitness', 'Fitness drop-ins'),
		cappuccino: own('cappuccino'),
		grocery: own('grocery'),
		wine: own('wine'),
		school: own('school'),
		housing: own('housing'),
		lifestyle: own('lifestyle')
	};
	const read = <T>(entry: (typeof entries)[keyof typeof entries], v: T | null, source: string) =>
		measuredFromEntry(entry, v, source, now);

	const compositeRaw = read(
		entries.composite,
		withCurrent(input.composite),
		'Composite index, weekly'
	);
	const composite = mapMeasured(compositeRaw, (d) => compositeView(d)!);
	const gasRaw = read(entries.gas, withCurrent(input.gas), 'Google Places fuel prices');
	const gas = mapMeasured(gasRaw, (d) => gasView(d)!);
	const item = (key: string) =>
		mapMeasured(
			compositeRaw,
			(d) => d.current!.marinNumber.items.find((i) => i.sourceIndex === key) ?? null
		);

	const tiles: SubIndexTile[] = [
		tile({
			id: 'coffee',
			title: 'Marin Coffee Index',
			color: '#d97706',
			measured: read(entries.coffee, withCurrent(input.coffee), 'Live menus'),
			value: (d) => {
				const p = d.current!.primaryDrinkSummary.medianPrice;
				return p === null ? 'Unknown' : usd(p);
			},
			detail: (d) =>
				`${d.current!.primaryDrinkSummary.label.toLowerCase()} median · ${d.current!.pricedShopCount} shops`,
			series: (d) => readings(d.current, d.history).map((h) => h.primaryDrinkSummary.medianPrice)
		}),
		tile({
			id: 'cappuccino',
			title: 'Cappuccino',
			color: '#f59e0b',
			measured: read(entries.cappuccino, withCurrent(input.cappuccino), 'Cafe menus'),
			value: (d) => (d.current!.avgPrice === null ? 'Unknown' : usd(d.current!.avgPrice)),
			detail: (d) => {
				const c = d.current!;
				const range =
					c.minPrice !== null && c.maxPrice !== null
						? ` · ${usd(c.minPrice)}–${usd(c.maxPrice)}`
						: '';
				return `avg of ${c.pricedShopCount ?? c.shopCount} shops${range}`;
			},
			series: (d) => readings(d.current, d.history).map((h) => h.avgPrice)
		}),
		tile({
			id: 'grocery',
			title: 'Grocery basket',
			color: '#f97316',
			measured: read(entries.grocery, withCurrent(input.grocery), 'Instacart prices'),
			value: (d) => (d.current!.totalCheapest === null ? 'Unknown' : usd(d.current!.totalCheapest)),
			detail: (d) => `cheapest mix · ${d.current!.itemsFound} items priced`,
			series: (d) => readings(d.current, d.history).map((h) => h.totalCheapest)
		}),
		tile({
			id: 'wine',
			title: 'Wine Index',
			color: '#a855f7',
			measured: read(entries.wine, withCurrent(input.wine), 'PlumpJack'),
			value: (d) => {
				const napa = d.current!.categories.find((c) => c.category === 'napa-sonoma');
				return napa?.medianPrice == null ? 'Unknown' : usd(napa.medianPrice);
			},
			detail: () => 'Napa & Sonoma median bottle',
			series: (d) =>
				readings(d.current, d.history).map(
					(h) => h.categories.find((c) => c.category === 'napa-sonoma')?.medianPrice ?? null
				)
		}),
		tile({
			id: 'fitness',
			title: 'Fitness drop-in',
			color: '#ec4899',
			measured: read(entries.fitness, withCurrent(input.fitness), 'Studio prices'),
			value: (d) => (d.current!.medianPrice === null ? 'Unknown' : usd0(d.current!.medianPrice)),
			detail: (d) => {
				const t = d.current!.medianByType;
				const parts = [
					t.yoga !== undefined && `yoga ${usd0(t.yoga)}`,
					t.pilates !== undefined && `Pilates ${usd0(t.pilates)}`
				];
				return ['median class', ...parts.filter(Boolean)].join(' · ');
			},
			series: (d) => readings(d.current, d.history).map((h) => h.medianPrice)
		}),
		tile({
			id: 'school',
			title: 'School tuition',
			color: '#3b82f6',
			// The cron recomputes a maintained list: its run time is not when tuition was checked.
			measured: read(entries.school, withCurrent(input.school), 'Maintained tuition list'),
			value: (d) => `$${Math.round(d.current!.cumulativeK12 / 1000)}k`,
			detail: (d) => {
				const high = d.current!.tiers.find((t) => t.level === 'high');
				return high
					? `K–12 private, cumulative · high school ${usd0(high.avgTuition)}/yr`
					: 'K–12 private, cumulative';
			},
			series: (d) => readings(d.current, d.history).map((h) => h.cumulativeK12),
			untimed: () => 'reference prices, recomputed monthly',
			muted: () => true
		}),
		tile({
			id: 'housing',
			title: 'Median home',
			color: '#0ea5e9',
			measured: read(
				entries.housing,
				input.housing?.some((m) => m.medianPrice !== null) ? input.housing : null,
				'Redfin'
			),
			value: (d) => `$${(latestHome(d)!.medianPrice! / 1e6).toFixed(2)}M`,
			detail: (d) => {
				const latest = latestHome(d)!;
				const yearAgo = d.find((m) => m.month === shiftYear(latest.month));
				if (yearAgo?.medianPrice == null) return monthName(latest.month);
				const pct = ((latest.medianPrice! - yearAgo.medianPrice) / yearAgo.medianPrice) * 100;
				return `${monthName(latest.month)} · ${signed(pct, 0, '')}% vs a year earlier`;
			},
			series: (d) =>
				[...d].sort((a, b) => a.month.localeCompare(b.month)).map((m) => m.medianPrice),
			// Redfin's months carry no read time, so the latest month is the only date it can claim.
			untimed: (d) => `latest month published: ${monthName(latestHome(d)!.month)}`,
			muted: () => true
		}),
		tile({
			id: 'gas',
			title: 'Gas, regular',
			color: '#10b981',
			measured: gas,
			value: (g) => (g.avg === null ? 'Unknown' : usd(g.avg, 3)),
			detail: (g) =>
				`avg of ${g.stationCount} stations${g.change7 === null ? '' : ` · ${signed(g.change7, 3)} 7 d`}`,
			series: (g) =>
				g.series
					.filter((p) => p.atMs > (g.series.at(-1)?.atMs ?? 0) - 30 * DAY_MS)
					.map((p) => p.avg)
		}),
		...(input.lifestyleOn ? [] : COMPOSITE_ITEM_TILES).map((t) =>
			tile<MarinNumberItem | null>({
				...t,
				measured: item(t.id),
				value: (i) => (i ? `${usd0(i.monthly)}/mo` : 'Unknown'),
				// The builder fills a missing scrape with a fixed default and marks it static.
				detail: (i) =>
					!i
						? 'not in this week’s composite'
						: i.source === 'static'
							? `${t.detail} · fixed estimate`
							: t.detail,
				series: null,
				noHistoryReason: 'Current price only; history isn’t published yet',
				untimed: (i) => (i?.source === 'static' ? 'fixed estimate in the composite' : undefined),
				muted: (i) => i?.source === 'static'
			})
		)
	];

	const lifestyle = input.lifestyleOn
		? read(entries.lifestyle, input.lifestyle, 'Lifestyle Index, weekly')
		: null;
	const shown = input.lifestyleOn ? lifestyle! : composite;
	const hidden = input.lifestyleOn ? entries.composite : entries.lifestyle;
	const all = Object.values(entries).filter((e) => e !== hidden);
	const valued = tiles.filter((t) => t.kind === 'value').length + (shown.kind === 'value' ? 1 : 0);
	return {
		composite,
		lifestyle,
		lifestyleStatus: lifestyle
			? presentSection(
					[entries.lifestyle],
					{
						total: lifestyle.kind === 'value' ? 1 : 0,
						matching: lifestyle.kind === 'value' ? 1 : 0
					},
					now
				)
			: null,
		gas,
		tiles,
		status: presentSection(all, { total: valued, matching: valued }, now)
	};
}

function latestHome(d: readonly HousingMetric[]): HousingMetric | null {
	return (
		[...d]
			.filter((m) => m.medianPrice !== null)
			.sort((a, b) => b.month.localeCompare(a.month))[0] ?? null
	);
}

function shiftYear(month: string): string {
	return `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`;
}

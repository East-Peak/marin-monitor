import { describe, it, expect } from 'vitest';
import { SOURCE_INVENTORY } from '$lib/server/health/inventory';
import type { CompositeData, CompositeSnapshot } from '$lib/types/composite';
import type { GasPriceData, GasPriceSnapshot } from '$lib/types/gas';
import type { FitnessData } from '$lib/types/fitness';
import type { DatasetFetch } from './source-adapters';
import {
	COST_DATASETS,
	axisTicks,
	compositeView,
	costDatasetIds,
	costView,
	compositeStops,
	gasStops,
	housingObservedAt,
	sparkStops,
	tierBar,
	type CostInput,
	type SubIndexTile
} from './cost';
import { wordsText } from './chart-readout';
import { measuredValue } from './measured';
import { pacificDay } from './pacific-time';
import { readFileSync } from 'node:fs';
import { parseBlsSeries } from '../../../scripts/shared/bls-series.mjs';
import { groceryInflation as inflationView } from '$lib/grocery/inflation';

const NOW = Date.parse('2026-10-15T18:00:00Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const live = (ageMs = DAY): DatasetFetch => ({ kind: 'live', observedAt: NOW - ageMs });
const failed: DatasetFetch = {
	kind: 'failed',
	error: 'HTTP 503',
	retained: false,
	observedAt: null
};

function composite(at: number, score: number): CompositeSnapshot {
	return {
		timestamp: iso(at),
		lastSuccessfulScrapeAt: iso(at),
		compositeScore: score,
		tiers: [
			{
				category: 'daily-life',
				label: 'Daily Life',
				monthlyTotal: 1,
				baselineTotal: 1,
				score: 97,
				weight: 0.4
			},
			{
				category: 'housing',
				label: 'Housing',
				monthlyTotal: 1,
				baselineTotal: 1,
				score: 131,
				weight: 0.25
			}
		],
		marinNumber: {
			total: 2700,
			annualized: 32400,
			items: [
				{ label: 'Rivian R1S payment', monthly: 1209, source: 'live', sourceIndex: 'rivian-lease' },
				{ label: 'Therapist (weekly)', monthly: 1400, source: 'static' },
				{ label: 'Coffee', monthly: 91, source: 'live', sourceIndex: 'coffee' }
			]
		}
	};
}

function fitness(points: { at: number; median: number }[]): FitnessData {
	const latest = points.at(-1)!;
	return {
		current: {
			timestamp: iso(latest.at),
			lastSuccessfulScrapeAt: iso(latest.at),
			studioCount: 16,
			medianPrice: latest.median,
			avgPrice: latest.median,
			minPrice: 20,
			maxPrice: 45,
			medianByType: { yoga: 30, pilates: 45 },
			studios: []
		},
		history: points.map((p) => ({
			timestamp: iso(p.at),
			studioCount: 16,
			medianPrice: p.median,
			avgPrice: p.median,
			minPrice: 20,
			maxPrice: 45,
			medianByType: {}
		}))
	};
}

function gasSnap(at: number, avg: number): GasPriceSnapshot {
	return {
		timestamp: iso(at),
		lastSuccessfulScrapeAt: iso(at),
		stationCount: 3,
		avgRegular: avg,
		avgMidgrade: null,
		avgPremium: 6.9,
		avgDiesel: 6.6,
		minRegular: avg - 0.5,
		maxRegular: avg + 0.6,
		stations: []
	};
}

function input(over: Partial<CostInput> = {}): CostInput {
	return {
		composite: null,
		gas: null,
		coffee: null,
		cappuccino: null,
		grocery: null,
		groceryInflation: null,
		wine: null,
		fitness: null,
		school: null,
		housing: null,
		lifestyle: null,
		lifestyleOn: false,
		outcomes: {},
		now: NOW,
		...over
	};
}

describe('cost model', () => {
	it('composite change compares the last two weekly readings', () => {
		const weeks = [100.3, 105.9, 101.8, 100.6].map((s, i) => composite(NOW - (4 - i) * 7 * DAY, s));
		// The blob serves history newest first, with current repeated at its head.
		const data: CompositeData = { current: weeks[3], history: [...weeks].reverse() };
		const view = compositeView(data)!;
		expect(view.score).toBe(100.6);
		expect(view.change).toBeCloseTo(100.6 - 101.8, 10);
		expect(view.previousAtMs).toBe(Date.parse(weeks[2].timestamp));
		expect(view.readings).toBe(4);
		expect(view.sinceMs).toBe(Date.parse(weeks[0].timestamp));
		expect(view.series.map((p) => p.score)).toEqual([100.3, 105.9, 101.8, 100.6]);

		const alone = compositeView({ current: weeks[3], history: [weeks[3]] })!;
		expect(alone.change).toBeNull();
	});

	it('tier bar width clamps at ±20 points', () => {
		expect(tierBar(110)).toEqual({ side: 'right', widthPct: 25 });
		expect(tierBar(90)).toEqual({ side: 'left', widthPct: 25 });
		expect(tierBar(131)).toEqual({ side: 'right', widthPct: 50 });
		expect(tierBar(62)).toEqual({ side: 'left', widthPct: 50 });
		expect(tierBar(100).widthPct).toBe(0);
	});

	it('sub-index with < 2 history points → noHistory: true, no sparkline', () => {
		const one = fitness([{ at: NOW - DAY, median: 32 }]);
		const two = fitness([
			{ at: NOW - 40 * DAY, median: 30 },
			{ at: NOW - DAY, median: 32 }
		]);
		const tile = (f: FitnessData) =>
			costView(input({ fitness: f, outcomes: { fitness: live() } })).tiles.find(
				(t) => t.id === 'fitness'
			)!;
		expect(tile(one)).toMatchObject({ kind: 'value', value: '$32', noHistory: true, spark: null });
		expect(tile(two)).toMatchObject({ kind: 'value', noHistory: false });
		expect(tile(two).spark?.map((r) => r.value)).toEqual([30, 32]);

		// Items the composite prices with no published history of their own say so.
		const comp: CompositeData = { current: composite(NOW - DAY, 100.6), history: [] };
		const rivian = costView(
			input({ composite: comp, outcomes: { [COST_DATASETS.composite.id]: live() } })
		).tiles.find((t) => t.id === 'rivian-lease')!;
		expect(rivian).toMatchObject({
			kind: 'value',
			value: '$1,209/mo',
			noHistory: true,
			spark: null
		});
	});

	it('a spark keeps each reading’s date, and its null where it falls', () => {
		const f = fitness([
			{ at: NOW - 40 * DAY, median: 30 },
			{ at: NOW - 20 * DAY, median: null as unknown as number },
			{ at: NOW - DAY, median: 32 }
		]);
		const tile = costView(input({ fitness: f, outcomes: { fitness: live() } })).tiles.find(
			(t) => t.id === 'fitness'
		)!;
		expect(tile.spark).toEqual([
			{ at: NOW - 40 * DAY, value: 30, kind: 'observed', unit: '' },
			{ at: NOW - 20 * DAY, value: null, kind: 'observed', unit: '' },
			{ at: NOW - DAY, value: 32, kind: 'observed', unit: '' }
		]);
		expect(tile.sparkFormat(32)).toBe('$32');
	});

	it('failed sub-index read → unavailable wording, never 0 or $0', () => {
		const view = costView(
			input({
				fitness: null,
				outcomes: {
					fitness: failed,
					[COST_DATASETS.composite.id]: failed,
					[COST_DATASETS.school.id]: failed,
					gas: failed
				}
			})
		);
		for (const id of ['fitness', 'school', 'rivian-lease', 'gas']) {
			const tile = view.tiles.find((t) => t.id === id)!;
			expect(tile.kind, id).toBe('unavailable');
			expect(tile.value, id).toBe('Unavailable');
			expect(tile.detail, id).toContain('the source returned an error');
			expect(tile.spark, id).toBeNull();
		}
		for (const tile of view.tiles) expect(tile.value).not.toMatch(/^\$?0(\.0+)?$/);
		expect(view.composite.kind).toBe('unavailable');
		expect(view.gas.kind).toBe('unavailable');

		const loading = costView(input()).tiles.find((t) => t.id === 'wine')!;
		expect(loading).toMatchObject({ kind: 'loading', value: 'Loading…', spark: null });
	});

	it('gas card: 7-day change from the shared helper, cheapest three, diesel and premium', () => {
		const history = Array.from({ length: 50 }, (_, i) =>
			gasSnap(NOW - i * 4 * 3_600_000, 6.3 + i * 0.002)
		);
		const current = {
			...history[0],
			stations: [6.1, 5.9, 6.4, 6.0].map((p, i) => ({
				placeId: `s${i}`,
				name: `Station ${i}`,
				address: `${i} Main St, San Rafael`,
				lat: 38,
				lon: -122.5,
				fuelPrices: [{ type: 'REGULAR_UNLEADED' as const, price: p }]
			}))
		};
		const data: GasPriceData = { current, history };
		const view = costView(input({ gas: data, outcomes: { gas: live(3_600_000) } }));
		expect(view.gas.kind).toBe('value');
		if (view.gas.kind !== 'value') return;
		const gas = view.gas.value;
		expect(gas.change7).toBeCloseTo(6.3 - (6.3 + 42 * 0.002), 10);
		expect(gas.cheapest.map((s) => s.price)).toEqual([5.9, 6.0, 6.1]);
		expect(gas.priciest?.price).toBe(6.4);
		expect(gas.diesel).toBe(6.6);
		expect(gas.premium).toBe(6.9);
		expect(gas.series[0].atMs).toBeLessThan(gas.series.at(-1)!.atMs);
	});

	it('axis ticks: start, middle and end, never a repeated index (two readings → two ticks)', () => {
		expect(axisTicks(50)).toEqual([0, 24, 49]);
		expect(axisTicks(3)).toEqual([0, 1, 2]);
		expect(axisTicks(2)).toEqual([0, 1]);
		expect(axisTicks(1)).toEqual([0]);
		expect(axisTicks(0)).toEqual([]);
	});

	it('a composite item the builder filled with its fixed default is an estimate, not a live quote', () => {
		const snap = composite(NOW - DAY, 100.6);
		snap.marinNumber.items[0] = { ...snap.marinNumber.items[0], source: 'static' };
		const view = costView(
			input({
				composite: { current: snap, history: [] },
				outcomes: { [COST_DATASETS.composite.id]: live() }
			})
		);
		const rivian = view.tiles.find((t) => t.id === 'rivian-lease')!;
		expect(rivian.detail).toContain('fixed estimate');
		expect(rivian.detail).not.toContain('live');
		expect(rivian.muted).toBe(true);
		expect(rivian.measured.kind === 'value' && rivian.measured.observedAt).toBeNull();
		// A live item keeps the composite's time, and says that is where it comes from.
		snap.marinNumber.items[0] = { ...snap.marinNumber.items[0], source: 'live' };
		const liveTile = costView(
			input({
				composite: { current: snap, history: [] },
				outcomes: { [COST_DATASETS.composite.id]: live() }
			})
		).tiles.find((t) => t.id === 'rivian-lease')!;
		expect(liveTile.muted).toBe(false);
		expect(liveTile.measured.source).toMatch(/composite/i);
	});

	it('housing and school make no freshness claim they cannot back: month with year; reference prices', () => {
		const housing = [
			{
				month: '2025-05-01',
				medianPrice: 1_500_000,
				medianPpsf: null,
				inventory: null,
				daysOnMarket: null,
				homesSold: null
			},
			{
				month: '2026-05-01',
				medianPrice: 1_600_000,
				medianPpsf: null,
				inventory: null,
				daysOnMarket: null,
				homesSold: null
			}
		];
		const school = {
			current: {
				timestamp: iso(NOW - DAY),
				lastSuccessfulScrapeAt: iso(NOW - DAY),
				medianHouseholdIncome: 145000,
				incomeSource: 'ACS',
				incomeYear: '2024',
				tiers: [],
				schools: [],
				cumulativeK12: 698998
			},
			history: []
		};
		const view = costView(
			input({
				housing,
				school,
				outcomes: {
					[COST_DATASETS.housing.id]: { kind: 'live', observedAt: null },
					[COST_DATASETS.school.id]: live()
				}
			})
		);
		const home = view.tiles.find((t) => t.id === 'housing')!;
		expect(home.untimed).toContain('May 2026');
		expect(home.muted).toBe(true);
		const tuition = view.tiles.find((t) => t.id === 'school')!;
		expect(tuition.muted).toBe(true);
		expect(tuition.measured.kind === 'value' && tuition.measured.observedAt).toBeNull();
		expect(tuition.untimed).toMatch(/reference/i);
	});

	describe('coverage is the real source state', () => {
		const HOME = (month: string, medianPrice: number | null = 1_600_000) => ({
			month,
			medianPrice,
			medianPpsf: null,
			inventory: null,
			daysOnMarket: null,
			homesSold: null
		});

		it('Redfin housing is dated by the end of its newest month, as health dates it', () => {
			expect(housingObservedAt([HOME('2026-09-01'), HOME('2026-10-01')])).toBe(
				'2026-10-31T00:00:00.000Z'
			);
			expect(housingObservedAt([])).toBeNull();
		});

		it('month-dated reads (Redfin, BLS) carry month precision into the coverage list', () => {
			const view = costView(input({ outcomes: { housing: live(), groceryInflation: live() } }));
			const byName = (n: string) => view.status.entries.find((e) => e.name === n);
			expect(byName('Redfin housing')?.observedPrecision).toBe('month');
			expect(byName('SF-area grocery inflation')?.observedPrecision).toBe('month');
			expect(byName('Wine index')?.observedPrecision).toBeUndefined();
		});

		it('the retired grocery basket is never a failing source', () => {
			const view = costView(
				input({
					outcomes: {
						[COST_DATASETS.grocery.id]: { kind: 'live', observedAt: NOW - 40 * DAY }
					}
				})
			);
			expect(view.status.failing.map((f) => f.name)).not.toContain('Grocery basket');
			expect(view.status.entries.map((e) => e.name)).not.toContain('Grocery basket');
		});

		it('a housing read dated by its month is reporting, not unverified', () => {
			const housing = [HOME('2026-09-01')];
			const view = costView(
				input({
					housing,
					outcomes: {
						[COST_DATASETS.housing.id]: {
							kind: 'live',
							observedAt: Date.parse('2026-09-30T00:00Z')
						}
					}
				})
			);
			expect(view.status.failing.map((f) => f.name)).not.toContain('Redfin housing');
		});
	});

	it('the dog line is the whole dog, not the walker alone', () => {
		const view = costView(
			input({
				composite: {
					current: {
						...composite(NOW - DAY, 100),
						marinNumber: {
							total: 794,
							annualized: 9528,
							items: [{ label: 'The Dog', monthly: 794, source: 'live', sourceIndex: 'dog-walker' }]
						}
					},
					history: []
				},
				outcomes: { [COST_DATASETS.composite.id]: live() }
			})
		);
		expect(view.tiles.find((t) => t.id === 'dog-walker')!.detail).toMatch(/walker \+ upkeep/i);
	});

	it('with the Lifestyle Index on, its card replaces every composite consumer', () => {
		const card = {
			computedAt: iso(NOW - DAY),
			lastSuccessfulScrapeAt: iso(NOW - 2 * DAY),
			households: []
		};
		const comp: CompositeData = { current: composite(NOW - DAY, 100.6), history: [] };
		const view = costView(
			input({
				lifestyleOn: true,
				lifestyle: card,
				composite: comp,
				outcomes: {
					[COST_DATASETS.lifestyle.id]: live(2 * DAY),
					[COST_DATASETS.composite.id]: failed
				}
			})
		);
		expect(view.lifestyle).toMatchObject({ kind: 'value', value: card, observedAt: NOW - 2 * DAY });
		// No tile reads the composite, and its failure is not this section's.
		for (const id of ['rivian-lease', 'dog-walker', 'ikon-pass', 'camp-prices'])
			expect(view.tiles.map((t) => t.id)).not.toContain(id);
		expect(view.status.failing.map((f) => f.name)).not.toContain('Composite index');
	});

	it('gives the phone’s Lifestyle-only Cost section a status of its own read', () => {
		const on = (fetch: DatasetFetch) =>
			costView(
				input({
					lifestyleOn: true,
					outcomes: { [COST_DATASETS.lifestyle.id]: fetch, gas: failed }
				})
			).lifestyleStatus!;
		expect(on(failed).state).not.toBe('ok');
		expect(on(failed).failing.map((f) => f.name)).toEqual(['Lifestyle index']);
		expect(on(live()).failing).toEqual([]);
		expect(costView(input()).lifestyleStatus).toBeNull();
	});

	it('with it off, nothing reads the Lifestyle Index', () => {
		const view = costView(input({ outcomes: { [COST_DATASETS.lifestyle.id]: failed } }));
		expect(view.lifestyle).toBeNull();
		expect(view.status.failing.map((f) => f.name)).not.toContain('Lifestyle index');
		expect(view.tiles.map((t) => t.id)).toContain('rivian-lease');
	});

	it('loads only the reads its mode shows', () => {
		expect(costDatasetIds(true)).toContain('lifestyle');
		expect(costDatasetIds(true)).not.toContain('composite');
		expect(costDatasetIds(false)).toContain('composite');
		expect(costDatasetIds(false)).not.toContain('lifestyle');
	});

	it('freshness policies are G0a’s own (pinned to SOURCE_INVENTORY)', () => {
		for (const { healthName, maxAgeDays } of Object.values(COST_DATASETS)) {
			if (healthName === null) continue; // stopped and retired from health (COSTDATA Q1)
			const policy = SOURCE_INVENTORY.find((p) => p.name === healthName);
			expect(policy, healthName).toBeDefined();
			expect(policy!.maxAgeDays).toBe(maxAgeDays);
		}
	});
});

describe('sparkStops', () => {
	const tile = (over: Partial<SubIndexTile>): SubIndexTile =>
		({
			id: 't',
			title: 'T',
			color: '#000',
			kind: 'value',
			value: '$1',
			detail: null,
			noHistory: false,
			noHistoryReason: null,
			muted: false,
			measured: measuredValue(1, 'x', NOW),
			sparkFormat: (n: number) => `$${n}`,
			sparkWhen: pacificDay,
			sparkNotes: [],
			spark: [
				{ at: NOW - DAY, value: 30, kind: 'observed', unit: '' },
				{ at: NOW, value: null, kind: 'observed', unit: '' }
			],
			...over
		}) as SubIndexTile;
	const said = (t: SubIndexTile) => sparkStops(t, () => 0).map((s) => wordsText(s.words));

	it('a dated reading, and a null slot', () => {
		expect(said(tile({}))).toEqual(['$30 · Oct 14', 'No reading · Oct 15']);
	});
	it('several readings in a Pacific day stop once, on the last', () => {
		const spark = [
			{ at: Date.parse('2026-10-14T16:00:00Z'), value: 5.8, kind: 'observed' as const, unit: '' },
			{ at: Date.parse('2026-10-14T22:00:00Z'), value: 5.9, kind: 'observed' as const, unit: '' },
			{ at: Date.parse('2026-10-15T16:00:00Z'), value: 6, kind: 'observed' as const, unit: '' }
		];
		expect(said(tile({ spark }))).toEqual(['$5.9 · Oct 14', '$6 · Oct 15']);
	});
	it('stale when the series is kept after a failure', () => {
		const measured = measuredValue(1, 'x', NOW, 'refresh failed');
		expect(said(tile({ measured }))[0]).toBe('$30 · Oct 14 · stale');
	});
	it('tuition: its date is a recompute, and a muted tile keeps its reference word', () => {
		const spark = [{ at: NOW, value: 412, kind: 'reference' as const, unit: '' }];
		expect(said(tile({ spark, sparkNotes: ['recomputed'] }))).toEqual([
			'$412 · Oct 15 · recomputed · reference'
		]);
	});
});

describe('gasStops', () => {
	const at = (s: string) => Date.parse(s);
	const p = (iso: string, avg: number, min: number | null = 5.29, max: number | null = 6.79) => ({
		atMs: at(iso),
		avg,
		min,
		max
	});
	it('stops on each Pacific day’s last reading, with its range', () => {
		const stops = gasStops(
			[
				p('2026-10-30T16:00:00Z', 5.8),
				p('2026-10-31T02:00:00Z', 5.89), // Oct 30, 7 PM Pacific: that day's last
				p('2026-10-31T16:00:00Z', 5.9)
			],
			() => 0
		);
		expect(stops.map((s) => wordsText(s.words))).toEqual([
			'$5.89 average · $5.29–$6.79 · Oct 30',
			'$5.90 average · $5.29–$6.79 · Oct 31'
		]);
	});
	it('either end of the range missing shows only the average', () => {
		const [s] = gasStops([p('2026-10-30T16:00:00Z', 5.8, null)], () => 0);
		expect(wordsText(s.words)).toBe('$5.80 average · Oct 30');
	});
	it('a silence over 3 days is said', () => {
		const stops = gasStops(
			[p('2026-10-20T16:00:00Z', 5.8), p('2026-10-30T16:00:00Z', 5.9)],
			() => 0
		);
		expect(wordsText(stops[1].words)).toBe('No readings Oct 20–Oct 30');
	});
	it('a silence is measured between all readings, not between each day’s last', () => {
		const stops = gasStops(
			[
				p('2026-10-20T23:00:00Z', 5.8),
				p('2026-10-23T22:00:00Z', 5.85),
				p('2026-10-24T02:00:00Z', 5.9)
			],
			() => 0
		);
		expect(stops.map((s) => wordsText(s.words)).join()).not.toContain('No readings');
	});
	it('stale', () => {
		const [s] = gasStops([p('2026-10-30T16:00:00Z', 5.8)], () => 0, true);
		expect(s.words.tail).toContain('stale');
	});
});

describe('compositeStops', () => {
	it('reads each week’s score, and says a missed run', () => {
		const stops = compositeStops(
			[
				{ atMs: NOW - 21 * DAY, score: 101.84 },
				{ atMs: NOW, score: 100.6 }
			],
			() => 0
		);
		expect(stops.map((s) => wordsText(s.words))).toEqual([
			'101.8 · Sep 24',
			'No readings Sep 24–Oct 15',
			'100.6 · Oct 15'
		]);
	});
});

describe('the grocery tile is SF-area grocery inflation (COSTDATA-2)', () => {
	const bls = parseBlsSeries(
		JSON.parse(readFileSync('tests/fixtures/costdata/bls-cuurs49bsaf11.json', 'utf8'))
	);
	const at = Date.parse('2026-11-12T15:00:00Z');
	const view = inflationView(
		{ current: { lastSuccessfulScrapeAt: iso(at), url: 'u', ...bls } },
		new Date(at)
	);
	const snap = {
		timestamp: '2026-11-01T17:11:00Z',
		totalCheapest: 174.93,
		totalExpensive: 209.05,
		itemsFound: 12,
		items: []
	};
	const basket = {
		current: snap,
		history: [snap, { ...snap, timestamp: '2026-10-11T17:11:00Z', totalCheapest: 174.45 }],
		frozen: { asOf: snap.timestamp, noLongerUpdated: true as const }
	};
	const tileOf = (over: Partial<CostInput>) =>
		costView(
			input({
				now: at,
				grocery: basket,
				groceryInflation: view,
				outcomes: { grocery: live(), groceryInflation: live(), ...over.outcomes },
				...over
			})
		).tiles.find((t) => t.id === 'grocery')!;

	it('leads with the 12-month change and its month, and says what October lacks', () => {
		const t = tileOf({});
		expect(t).toMatchObject({
			title: 'SF-area grocery inflation',
			kind: 'value',
			value: '+4.4%',
			valueNote: '12 months to Sep 2026'
		});
		expect(t.detail).toBe("Oct 2026 index 363.6 \u00b7 its 12-month change isn't published");
	});

	it('draws the index with the gap kept as a null, not a dollar basket trend', () => {
		const t = tileOf({});
		expect(t.spark).toHaveLength(46);
		expect(t.spark!.filter((r) => r.value === null)).toHaveLength(1);
		expect(t.sparkFormat(363.564)).toBe('363.6');
	});

	it('keeps the dated Marin basket as a grey reference line, never as a trend or a mover', () => {
		const t = tileOf({});
		expect(t.refLine).toBe('Marin basket $174.93, prices as of Nov 1, 2026, no longer updated');
		expect(JSON.stringify(t)).not.toMatch(/last week|Instacart|time not reported/);
	});

	it('names the series, its month and our read, with no freshness claim of its own', () => {
		const t = tileOf({});
		expect(t.muted).toBe(true);
		expect(t.untimed).toBe('Oct 2026 \u00b7 read Nov 12');
		expect(t.measured.source).toBe('BLS CPI food at home, SF area');
	});

	it('is unavailable with no figure when BLS cannot be read, but keeps the reference', () => {
		const t = tileOf({ groceryInflation: { status: 'unavailable', reason: 'x' } });
		expect(t).toMatchObject({ kind: 'unavailable', value: 'Unavailable', spark: null });
		expect(t.detail).toBe("BLS couldn't be read");
		expect(t.refLine).toContain('$174.93');
	});

	it('is unavailable, not carried forward, when the series is stale', () => {
		const t = tileOf({
			groceryInflation: {
				status: 'stale',
				reason: 'older',
				lastGood: { period: 'Oct 2026', checkedAt: iso(at) }
			}
		});
		expect(t.kind).toBe('unavailable');
		expect(t.value).toBe('Unavailable');
	});

	it('is watched by BLS Food at Home in health, aged 75 days', () => {
		expect(COST_DATASETS.groceryInflation).toMatchObject({
			healthName: 'BLS Food at Home',
			maxAgeDays: 75
		});
	});

	it('shows no figure when the cached view is ok but the refresh failed or the read aged out', () => {
		const failedKept: DatasetFetch = {
			kind: 'failed',
			error: 'HTTP 503',
			retained: true,
			observedAt: at - DAY
		};
		const afterFailure = tileOf({ outcomes: { groceryInflation: failedKept } as never });
		expect(afterFailure).toMatchObject({ kind: 'unavailable', value: 'Unavailable', spark: null });
		// A read whose own month is older than 75 days is out of date, even though its payload says ok.
		const aged = tileOf({
			outcomes: { groceryInflation: { kind: 'live', observedAt: at - 80 * DAY } } as never
		});
		expect(aged).toMatchObject({ kind: 'unavailable', value: 'Unavailable' });
	});
});

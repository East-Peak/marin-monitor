import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BlobApi } from '$lib/server/news/snapshot-store';
import type { LiveKey, LiveRead, LiveReads, PricedBudget } from '$lib/lifestyle/model';
import { priceSheet } from '$lib/lifestyle/price';
import { SHEETS } from '$lib/lifestyle/sheets';
import { LIFESTYLE_KEY, type LifestyleSnapshot } from './producer';
import {
	highlightsOn,
	lifestyleBlobApi,
	lifestyleCard,
	lifestyleHighlights,
	lifestyleOn,
	readLifestyle,
	readLifestyleDoc
} from './read';

const signal = new AbortController().signal;
const liveReads = Object.fromEntries(
	(
		[
			'gas.regular',
			'coffee.cappuccino',
			'grocery.collagen',
			'grocery.manuka',
			'grocery.kombucha',
			'grocery.oatMilk',
			'grocery.silverOak',
			'ikon.adult',
			'rivian.lease'
		] satisfies LiveKey[]
	).map((k): [string, LiveRead] => [
		k,
		{
			availability: 'ok',
			value: 10,
			observedAt: '2026-10-20T12:00:00.000Z',
			maxAgeDays: 10,
			source: 'test'
		}
	])
) as LiveReads;
const budget = (town: string) =>
	({
		town,
		taxYear: 2026,
		pricedAt: '2026-10-20T18:00:00.000Z',
		lines: (SHEETS.find((s) => s.id === town)?.lines ?? [])
			.filter((l) => l.signature)
			.map(({ id, section, label, required }) => ({
				id,
				section,
				label,
				required,
				monthly: 1,
				availability: 'ok',
				classes: [],
				inputs: []
			})),
		sections: { housing: 100 },
		burnMonthly: 100,
		complete: true,
		breakEven: {
			gross: 2000,
			need: 1200,
			taxes: {
				gross: 2000,
				agi: 2000,
				takeHome: 1200,
				federal: { tax: 500 },
				california: { tax: 200 },
				payroll: { socialSecurity: 50, medicare: 30, sdi: 20 }
			}
		},
		personaShare: { only: 0.1, any: 0.5 },
		marketTracker: {
			name: 'marketTracker',
			label: 'median',
			class: 'cited',
			value: 1,
			availability: 'ok',
			asOf: '2026-10-20',
			source: 'https://example.com/ (May 2026)'
		}
	}) as unknown as PricedBudget;
const snapshot = (budgets: PricedBudget[]): LifestyleSnapshot => ({
	schema: 1,
	runId: '2026-10-20',
	computedAt: '2026-10-20T18:00:00.000Z',
	lastSuccessfulScrapeAt: '2026-10-20T18:00:00.000Z',
	anchors: [],
	budgets
});
const api = (text: string | null | Error): BlobApi => ({
	read: vi.fn(async (key: string) => {
		if (text instanceof Error) throw text;
		return key === LIFESTYLE_KEY && text !== null ? { text, etag: '"e"' } : null;
	}),
	write: vi.fn(),
	remove: vi.fn()
});

describe('the Lifestyle Index flag', () => {
	it('is on only when LIFESTYLE_INDEX is exactly "on"', () => {
		expect(lifestyleOn({ LIFESTYLE_INDEX: 'on' })).toBe(true);
		for (const v of [undefined, '', 'off', '1', 'true', 'ON'])
			expect(lifestyleOn({ LIFESTYLE_INDEX: v })).toBe(false);
	});
});

describe('the highlights flag', () => {
	it('is on only when LIFESTYLE_HIGHLIGHTS is "on" under the Lifestyle Index flag', () => {
		expect(highlightsOn({ LIFESTYLE_INDEX: 'on', LIFESTYLE_HIGHLIGHTS: 'on' })).toBe(true);
		expect(highlightsOn({ LIFESTYLE_HIGHLIGHTS: 'on' })).toBe(false);
		expect(highlightsOn({ LIFESTYLE_INDEX: 'on' })).toBe(false);
		expect(highlightsOn({ LIFESTYLE_INDEX: 'on', LIFESTYLE_HIGHLIGHTS: 'yes' })).toBe(false);
	});
});

describe('where the index is read from', () => {
	it('reads a fixture file outside production only', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'life-'));
		const file = join(dir, 'f.json');
		await writeFile(file, JSON.stringify({ current: snapshot([budget('ross')]), history: [] }));
		const fromFile = lifestyleBlobApi({ LIFESTYLE_FIXTURE: file, VERCEL_ENV: 'preview' })!;
		expect((await readLifestyle(fromFile, signal))?.budgets).toHaveLength(1);

		const blob = vi.fn(() => api(null));
		lifestyleBlobApi(
			{ LIFESTYLE_FIXTURE: file, VERCEL_ENV: 'production', BLOB_READ_WRITE_TOKEN: 't' },
			blob
		);
		expect(blob).toHaveBeenCalledWith('t');
		expect(lifestyleBlobApi({ VERCEL_ENV: 'production' })).toBeNull();
	});

	it('returns the current snapshot, or null for a missing, failed or malformed read', async () => {
		const good = JSON.stringify({ current: snapshot([budget('ross')]), history: [] });
		expect((await readLifestyle(api(good), signal))?.runId).toBe('2026-10-20');
		expect(await readLifestyle(api(null), signal)).toBeNull();
		expect(await readLifestyle(api(new Error('down')), signal)).toBeNull();
		expect(await readLifestyle(api('{not json'), signal)).toBeNull();
		expect(await readLifestyle(api(JSON.stringify({ current: null })), signal)).toBeNull();
		expect(
			await readLifestyle(api(JSON.stringify({ current: { schema: 2, budgets: [] } })), signal)
		).toBeNull();
		// Codex LIFE2-1: every budget the card and page read must have its fields.
		const withBudgets = (budgets: unknown[]) =>
			api(JSON.stringify({ current: { ...snapshot([]), budgets } }));
		expect(await readLifestyle(withBudgets([null]), signal)).toBeNull();
		expect(await readLifestyle(withBudgets([{ town: 'ross' }]), signal)).toBeNull();
		// Codex LIFE2-2: and their nested fields.
		const line = (over: object) => ({
			id: 'x',
			label: 'x',
			section: 'housing',
			required: true,
			classes: ['persona'],
			availability: 'ok',
			monthly: 1,
			inputs: [],
			...over
		});
		const withLines = (lines: unknown[]) => withBudgets([{ ...budget('ross'), lines }]);
		expect(await readLifestyle(withLines([line({})]), signal)).not.toBeNull();
		expect(await readLifestyle(withLines([line({ inputs: [null] })]), signal)).toBeNull();
		expect(await readLifestyle(withLines([line({ classes: undefined })]), signal)).toBeNull();
		expect(await readLifestyle(withLines([line({ monthly: 'x' })]), signal)).toBeNull();
		// Codex LIFE2-4: classes, provenance, the market tracker and the equation's numbers.
		const input = (over: object) => ({
			name: 'n',
			label: 'l',
			class: 'cited',
			value: 1,
			availability: 'ok',
			asOf: null,
			source: null,
			...over
		});
		expect(await readLifestyle(withLines([line({ inputs: [input({})] })]), signal)).not.toBeNull();
		for (const bad of [{ class: 'bogus' }, { source: 42 }, { asOf: 7 }, { availability: 'fine' }])
			expect(await readLifestyle(withLines([line({ inputs: [input(bad)] })]), signal)).toBeNull();
		expect(await readLifestyle(withLines([line({ classes: ['bogus'] })]), signal)).toBeNull();
		// Codex LIFE2-5: the line's own fields, the tax year and the run's success time.
		for (const bad of [
			{ required: undefined },
			{ section: 'toString' },
			{ note: 3 },
			{ reason: 3 }
		])
			expect(await readLifestyle(withLines([line(bad)]), signal)).toBeNull();
		expect(
			await readLifestyle(withBudgets([{ ...budget('ross'), taxYear: undefined }]), signal)
		).toBeNull();
		const badTime = { ...snapshot([budget('ross')]), lastSuccessfulScrapeAt: { toString: null } };
		expect(await readLifestyle(api(JSON.stringify({ current: badTime })), signal)).toBeNull();
		const b = budget('ross') as unknown as Record<string, unknown>;
		expect(await readLifestyle(withBudgets([{ ...b, marketTracker: null }]), signal)).toBeNull();
		const taxes = (b.breakEven as { taxes: Record<string, unknown> }).taxes;
		for (const t of [
			{ ...taxes, federal: {} },
			{ ...taxes, payroll: { socialSecurity: 1 } },
			{ ...taxes, agi: undefined }
		])
			expect(
				await readLifestyle(
					withBudgets([{ ...b, breakEven: { ...(b.breakEven as object), taxes: t } }]),
					signal
				)
			).toBeNull();
		expect(
			await readLifestyle(withBudgets([{ ...budget('ross'), burnMonthly: 'x' }]), signal)
		).toBeNull();
		const noTimes = { ...snapshot([budget('ross')]), computedAt: undefined };
		expect(await readLifestyle(api(JSON.stringify({ current: noTimes })), signal)).toBeNull();
	});
});

describe('the history and anchors highlights read', () => {
	const entry = (over: object = {}) => ({
		runId: '2026-10-20',
		pricedAt: '2026-10-20T18:00:00.000Z',
		town: 'ross',
		sheetVersion: 's',
		methodVersion: 'm',
		taxYear: 2026,
		burnMonthly: 100,
		complete: true,
		breakEven: 2000,
		lines: [{ id: 'x', monthly: 100, inputs: { n: [5, null] } }],
		quantities: { x: '[]' },
		...over
	});
	const doc = (history: unknown, anchors: unknown = []) =>
		api(JSON.stringify({ current: { ...snapshot([budget('ross')]), anchors }, history }));

	it('returns the history beside the current snapshot', async () => {
		const d = await readLifestyleDoc(doc([entry()]), signal);
		expect(d?.current.runId).toBe('2026-10-20');
		expect(d?.history).toHaveLength(1);
	});

	it('an unreadable history is null, never an empty one, and the snapshot still reads', async () => {
		for (const bad of [
			null,
			[null],
			[entry({ town: 3 })],
			[entry({ lines: [{ id: 'x', monthly: 'x', inputs: {} }] })],
			[entry({ lines: [{ id: 'x', monthly: 1, inputs: { n: 5 } }] })]
		]) {
			const d = await readLifestyleDoc(doc(bad), signal);
			expect(d?.current.runId).toBe('2026-10-20');
			expect(d?.history).toBeNull();
		}
	});

	it('malformed anchors are none, so no comparison is made against them', async () => {
		const anchor = {
			id: 'teacherSalary',
			label: 'a teacher',
			units: 'gross individual',
			value: 1,
			availability: 'ok',
			inputs: []
		};
		expect((await readLifestyleDoc(doc([], [anchor]), signal))?.current.anchors).toHaveLength(1);
		for (const bad of [[{ ...anchor, value: 'x' }], [{ ...anchor, units: 'gross' }], 'x', [null]])
			expect((await readLifestyleDoc(doc([], bad), signal))?.current.anchors).toEqual([]);
	});

	it('renders each complete household’s highlights, by sheet id', async () => {
		const d = (await readLifestyleDoc(doc([]), signal))!;
		const h = lifestyleHighlights(d, SHEETS);
		// One household is no ranking, there are no anchors, and the run is not in history.
		expect(h.ross.map((x) => x.template)).toEqual(['moversNotComparable']);
		expect(h.ross[0].text).toBe('Movers: not enough comparable history yet.');
	});

	it('gives a budget missing a required signature line an incomplete household’s highlights', async () => {
		const b = priceSheet(SHEETS[2], liveReads, new Date('2026-10-20T18:00:00.000Z'));
		const whole = lifestyleHighlights({ current: snapshot([b]), history: [] }, SHEETS);
		expect(whole.ross.length).toBeGreaterThan(0);
		const old = { ...b, lines: b.lines.filter((l) => l.id !== 'ross.home.pi') };
		expect(lifestyleHighlights({ current: snapshot([old]), history: [] }, SHEETS)).toEqual({});
	});
});

describe('the card’s data', () => {
	it('summarises each budget that has a sheet, in sheet order, with the run’s times', () => {
		const card = lifestyleCard(
			snapshot([budget('ross'), budget('larkspur'), budget('atlantis')]),
			SHEETS
		);
		expect(card.computedAt).toBe('2026-10-20T18:00:00.000Z');
		expect(card.lastSuccessfulScrapeAt).toBe('2026-10-20T18:00:00.000Z');
		expect(card.households.map((h) => h.slug)).toEqual(['larkspur', 'ross']);
		expect(card.households[1]).toMatchObject({ breakEven: 2000, burnMonthly: 100 });
		expect(card.households[1]).not.toHaveProperty('highlights');
	});

	it('carries each household’s highlights only when given them', () => {
		const card = lifestyleCard(snapshot([budget('ross'), budget('larkspur')]), SHEETS, {
			ross: [
				{
					key: 'moversNotComparable',
					rule: 'mover',
					template: 'moversNotComparable',
					figure: null,
					text: 't',
					modelled: false,
					sources: []
				}
			]
		});
		expect(card.households.map((h) => h.highlights?.length)).toEqual([0, 1]);
	});
});

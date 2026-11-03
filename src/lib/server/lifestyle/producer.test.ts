import { describe, expect, it } from 'vitest';
import { SHEETS } from '$lib/lifestyle/sheets';
import { createMemoryBlobApi } from '$lib/server/news/memory-blob-api';
import { USDA_KEYS } from '$lib/lifestyle/model';
import { LIVE_BLOBS } from './live';
import { LIFESTYLE_KEY, runLifestyle, type LifestyleDoc } from './producer';

const NOW = new Date('2026-10-20T14:30:00.000Z');
const AT = '2026-10-20T10:00:00.000Z';

/** Fresh, successful reads for every live input. */
const BLOBS: Record<string, unknown> = {
	[LIVE_BLOBS.gas]: {
		current: {
			stations: [{ fuelPrices: [{ type: 'REGULAR_UNLEADED', price: 6.2, updateTime: AT }] }]
		}
	},
	[LIVE_BLOBS.cappuccino]: {
		current: { shops: [{ price: 5, priceSource: 'live', isStale: false, updateTime: AT }] }
	},
	[LIVE_BLOBS.ikon]: {
		current: { timestamp: AT, adultPrice: 1449, scraped: true, lastSuccessfulScrapeAt: AT }
	},
	[LIVE_BLOBS.usda]: {
		current: {
			lastSuccessfulScrapeAt: AT,
			period: 'September 2026',
			periodEnd: '2026-09-30T00:00:00.000Z',
			values: Object.fromEntries(USDA_KEYS.map((k) => [k, 400]))
		}
	}
};

const deps = (
	api = createMemoryBlobApi(),
	over: Partial<Parameters<typeof runLifestyle>[0]> = {}
) => ({
	api,
	readInput: async (key: string) => BLOBS[key] ?? null,
	sheets: SHEETS,
	now: NOW,
	runId: '2026-10-20',
	signal: new AbortController().signal,
	...over
});

/** The written document; every run here writes a current snapshot. */
const stored = (api: ReturnType<typeof createMemoryBlobApi>) => {
	const doc = JSON.parse(api.peek(LIFESTYLE_KEY)!) as LifestyleDoc;
	if (!doc.current) throw new Error('no current snapshot');
	return { ...doc, current: doc.current };
};

describe('runLifestyle', () => {
	it('prices every town, writes the snapshot and starts each town’s history', async () => {
		const api = createMemoryBlobApi();
		const result = await runLifestyle(deps(api));
		expect(result.outcome).toBe('written');
		const doc = stored(api);
		expect(doc.current.budgets.map((b) => [b.town, b.complete])).toEqual([
			['larkspur', true],
			['millvalley', true],
			['ross', true]
		]);
		expect(doc.current).toMatchObject({
			schema: 1,
			runId: '2026-10-20',
			computedAt: NOW.toISOString(),
			lastSuccessfulScrapeAt: NOW.toISOString()
		});
		expect(doc.current.anchors.map((a) => a.id)).toEqual([
			'medianHouseholdIncome',
			'minimumWageTakeHome',
			'teacherSalary'
		]);
		expect(doc.history.map((e) => [e.town, e.runId])).toEqual([
			['larkspur', '2026-10-20'],
			['millvalley', '2026-10-20'],
			['ross', '2026-10-20']
		]);
	});

	it('aborts, writing nothing, when the history cannot be read', async () => {
		const api = createMemoryBlobApi({ [LIFESTYLE_KEY]: '{"current":null,"history":[]}' });
		const before = api.peek(LIFESTYLE_KEY);
		api.before = (op) => {
			if (op === 'read') throw new Error('blob store down');
		};
		const result = await runLifestyle(deps(api));
		expect(result).toEqual({ outcome: 'aborted', reason: 'history read failed' });
		api.before = undefined;
		expect(api.peek(LIFESTYLE_KEY)).toBe(before);
	});

	it('aborts rather than overwrite a history it cannot parse', async () => {
		const api = createMemoryBlobApi({ [LIFESTYLE_KEY]: '{"current": {' });
		expect(await runLifestyle(deps(api))).toEqual({
			outcome: 'aborted',
			reason: 'history unreadable'
		});
		expect(api.peek(LIFESTYLE_KEY)).toBe('{"current": {');
		const wrongShape = createMemoryBlobApi({ [LIFESTYLE_KEY]: '{"current":null,"history":{}}' });
		expect((await runLifestyle(deps(wrongShape))).outcome).toBe('aborted');
	});

	it('de-duplicates a retried run by its run id', async () => {
		const api = createMemoryBlobApi();
		await runLifestyle(deps(api));
		await runLifestyle(deps(api));
		expect(stored(api).history).toHaveLength(3);
		await runLifestyle(deps(api, { runId: '2026-10-27', now: new Date('2026-10-27T14:30:00Z') }));
		expect(stored(api).history.map((e) => e.runId)).toEqual([
			'2026-10-27',
			'2026-10-27',
			'2026-10-27',
			'2026-10-20',
			'2026-10-20',
			'2026-10-20'
		]);
	});

	it('loses a race cleanly: a competing write is kept, not overwritten', async () => {
		const api = createMemoryBlobApi();
		let raced = false;
		api.before = async (op, key) => {
			if (op === 'write' && !raced) {
				raced = true;
				await api.write(
					key,
					'{"current":null,"history":[]}',
					{ createOnly: true },
					new AbortController().signal
				);
			}
		};
		expect(await runLifestyle(deps(api))).toEqual({ outcome: 'conflict' });
		expect(api.peek(LIFESTYLE_KEY)).toBe('{"current":null,"history":[]}');
	});

	it('does not count a run with a stale live input as a success', async () => {
		const api = createMemoryBlobApi();
		await runLifestyle(deps(api));
		// The same reads a fortnight on: priced, complete, but the gas and coffee reads are stale.
		const later = new Date('2026-11-03T14:30:00Z');
		await runLifestyle(deps(api, { runId: '2026-11-03', now: later }));
		const doc = stored(api);
		expect(doc.current.budgets.every((b) => b.complete)).toBe(true);
		expect(doc.current.lastSuccessfulScrapeAt).toBe(NOW.toISOString());
	});

	it('never reads the grocery or Rivian blobs: those lines are cited (COSTDATA Q1)', async () => {
		const api = createMemoryBlobApi();
		const asked: string[] = [];
		await runLifestyle(
			deps(api, {
				readInput: async (key) => {
					asked.push(key);
					return BLOBS[key] ?? null;
				}
			})
		);
		expect(asked).not.toContain('marin-grocery-basket.json');
		expect(asked).not.toContain('marin-rivian-lease.json');
		const mv = stored(api).current.budgets.find((b) => b.town === 'millvalley')!;
		const clean = mv.lines.find((l) => l.id === 'millvalley.food.clean')!;
		expect(clean.classes).not.toContain('live');
		expect(clean.inputs.filter((i) => i.class === 'cited')).toHaveLength(4);
	});

	it('gives up on an input read that outlives the run’s deadline', async () => {
		const api = createMemoryBlobApi();
		const deadline = new AbortController();
		const run = runLifestyle(
			deps(api, {
				signal: deadline.signal,
				readInput: (key, signal) =>
					key === LIVE_BLOBS.gas
						? new Promise((_, reject) =>
								signal.addEventListener('abort', () => reject(signal.reason))
							)
						: Promise.resolve(BLOBS[key] ?? null)
			})
		);
		setTimeout(() => deadline.abort(new Error('deadline')), 20);
		await expect(run).rejects.toThrow();
		expect(api.peek(LIFESTYLE_KEY)).toBeUndefined();
	});

	it('aborts rather than merge malformed history entries', async () => {
		const api = createMemoryBlobApi({ [LIFESTYLE_KEY]: '{"current":null,"history":[{}]}' });
		expect(await runLifestyle(deps(api))).toEqual({
			outcome: 'aborted',
			reason: 'history unreadable'
		});
		expect(api.peek(LIFESTYLE_KEY)).toBe('{"current":null,"history":[{}]}');
	});

	it('still writes an incomplete budget, but does not advance the last success', async () => {
		const api = createMemoryBlobApi();
		await runLifestyle(deps(api));
		const later = new Date('2026-10-27T14:30:00Z');
		const result = await runLifestyle(
			deps(api, {
				runId: '2026-10-27',
				now: later,
				readInput: async (key) => {
					if (key === LIVE_BLOBS.gas) throw new Error('timeout');
					return BLOBS[key] ?? null;
				}
			})
		);
		expect(result.outcome).toBe('written');
		const doc = stored(api);
		const larkspur = doc.current.budgets.find((b) => b.town === 'larkspur')!;
		expect(larkspur).toMatchObject({ complete: false, breakEven: null });
		expect(doc.current.computedAt).toBe(later.toISOString());
		expect(doc.current.lastSuccessfulScrapeAt).toBe(NOW.toISOString());
	});
});

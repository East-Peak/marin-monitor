// @vitest-environment node
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { priceAnchors } from '$lib/lifestyle/anchors';
import { historyEntry } from '$lib/lifestyle/history';
import type { LiveKey, LiveRead, LiveReads } from '$lib/lifestyle/model';
import { priceSheet } from '$lib/lifestyle/price';
import { SHEETS } from '$lib/lifestyle/sheets';
import type { LifestyleDoc } from './producer';
import { lifestyleBlobApi, readLifestyle } from './read';

const FIXTURE = 'tests/e2e/fixtures/lifestyle-index.json';
const NOW = new Date('2026-10-20T14:30:00.000Z');
const AT = '2026-10-20T10:00:00.000Z';
/** The week before: a like-for-like run, gas $5.90 (LIFE3's movers). */
const EARLIER = new Date('2026-10-13T14:30:00.000Z');
const EARLIER_AT = '2026-10-13T10:00:00.000Z';
const LIVE: Record<LiveKey, number> = {
	'gas.regular': 6.179,
	'coffee.cappuccino': 4.925,
	'grocery.collagen': 13.47,
	'grocery.manuka': 10.99,
	'grocery.kombucha': 4.79,
	'grocery.oatMilk': 3.99,
	'grocery.silverOak': 83.49,
	'ikon.adult': 1449,
	'rivian.lease': 1209
};
const reads = (over: Partial<Record<LiveKey, Partial<LiveRead>>>, at = AT) =>
	Object.fromEntries(
		Object.entries(LIVE).map(([k, value]): [string, LiveRead] => [
			k,
			{
				availability: 'ok',
				value,
				observedAt: at,
				maxAgeDays: 10,
				source: `e2e ${k}`,
				...over[k as LiveKey]
			}
		])
	) as LiveReads;

/**
 * The LIFE2 e2e seed: the real sheets priced by the real engine. Mill Valley's kombucha is a
 * reference price (stale); Ross's wine could not be read, so Ross is incomplete and the run
 * did not succeed. Its history has the week before, when gas was $5.90 (LIFE3's movers).
 */
function seed(): LifestyleDoc {
	const kombucha = { availability: 'stale', reason: 'reference price, not read this run' } as const;
	const price = (now: Date, at: string, over: Partial<Record<LiveKey, Partial<LiveRead>>>) =>
		SHEETS.map((s) =>
			priceSheet(
				s,
				reads(
					s.id === 'ross'
						? {
								...over,
								'grocery.silverOak': { availability: 'unavailable', value: null, reason: 'no read' }
							}
						: { ...over, 'grocery.kombucha': kombucha },
					at
				),
				now
			)
		);
	const budgets = price(NOW, AT, {});
	const before = price(EARLIER, EARLIER_AT, { 'gas.regular': { value: 5.9 } });
	return {
		current: {
			schema: 1,
			runId: '2026-10-20',
			computedAt: NOW.toISOString(),
			lastSuccessfulScrapeAt: null,
			anchors: priceAnchors(NOW),
			budgets
		},
		history: [
			...budgets.map((b) => historyEntry(b, '2026-10-20')),
			...before.map((b) => historyEntry(b, '2026-10-13'))
		]
	};
}

describe('the LIFE2 e2e seed', () => {
	it('is written from the engine, the reader accepts it, and it has a stale and an incomplete household', async () => {
		const text = `${JSON.stringify(seed())}\n`;
		let current: string | null = null;
		try {
			current = readFileSync(FIXTURE, 'utf8');
		} catch {
			// first run: no file yet
		}
		if (current !== text) writeFileSync(FIXTURE, text);

		const api = lifestyleBlobApi({ LIFESTYLE_FIXTURE: FIXTURE })!;
		const snapshot = (await readLifestyle(api, new AbortController().signal))!;
		const by = (id: string) => snapshot.budgets.find((b) => b.town === id)!;
		expect(by('larkspur').complete).toBe(true);
		expect(by('millvalley').lines.some((l) => l.availability === 'stale')).toBe(true);
		expect(by('ross')).toMatchObject({ complete: false, breakEven: null });
	});
});

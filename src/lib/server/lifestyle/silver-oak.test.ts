import { describe, expect, it } from 'vitest';
import { SHEETS } from '$lib/lifestyle/sheets';
import { priceInput, priceSheet } from '$lib/lifestyle/price';
import type { InputSpec, LiveRead, LiveReads } from '$lib/lifestyle/model';
import { readLive, type RawLiveBlobs } from './live';

const KEY = 'wine.silverOak.av2022';
const NOW = new Date('2026-11-16T15:00:00.000Z');
const evidence = (over: Record<string, unknown> = {}) => ({
	status: 'match',
	productId: 1,
	productTitle: '2022 Silver Oak Alexander Valley Cabernet Sauvignon 750ml',
	variantId: 11,
	variantTitle: 'Default Title',
	size: '750 ml',
	regularPrice: 89.99,
	price: 89.99,
	compareAtPrice: null,
	onSale: false,
	available: true,
	...over
});
const wine = (silverOak: unknown, at = '2026-11-16T12:00:00.000Z') => ({
	current: { timestamp: at, lastSuccessfulScrapeAt: at, silverOak }
});
const read = (blob: unknown) =>
	readLive({ wine: blob } as unknown as RawLiveBlobs, NOW)[KEY as keyof LiveReads];

describe('the Silver Oak live read: an exact match or nothing', () => {
	it('is the regular price of the matched listing, dated by our read of PlumpJack', () => {
		expect(read(wine(evidence()))).toMatchObject({
			availability: 'ok',
			value: 89.99,
			observedAt: '2026-11-16T12:00:00.000Z'
		});
	});

	it('prices the regular price, never the sale price', () => {
		const sale = evidence({ price: 79.99, compareAtPrice: 89.99, onSale: true });
		expect(read(wine(sale)).value).toBe(89.99);
		// A record whose regular price is not above its sale price is not the regular price.
		expect(
			read(wine(evidence({ price: 79.99, regularPrice: 79.99, compareAtPrice: 89.99 })))
				.availability
		).toBe('unavailable');
	});

	it('is unavailable with no match, an ambiguous match, a failed read or no blob', () => {
		for (const blob of [
			null,
			{},
			wine(undefined),
			wine({ status: 'none', reason: 'x' }),
			wine({ status: 'ambiguous', reason: 'x' })
		]) {
			const r = read(blob);
			expect(r).toMatchObject({ availability: 'unavailable', value: null });
		}
	});

	it('re-checks the evidence itself: a record that is not 2022, Alexander Valley and 750 ml is no price', () => {
		for (const bad of [
			evidence({ productTitle: '2021 Silver Oak Alexander Valley Cabernet Sauvignon 750ml' }),
			evidence({ productTitle: '2022 Silver Oak Napa Valley Cabernet Sauvignon 750ml' }),
			evidence({ size: '1.5 L' }),
			evidence({ available: false }),
			evidence({ regularPrice: 0 })
		])
			expect(read(wine(bad)).availability).toBe('unavailable');
	});

	it('is stale past the wine index’s max age, even when evidence is whole', () => {
		const r = read(wine(evidence(), '2026-11-01T12:00:00.000Z'));
		expect(r.availability).toBe('stale');
	});
});

describe('a cited figure that prefers a live read', () => {
	const spec: InputSpec = {
		class: 'cited',
		cite: 'silverOak.alexanderValley',
		prefer: KEY as never
	};
	const reads = (r: LiveRead | undefined) => ({ [KEY]: r }) as unknown as LiveReads;
	const ok: LiveRead = {
		availability: 'ok',
		value: 87.5,
		observedAt: '2026-11-16T12:00:00.000Z',
		maxAgeDays: 10,
		source: 'Silver Oak Alexander Valley 2022, 750 ml, regular price (plumpjackwines.com)'
	};

	it('uses the live read when it is ok', () => {
		expect(priceInput('price', spec, reads(ok), NOW)).toMatchObject({
			class: 'live',
			value: 87.5,
			availability: 'ok'
		});
	});

	it.each([
		['unavailable', { ...ok, availability: 'unavailable' as const, value: null }],
		['stale', { ...ok, availability: 'stale' as const }],
		['missing', undefined]
	])('stays cited when the read is %s', (_n, r) => {
		expect(priceInput('price', spec, reads(r as LiveRead), NOW)).toMatchObject({
			class: 'cited',
			value: 90
		});
	});
});

describe('the sheets', () => {
	it('Larkspur and Ross prefer the live Silver Oak read; Mill Valley has no such line', () => {
		for (const id of ['larkspur', 'ross']) {
			const line = SHEETS.find((s) => s.id === id)!.lines.find((l) => l.id === `${id}.food.wine`)!;
			expect(line.inputs.price).toMatchObject({ class: 'cited', prefer: KEY });
		}
	});

	it('priced with no live Silver Oak read, each household is what it was (the cited $90)', () => {
		for (const id of ['larkspur', 'ross']) {
			const sheet = SHEETS.find((s) => s.id === id)!;
			const base = Object.fromEntries(
				Object.entries(readLive({} as RawLiveBlobs, NOW)).filter(([k]) => k !== KEY)
			) as unknown as LiveReads;
			const cited = priceSheet(sheet, base, NOW);
			const wineLine = cited.lines.find((l) => l.id === `${id}.food.wine`)!;
			expect(wineLine.inputs.find((i) => i.name === 'price')).toMatchObject({
				class: 'cited',
				value: 90
			});
		}
	});
});

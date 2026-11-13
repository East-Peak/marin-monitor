// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
	IDENTIFYING_USER_AGENT,
	matchSilverOakAlexanderValley2022
} from '../../../scripts/shared/wine-exact.mjs';
import { fetchShopifyCollection } from '../../../scripts/shared/shopify-collection.mjs';

type Product = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/** PlumpJack's two Silver Oak Alexander Valley listings as its public JSON read on 2026-11-13. */
const real: Product[] = JSON.parse(
	readFileSync('tests/fixtures/costdata/plumpjack-silver-oak-2026-11-13.json', 'utf8')
).products;

/** A 2022 listing in PlumpJack's own shape (its JSON states no size, so this one says it in the title). */
const listing = (over: Product = {}, variant: Product = {}): Product => ({
	...real[0],
	id: 1,
	title: '2022 Silver Oak Alexander Valley Cabernet Sauvignon 750ml',
	handle: 'silver-oak-alexander-valley-cabernet-sauvignon-2022',
	variants: [
		{ ...real[0].variants[0], id: 11, price: '89.99', compare_at_price: null, ...variant }
	],
	...over
});

describe('Silver Oak Alexander Valley 2022, 750 ml, regular price: the exact match', () => {
	it('finds nothing in what PlumpJack lists today: a 2021 and a 2020, and no size anywhere', () => {
		const match = matchSilverOakAlexanderValley2022(real);
		expect(match.status).toBe('none');
		expect(match).not.toHaveProperty('regularPrice');
	});

	it('matches one 2022 listing that states 750 ml, and keeps its identity as evidence', () => {
		const match = matchSilverOakAlexanderValley2022([...real, listing()]);
		expect(match).toMatchObject({
			status: 'match',
			productId: 1,
			variantId: 11,
			productTitle: '2022 Silver Oak Alexander Valley Cabernet Sauvignon 750ml',
			size: '750 ml',
			regularPrice: 89.99,
			price: 89.99,
			compareAtPrice: null,
			onSale: false,
			available: true
		});
	});

	it('takes the regular price, not the sale price, when it is marked down', () => {
		const match = matchSilverOakAlexanderValley2022([
			listing({}, { price: '79.99', compare_at_price: '89.99' })
		]);
		expect(match).toMatchObject({
			status: 'match',
			regularPrice: 89.99,
			price: 79.99,
			compareAtPrice: 89.99,
			onSale: true
		});
	});

	it('reads the size from the variant when the title has none', () => {
		const match = matchSilverOakAlexanderValley2022([
			listing(
				{ title: '2022 Silver Oak Alexander Valley Cabernet Sauvignon' },
				{ title: '750ml', option1: '750ml' }
			)
		]);
		expect(match).toMatchObject({ status: 'match', size: '750 ml', variantTitle: '750ml' });
	});

	it.each([
		['no size stated', { title: '2022 Silver Oak Alexander Valley Cabernet Sauvignon' }, {}],
		['a magnum', { title: '2022 Silver Oak Alexander Valley Cabernet Sauvignon 1.5L' }, {}],
		['a half bottle', { title: '2022 Silver Oak Alexander Valley Cabernet 375ml' }, {}],
		[
			'the wrong vintage',
			{ title: '2021 Silver Oak Alexander Valley Cabernet Sauvignon 750ml' },
			{}
		],
		[
			'the Napa Valley bottling',
			{ title: '2022 Silver Oak Napa Valley Cabernet Sauvignon 750ml' },
			{}
		],
		['sold out', {}, { available: false }],
		['no price', {}, { price: '0.00' }]
	])('is not a match: %s', (_why, product, variant) => {
		expect(matchSilverOakAlexanderValley2022([listing(product, variant)]).status).toBe('none');
	});

	it('is ambiguous, with no price, when two listings match', () => {
		const match = matchSilverOakAlexanderValley2022([
			listing(),
			listing({ id: 2, handle: 'other' }, { id: 22, price: '84.99' })
		]);
		expect(match.status).toBe('ambiguous');
		expect(match).not.toHaveProperty('regularPrice');
	});
});

describe('how we ask PlumpJack', () => {
	it('identifies itself, as itself', () => {
		expect(IDENTIFYING_USER_AGENT).toMatch(
			/^MarinMonitor\/\d+\.\d+ \(\+https:\/\/marinmonitor\.com\)$/
		);
		const script = readFileSync('scripts/sync-wine-index.mjs', 'utf8');
		expect(script).not.toMatch(/Mozilla\/5\.0/);
		expect(script).not.toMatch(/Sec-Fetch/);
	});

	const page = (n: number) =>
		new Response(JSON.stringify({ products: Array.from({ length: n }, () => ({})) }));

	it('backs off on a 429, waiting what it is told, then reads on', async () => {
		const waits: number[] = [];
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				new Response('slow down', { status: 429, headers: { 'Retry-After': '3' } })
			)
			.mockResolvedValueOnce(page(1));
		const products = await fetchShopifyCollection('https://shop.example', 'all', {
			fetchImpl,
			pageLimit: 5,
			delayMs: 0,
			sleep: async (ms: number) => void waits.push(ms)
		});
		expect(products).toHaveLength(1);
		expect(waits).toEqual([3000]);
	});

	it('gives up after repeated 429s and throws, writing nothing', async () => {
		const fetchImpl = vi.fn().mockImplementation(async () => new Response('', { status: 429 }));
		await expect(
			fetchShopifyCollection('https://shop.example', 'all', {
				fetchImpl,
				delayMs: 0,
				sleep: async () => {}
			})
		).rejects.toThrow(/429/);
		expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(4);
	});
});

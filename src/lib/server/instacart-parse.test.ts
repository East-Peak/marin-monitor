import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	hasLiveBasketCoverage,
	parseCrossRetailerCards
} from '../../../scripts/shared/instacart-parse.mjs';

// Real rendered markup (2026-09-29): cards are data-item-card="true" with an
// <h3> name; the old item_list_item_items_{store}-{product} test ids are gone.
const FIXTURE = readFileSync(
	join(process.cwd(), 'src/lib/server/__fixtures__/instacart-cross-retailer.html'),
	'utf8'
);

describe('parseCrossRetailerCards', () => {
	const products = parseCrossRetailerCards(FIXTURE);

	it('reads every product card on the page', () => {
		expect(products).toHaveLength(40);
	});

	it('attributes each card to the retailer section it sits in', () => {
		expect([...new Set(products.map((p) => p.store))]).toEqual([
			'Sprouts Farmers Market',
			'Target',
			'Smart & Final',
			'Costco'
		]);
	});

	it('reads name + size, current price and sale state', () => {
		expect(products[0]).toEqual({
			name: 'Oatly The Original Oat-Milk 64 fl oz',
			price: 4.99,
			store: 'Sprouts Farmers Market',
			onSale: true
		});
		expect(products.filter((p) => p.onSale)).toHaveLength(6);
		for (const product of products) expect(product.price).toBeGreaterThan(0);
	});

	it('keeps star ratings and review counts out of names (they broke size matching)', () => {
		for (const product of products) expect(product.name).not.toMatch(/★|\(\d[\d.,K]*\)/);
		const rated = products.find((p) => p.store === 'Target' && p.name.startsWith('Oatly Oatmilk'));
		expect(rated?.name).toBe('Oatly Oatmilk 64 fl oz');
	});

	it('stops the last card at the retailer sign-posts block', () => {
		const tail =
			'<div data-testid="CrossRetailerSearchRetailerSignPosts"><span>Original Price: $9.99</span></div>';
		const withTail = parseCrossRetailerCards(FIXTURE + tail);
		expect(withTail.at(-1)?.onSale).toBe(products.at(-1)?.onSale);
	});

	it('still reads every card when the sign-posts block comes before the results', () => {
		// Seen live on the eggs search (2026-09-29): sign-posts precede the sections.
		const signPosts =
			'<div data-testid="CrossRetailerSearchRetailerSignPosts"><span>Shop Costco</span></div>';
		expect(parseCrossRetailerCards(signPosts + FIXTURE)).toHaveLength(40);
	});

	it('returns nothing for a page without cards (bot wall), rather than guessing', () => {
		expect(parseCrossRetailerCards('<html><body>Access denied $4.99</body></html>')).toEqual([]);
	});
});

describe('hasLiveBasketCoverage', () => {
	it('counts the basket live only when at least half its items were priced live', () => {
		expect(hasLiveBasketCoverage(6, 12)).toBe(true);
		expect(hasLiveBasketCoverage(11, 12)).toBe(true);
		expect(hasLiveBasketCoverage(1, 12)).toBe(false);
		expect(hasLiveBasketCoverage(0, 0)).toBe(false);
	});
});

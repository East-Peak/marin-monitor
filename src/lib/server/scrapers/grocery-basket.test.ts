// src/lib/server/scrapers/grocery-basket.test.ts

import { describe, it, expect } from 'vitest';
import { parseInstacartResults, buildSearchUrl, scorePriceMatch } from './grocery-basket';

describe('buildSearchUrl', () => {
	it('encodes the search term into an Instacart URL', () => {
		const url = buildSearchUrl('Vital Farms Eggs 12 ct');
		expect(url).toBe(
			'https://www.instacart.com/store/s?k=Vital%20Farms%20Eggs%2012%20ct'
		);
	});

	it('handles special characters', () => {
		const url = buildSearchUrl("Justin's Classic Almond Butter");
		expect(url).toContain("Justin's%20Classic%20Almond%20Butter");
	});
});

describe('parseInstacartResults', () => {
	const sampleHtml = `
		<div data-testid="product-card">
			<span data-testid="product-card-name">Vital Farms Pasture-Raised Large Eggs, 12 ct</span>
			<span data-testid="product-card-price">$8.99</span>
			<span data-testid="product-card-store">Sprouts</span>
		</div>
		<div data-testid="product-card">
			<span data-testid="product-card-name">Vital Farms Pasture-Raised Eggs, Large, 12 Count</span>
			<span data-testid="product-card-price">$12.99</span>
			<span data-testid="product-card-store">Safeway</span>
		</div>
		<div data-testid="product-card">
			<span data-testid="product-card-name">Organic Valley Large Brown Eggs</span>
			<span data-testid="product-card-price">$7.49</span>
			<span data-testid="product-card-store">Sprouts</span>
		</div>
	`;

	it('extracts product cards from HTML', () => {
		const results = parseInstacartResults(sampleHtml);
		expect(results.length).toBeGreaterThanOrEqual(2);
	});

	it('extracts price as a number', () => {
		const results = parseInstacartResults(sampleHtml);
		const first = results[0];
		expect(typeof first.price).toBe('number');
		expect(first.price).toBeGreaterThan(0);
	});

	it('extracts store name', () => {
		const results = parseInstacartResults(sampleHtml);
		expect(results[0].store.length).toBeGreaterThan(0);
	});

	it('returns empty array for empty HTML', () => {
		expect(parseInstacartResults('')).toEqual([]);
	});

	it('returns empty array for HTML with no product cards', () => {
		expect(parseInstacartResults('<div>No results</div>')).toEqual([]);
	});
});

describe('scorePriceMatch', () => {
	it('scores exact name match highest', () => {
		const score = scorePriceMatch(
			'Vital Farms Pasture-Raised Large Eggs, 12 ct',
			'Vital Farms Pasture-Raised Large Eggs, 12 ct'
		);
		expect(score).toBe(1.0);
	});

	it('scores partial match lower', () => {
		const score = scorePriceMatch(
			'Vital Farms Pasture-Raised Eggs, Large, 12 Count',
			'Vital Farms Pasture-Raised Large Eggs, 12 ct'
		);
		expect(score).toBeGreaterThan(0.5);
		expect(score).toBeLessThan(1.0);
	});

	it('scores unrelated product near zero', () => {
		const score = scorePriceMatch(
			'Organic Valley Large Brown Eggs',
			'Silver Oak Alexander Valley Cabernet Sauvignon'
		);
		expect(score).toBeLessThan(0.3);
	});
});

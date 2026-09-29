import { describe, expect, it, vi } from 'vitest';
import {
	fetchShopifyCollection,
	requireNonEmpty
} from '../../../scripts/shared/shopify-collection.mjs';

const page = (n: number, offset = 0) =>
	new Response(
		JSON.stringify({ products: Array.from({ length: n }, (_, i) => ({ id: offset + i })) })
	);

describe('fetchShopifyCollection', () => {
	it('walks pages until a short page and returns every product', async () => {
		const fetchImpl = vi.fn().mockResolvedValueOnce(page(2)).mockResolvedValueOnce(page(1, 2));
		const products = await fetchShopifyCollection('https://shop.example', 'red', {
			fetchImpl,
			pageLimit: 2,
			delayMs: 0
		});
		expect(products.map((p: { id: number }) => p.id)).toEqual([0, 1, 2]);
		expect(fetchImpl.mock.calls[1][0]).toBe(
			'https://shop.example/collections/red/products.json?limit=2&page=2'
		);
	});

	it('throws on an HTTP error rather than returning the pages it got so far', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(page(2))
			.mockResolvedValueOnce(new Response('blocked', { status: 403 }));
		await expect(
			fetchShopifyCollection('https://shop.example', 'red', { fetchImpl, pageLimit: 2, delayMs: 0 })
		).rejects.toThrow(/red page 2: HTTP 403/);
	});

	it('throws when the transport fails (dead proxy)', async () => {
		const fetchImpl = vi.fn().mockRejectedValueOnce(new Error('proxy unreachable'));
		await expect(
			fetchShopifyCollection('https://shop.example', 'red', { fetchImpl, delayMs: 0 })
		).rejects.toThrow(/proxy unreachable/);
	});

	it('throws on a body that is not a Shopify product page (bot wall HTML)', async () => {
		const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('<html>captcha</html>'));
		await expect(
			fetchShopifyCollection('https://shop.example', 'red', { fetchImpl, delayMs: 0 })
		).rejects.toThrow(/red page 1/);
	});
});

describe('requireNonEmpty', () => {
	it('passes through a populated list', () => {
		expect(requireNonEmpty('red', [1])).toEqual([1]);
	});
	it('throws on an empty list so an empty scrape never becomes a fresh observation', () => {
		expect(() => requireNonEmpty('red', [])).toThrow(/red: 0 items/);
	});
});

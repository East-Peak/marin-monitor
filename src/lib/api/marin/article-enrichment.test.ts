import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NewsItem } from '$lib/types';
import { enrichItemsForLocation } from './article-enrichment';

const ITEM: NewsItem = {
	id: 'marin-ij:1',
	title: 'Crash closes a San Rafael street',
	link: 'https://www.marinij.com/2026/09/28/crash/',
	timestamp: Date.parse('2026-09-28T18:00:00Z'),
	source: 'Marin Independent Journal',
	category: 'safety',
	verification: 'local_media',
	town: 'San Rafael'
};

afterEach(() => vi.restoreAllMocks());

describe('enrichItemsForLocation owner lifetime (Codex r2 #5 reproduction)', () => {
	it('abort → release the article response → no /api/geocode request and no coordinates', async () => {
		let releaseArticle!: () => void;
		const articleArrives = new Promise<void>((r) => (releaseArticle = r));
		const requested: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				requested.push(url);
				if (url.startsWith('/api/article')) {
					await articleArrives;
					return new Response(
						'<article><p>A crash at 1200 Fourth Street closed the road.</p></article>'
					);
				}
				return new Response(JSON.stringify({ lat: 37.97, lon: -122.53 }));
			})
		);
		const owner = new AbortController();
		const pending = enrichItemsForLocation([ITEM], { signal: owner.signal });
		await vi.waitFor(() => expect(requested.some((u) => u.startsWith('/api/article'))).toBe(true));
		owner.abort(); // the dashboard unmounts while the article is in flight
		releaseArticle();
		const out = await pending;
		expect(requested.filter((u) => u.startsWith('/api/geocode'))).toEqual([]);
		expect(out[0].lat).toBeUndefined();
	});
});

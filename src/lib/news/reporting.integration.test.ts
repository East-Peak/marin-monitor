import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true, dev: true, building: false, version: 'test' }));

import { news, allNewsItems } from '$lib/stores/news';
import { selectLatestReporting } from './reporting';

describe('Latest reporting over the real combined store view', () => {
	it('general copy first, then its county-feed copy → a county report is selected for a town', () => {
		const now = Date.parse('2026-09-28T20:00:00Z');
		const post = {
			title: 'Supervisors approve Marin County budget',
			link: 'https://www.marinij.com/2026/09/28/county-budget/',
			timestamp: now - 3_600_000,
			publishedAtStatus: 'valid' as const,
			publishedAtSource: 'rss:pubDate' as const,
			verification: 'local_media' as const
		};
		// 'local' is read before 'civic' in the combined view, so the general copy comes first.
		news.setItems('local', [
			{ ...post, id: 'marin-ij-politics:1', source: 'Marin IJ – Politics', category: 'local' }
		]);
		news.setItems('civic', [
			{
				...post,
				id: 'marin-ij-marin-county:1',
				source: 'Marin IJ – Marin County',
				category: 'civic',
				geoScope: 'county'
			}
		]);
		const combined = get(allNewsItems);
		expect(combined.filter((i) => i.link === post.link)).toHaveLength(1);
		const out = selectLatestReporting(combined, { town: 'mill-valley', now });
		expect(out.map((e) => e.scope)).toEqual(['county']);
	});
});

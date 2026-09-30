import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { NewsItem } from '$lib/types';

vi.mock('$app/environment', () => ({ browser: true, version: 'test' }));

let releaseFeeds!: (value: unknown) => void;
const feeds = () => new Promise((r) => (releaseFeeds = r));
vi.mock('$lib/api/marin', () => ({
	fetchAllFeeds: () => feeds(),
	fetchNpsAlerts: async () => [],
	fetchEarthquakes: async () => [],
	earthquakesToNewsItems: () => [],
	fetchTransitAlerts: async () => ({ items: [], errors: [] }),
	fetchSheriffCrimeBlotter: async () => [],
	fetchSupplementalPoliceLogs: async () => [],
	fetchSupplementalActivityFeeds: async () => [],
	fetchSeeClickFixIssues: async () => [],
	enrichItemsForRelevance: async (items: NewsItem[]) => items
}));

const { loadAllNews } = await import('$lib/api/marin/load-all');
const { news, localNews } = await import('./news');
const { refresh } = await import('./refresh');

const item = (id: string, source: string): NewsItem => ({
	id,
	title: `Point Reyes ${id}`,
	link: `https://www.ptreyeslight.com/${id}`,
	timestamp: Date.now(),
	source,
	category: 'local',
	verification: 'local_media'
});

afterEach(() => vi.unstubAllGlobals());

describe('dashboard → TV with a held dashboard response (Codex r3 #1 regression)', () => {
	it('a dashboard refresh released after the TV applied never overwrites TV news, history or starts enrichment', async () => {
		const fetchSpy = vi.fn(async () => new Response('', { status: 404 }));
		vi.stubGlobal('fetch', fetchSpy);
		// Dashboard: a refresh is in flight when the user opens /tv.
		refresh.startRefresh();
		const dashboard = loadAllNews(true).then((r) =>
			refresh.endRefresh(['dash-error', ...r.errors])
		);
		// TV mounts: claims, applies its snapshot, records its refresh.
		const claim = news.claim();
		try {
			news.setItems('local', [item('tv-1', 'Point Reyes Light')], {
				keep: () => true,
				owner: claim.token
			});
			refresh.startRefresh(claim.token);
			refresh.endRefresh([], claim.token);
			// The held dashboard response now lands.
			releaseFeeds([
				{ category: 'local', items: [item('dash-1', 'Point Reyes Light')], errors: [] }
			]);
			await dashboard;
			await new Promise((r) => setTimeout(r, 0));
			expect(get(localNews).items.map((i) => i.id)).toEqual(['tv-1']);
			expect(get(refresh).refreshHistory[0].errors).toEqual([]);
			expect(fetchSpy).not.toHaveBeenCalled(); // no enrichLocations → /api/article or /api/geocode
		} finally {
			claim.release();
		}
	});
});

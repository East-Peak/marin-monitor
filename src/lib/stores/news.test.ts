/**
 * Tests for news store
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import type { NewsItem } from '$lib/types';

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true
}));

describe('News Store', () => {
	beforeEach(async () => {
		vi.resetModules();
	});

	it('should start with empty categories', async () => {
		const { news } = await import('./news');

		const state = get(news);
		expect(state.categories.local.items).toEqual([]);
		expect(state.categories.civic.items).toEqual([]);
		expect(state.categories.safety.items).toEqual([]);
		expect(state.categories.outdoors.items).toEqual([]);
		expect(state.categories.housing.items).toEqual([]);
		expect(state.categories.satire.items).toEqual([]);
	});

	it('should set items for a category', async () => {
		const { news, localNews } = await import('./news');

		const items = [
			{
				id: '1',
				title: 'Mill Valley council approves new plan',
				source: 'Marin Independent Journal',
				link: 'https://marinij.com/1',
				timestamp: Date.now(),
				category: 'local' as const,
				verification: 'local_media' as const
			}
		];

		news.setItems('local', items);

		const local = get(localNews);
		expect(local.items.length).toBe(1);
		expect(local.items[0].title).toBe('Mill Valley council approves new plan');
		expect(local.loading).toBe(false);
		expect(local.lastUpdated).not.toBeNull();
	});

	it('should enrich items with alert detection', async () => {
		const { news } = await import('./news');

		const items = [
			{
				id: '1',
				title: 'Evacuation order issued for Tam Valley',
				source: 'Marin County',
				link: 'https://marincounty.org/1',
				timestamp: Date.now(),
				category: 'safety' as const,
				verification: 'official' as const
			},
			{
				id: '2',
				title: 'New hiking trail opens in Marin Headlands',
				source: 'Patch',
				link: 'https://patch.com/2',
				timestamp: Date.now(),
				category: 'outdoors' as const,
				verification: 'local_media' as const
			}
		];

		news.setItems('safety', [items[0]]);
		news.setItems('outdoors', [items[1]]);

		const state = get(news);
		expect(state.categories.safety.items[0].isAlert).toBe(true);
		expect(state.categories.safety.items[0].alertKeyword).toBe('evacuation');
		expect(state.categories.outdoors.items[0].isAlert).toBe(false);
	});

	it('should set loading state', async () => {
		const { news, localNews } = await import('./news');

		news.setLoading('local', true);
		expect(get(localNews).loading).toBe(true);

		news.setLoading('local', false);
		expect(get(localNews).loading).toBe(false);
	});

	it('should set error state', async () => {
		const { news, localNews, hasErrors } = await import('./news');

		news.setError('local', 'Failed to fetch');

		const local = get(localNews);
		expect(local.error).toBe('Failed to fetch');
		expect(local.loading).toBe(false);

		expect(get(hasErrors)).toBe(true);
	});

	it('should append items without duplicates', async () => {
		const { news, outdoorsNews } = await import('./news');

		const initial = [
			{
				id: '1',
				title: 'First trail report from Marin Headlands',
				source: 'Point Reyes Light',
				link: 'https://patch.com/1',
				timestamp: Date.now(),
				category: 'outdoors' as const,
				verification: 'local_media' as const
			}
		];

		const more = [
			{
				id: '1',
				title: 'First trail report from Marin Headlands',
				source: 'Point Reyes Light',
				link: 'https://patch.com/1',
				timestamp: Date.now(),
				category: 'outdoors' as const,
				verification: 'local_media' as const
			},
			{
				id: '2',
				title: 'Second trail report near Mt Tam',
				source: 'Point Reyes Light',
				link: 'https://patch.com/2',
				timestamp: Date.now(),
				category: 'outdoors' as const,
				verification: 'local_media' as const
			}
		];

		news.setItems('outdoors', initial);
		news.appendItems('outdoors', more);

		const outdoors = get(outdoorsNews);
		expect(outdoors.items.length).toBe(2);
	});

	it('should get all items across categories', async () => {
		const { news } = await import('./news');

		news.setItems('local', [
			{
				id: '1',
				title: 'San Rafael local news story',
				source: 'Marin Independent Journal',
				link: 'a',
				timestamp: Date.now(),
				category: 'local' as const,
				verification: 'local_media' as const
			}
		]);
		news.setItems('civic', [
			{
				id: '2',
				title: 'Marin County Board of Supervisors meeting recap in San Rafael',
				source: 'City of San Rafael',
				link: 'b',
				timestamp: Date.now(),
				category: 'civic' as const,
				verification: 'official' as const
			}
		]);

		const all = news.getAllItems();
		expect(all.length).toBe(2);
	});

	it('should derive alerts correctly', async () => {
		const { news, alerts } = await import('./news');

		news.setItems('safety', [
			{
				id: '1',
				title: 'Wildfire breaks out near Stinson Beach',
				source: 'Cal Fire',
				link: 'a',
				timestamp: Date.now(),
				category: 'safety' as const,
				verification: 'official' as const
			},
			{
				id: '2',
				title: 'Road construction update on Sir Francis Drake',
				source: 'Marin County',
				link: 'b',
				timestamp: Date.now(),
				category: 'safety' as const,
				verification: 'official' as const
			}
		]);

		const alertItems = get(alerts);
		expect(alertItems.length).toBe(1);
		expect(alertItems[0].title).toContain('Wildfire');
	});

	it('orders derived lists dated-newest-first with NaN (undated) items last', async () => {
		const { news, alerts, humanPoweredNews } = await import('./news');
		const wildfire = (id: string, timestamp: number) => ({
			id,
			title: `Wildfire ${id} near Stinson Beach`,
			source: 'Cal Fire',
			link: id,
			timestamp,
			category: 'safety' as const,
			verification: 'official' as const
		});
		news.setItems('safety', [
			wildfire('u1', NaN),
			wildfire('old', 1_000),
			wildfire('u2', NaN),
			wildfire('new', 2_000)
		]);
		expect(get(alerts).map((i) => i.id)).toEqual(['new', 'old', 'u1', 'u2']);

		const ride = (id: string, timestamp: number, category: 'cycling' | 'endurance') => ({
			id,
			title: `Mt Tam ride ${id} in Marin`,
			source: 'Marin Trail Stewards',
			link: id,
			timestamp,
			category,
			verification: 'community' as const
		});
		news.setItems('cycling', [ride('c-undated', NaN, 'cycling'), ride('c-old', 1_000, 'cycling')]);
		news.setItems('endurance', [ride('e-new', 3_000, 'endurance')]);
		expect(get(humanPoweredNews).items.map((i) => i.id)).toEqual(['e-new', 'c-old', 'c-undated']);
	});

	it('allNewsItems keeps the county scope of a later county-feed copy of the same story', async () => {
		const { news, allNewsItems } = await import('./news');
		const copy = (id: string, source: string, category: 'local' | 'safety', extra = {}) => ({
			id,
			title: 'Marin County burn ban issued for Novato hills',
			source,
			link: 'https://www.marinij.com/2026/09/28/burn-ban/',
			timestamp: Date.now(),
			category,
			verification: 'local_media' as const,
			...extra
		});
		news.setItems('local', [copy('marin-ij:p5', 'Marin IJ', 'local')]);
		news.setItems('safety', [
			copy('marin-ij-county:p5', 'Marin IJ – Marin County', 'safety', { geoScope: 'county' })
		]);
		const combined = get(allNewsItems) as (NewsItem & { geoScope?: 'county' })[];
		expect(combined).toHaveLength(1);
		expect(combined.filter((i) => i.geoScope === 'county')).toHaveLength(1); // county selector
	});

	it('should clear all categories', async () => {
		const { news } = await import('./news');

		news.setItems('local', [
			{
				id: '1',
				title: 'Test story',
				source: 'Patch',
				link: 'a',
				timestamp: Date.now(),
				category: 'local' as const,
				verification: 'local_media' as const
			}
		]);

		news.clearAll();

		const state = get(news);
		expect(state.categories.local.items).toEqual([]);
	});

	it('should not assign false town matches from substring collisions in mixed feeds', async () => {
		const { news, localNews } = await import('./news');

		news.setItems('local', [
			{
				id: 'kqed-1',
				title: 'How to Get Tickets to the 2028 Los Angeles Olympics',
				source: 'KQED News',
				link: 'https://kqed.org/example',
				timestamp: Date.now(),
				category: 'local' as const,
				verification: 'local_media' as const
			}
		]);

		const local = get(localNews);
		expect(local.items).toHaveLength(0);
	});

	it('should keep mixed-source stories with a real Marin town anchor', async () => {
		const { news, localNews } = await import('./news');

		news.setItems('local', [
			{
				id: 'kqed-2',
				title: 'Ross officials weigh changes to local traffic safety plan',
				source: 'KQED News',
				link: 'https://kqed.org/example-2',
				timestamp: Date.now(),
				category: 'local' as const,
				verification: 'local_media' as const
			}
		]);

		const local = get(localNews);
		expect(local.items).toHaveLength(1);
		expect(local.items[0].townSlug).toBe('ross');
	});
});

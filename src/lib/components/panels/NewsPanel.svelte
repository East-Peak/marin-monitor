<script lang="ts">
	import { Panel, NewsItem } from '$lib/components/common';
	import type { NewsCategory } from '$lib/types';
	import type { PanelId } from '$lib/config';
	import {
		localNews,
		civicNews,
		safetyNews,
		outdoorsNews,
		housingNews,
		cyclingNews,
		enduranceNews,
		humanPoweredNews,
		showsNews,
		prepNews,
		farmNews,
		satireNews
	} from '$lib/stores';

	interface Props {
		category: NewsCategory;
		panelId: PanelId;
		title: string;
		filterTown?: string | null;
	}

	let { category, panelId, title, filterTown = null }: Props = $props();

	// Get the appropriate derived store based on category
	const categoryStores = {
		local: localNews,
		civic: civicNews,
		safety: safetyNews,
		outdoors: outdoorsNews,
		housing: housingNews,
		cycling: cyclingNews,
		endurance: enduranceNews,
		shows: showsNews,
		prep: prepNews,
		farm: farmNews,
		satire: satireNews
	};

	function resolveCategoryStore() {
		if (panelId === 'cycling' && category === 'cycling') {
			return humanPoweredNews;
		}
		return categoryStores[category];
	}

	const categoryStore = $derived(resolveCategoryStore());
	const categoryVariant = $derived(category === 'local' ? 'local' : category);
	const allItems = $derived($categoryStore.items);
	const items = $derived(filterTown ? allItems.filter((i) => i.townSlug === filterTown) : allItems);
	const loading = $derived($categoryStore.loading);
	const error = $derived($categoryStore.error);
	const count = $derived(items.length);
</script>

<Panel id={panelId} {title} variant={categoryVariant} {count} {loading} {error}>
	{#if items.length === 0 && !loading && !error}
		<div class="empty-state">No news available</div>
	{:else}
		<div class="news-list">
			{#each items.slice(0, 15) as item (item.id)}
				<NewsItem {item} />
			{/each}
		</div>
	{/if}
</Panel>

<style>
	.news-list {
		display: flex;
		flex-direction: column;
	}

	.empty-state {
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.7rem;
		padding: 1rem;
	}
</style>

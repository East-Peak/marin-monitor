<script lang="ts">
	import { Panel, NewsItem, AdCard } from '$lib/components/common';
	import type { NewsCategory } from '$lib/types';
	import type { PanelId } from '$lib/config';
	import { pickAds } from '$lib/config/ads';
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
		satireNews,
		threeOneOneNews
	} from '$lib/stores';
	import { townFilter } from '$lib/stores/town-filter';

	interface Props {
		category: NewsCategory;
		panelId: PanelId;
		title: string;
	}

	let { category, panelId, title }: Props = $props();

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
		satire: satireNews,
		'311': threeOneOneNews
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
	const items = $derived(
		$townFilter ? allItems.filter((i) => i.townSlug === $townFilter) : allItems
	);
	const loading = $derived($categoryStore.loading);
	const error = $derived($categoryStore.error);
	const count = $derived(items.length);

	const wireAd = $derived(pickAds('wire', category, 1)[0]);
	const adPosition = $derived(wireAd?.position ?? 3);
</script>

<Panel id={panelId} {title} variant={categoryVariant} {count} {loading} {error}>
	{#if items.length === 0 && !loading && !error}
		<div class="empty-state">No news available</div>
	{:else}
		<div class="news-list">
			{#each items.slice(0, 15) as item, i (item.id + '-' + i)}
				{#if wireAd && i === adPosition}
					<AdCard ad={wireAd} />
				{/if}
				<NewsItem {item} />
			{/each}
			{#if wireAd && items.length <= adPosition}
				<AdCard ad={wireAd} />
			{/if}
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

<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchWineIndexDataWithStatus } from '$lib/api/marin/wine-index';
	import { wineIndexStore } from '$lib/stores/wine-index';
	import { buildChart, type ChartPaths } from '$lib/utils/chart';
	import type { WineIndexData, WineCategory, WineCategorySnapshot } from '$lib/types/wine';
	import { WINE_ACCENT, WINE_CATEGORY_ORDER } from '$lib/config/wine';

	const SPARKLINE_W = 80;
	const SPARKLINE_H = 24;
	const SPARKLINE_MARGINS = { top: 2, right: 2, bottom: 2, left: 2 };

	let data = $state<WineIndexData>({ current: null, history: [] });
	let dataLoading = $state(false);
	let dataError = $state<string | null>(null);
	let showAllStaffPicks = $state(false);
	let showAllAllocated = $state(false);

	const current = $derived(data.current);

	// Build sorted history per category for sparklines
	const categoryHistories = $derived.by(() => {
		const histories = new Map<WineCategory, { timestamp: string; medianPrice: number }[]>();

		for (const cat of WINE_CATEGORY_ORDER) {
			const catHistory: { timestamp: string; medianPrice: number }[] = [];

			for (const entry of data.history) {
				const catSnap = entry.categories.find((c) => c.category === cat);
				if (catSnap?.medianPrice !== null && catSnap?.medianPrice !== undefined) {
					catHistory.push({
						timestamp: entry.timestamp,
						medianPrice: catSnap.medianPrice
					});
				}
			}

			// Sort oldest first
			catHistory.sort(
				(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
			);

			histories.set(cat, catHistory);
		}

		return histories;
	});

	// Build sparkline paths reactively via shared utility
	const sparklinePaths = $derived.by(() => {
		const paths = new Map<WineCategory, ChartPaths>();
		for (const cat of WINE_CATEGORY_ORDER) {
			const history = categoryHistories.get(cat);
			if (!history || history.length < 2) continue;
			const result = buildChart({
				width: SPARKLINE_W,
				height: SPARKLINE_H,
				margins: SPARKLINE_MARGINS,
				accentColor: WINE_ACCENT,
				data: history.map((h) => ({ value: h.medianPrice }))
			});
			if (result) paths.set(cat, result);
		}
		return paths;
	});

	// Ordered categories from current snapshot
	const orderedCategories = $derived.by(() => {
		if (!current) return [];
		const result: WineCategorySnapshot[] = [];
		for (const cat of WINE_CATEGORY_ORDER) {
			const snap = current.categories.find((c) => c.category === cat);
			if (snap) result.push(snap);
		}
		return result;
	});

	const staffPicks = $derived(current?.staffPicks ?? []);
	const allocatedWines = $derived(current?.allocatedWines ?? []);
	const visibleStaffPicks = $derived(showAllStaffPicks ? staffPicks : staffPicks.slice(0, 8));
	const visibleAllocated = $derived(showAllAllocated ? allocatedWines : allocatedWines.slice(0, 6));

	function formatPrice(price: number): string {
		return `$${price.toFixed(0)}`;
	}

	function computeWeeklyChange(category: WineCategory): { value: number; label: string } | null {
		const history = categoryHistories.get(category);
		if (!history || history.length < 2) return null;

		const latest = history[history.length - 1].medianPrice;
		const previous = history[history.length - 2].medianPrice;
		const diff = Math.round((latest - previous) * 100) / 100;
		const pct = previous !== 0 ? Math.round((diff / previous) * 1000) / 10 : 0;

		return {
			value: diff,
			label: `${diff >= 0 ? '+' : ''}${pct.toFixed(1)}%`
		};
	}

	onMount(() => {
		void (async () => {
			dataLoading = true;
			dataError = null;
			try {
				const result = await fetchWineIndexDataWithStatus();
				if (result.ok) {
					data = result.data;
					wineIndexStore.set(result.data);
				} else {
					dataError = `Live data unavailable (${result.error})`;
				}
			} finally {
				dataLoading = false;
			}
		})();
	});
</script>

<Panel id="wine-index" title="Wine Index" loading={dataLoading} error={dataError}>
	{#if current}
		<!-- Category medians with sparklines -->
		<div class="categories-grid">
			{#each orderedCategories as cat}
				{@const change = computeWeeklyChange(cat.category)}
				<div class="category-card">
					<div class="category-header">
						<span class="category-label">{cat.label}</span>
						<span class="category-count">{cat.productCount} wines</span>
					</div>
					<div class="category-body">
						<div class="category-price-col">
							<span class="category-price">
								{cat.medianPrice !== null ? formatPrice(cat.medianPrice) : 'N/A'}
							</span>
							<span class="category-sublabel">median</span>
							{#if change}
								<span
									class="category-change"
									class:up={change.value > 0}
									class:down={change.value < 0}
								>
									{change.label}
								</span>
							{/if}
						</div>
						{#if sparklinePaths.has(cat.category)}
							{@const paths = sparklinePaths.get(cat.category)!}
							<svg
								class="sparkline-svg"
								width={SPARKLINE_W}
								height={SPARKLINE_H}
							>
								<g transform={`translate(${SPARKLINE_MARGINS.left},${SPARKLINE_MARGINS.top})`}>
									<path d={paths.linePath} fill="none" stroke={WINE_ACCENT} stroke-width="1.5" />
									<circle cx={paths.dots[paths.dots.length - 1].x} cy={paths.dots[paths.dots.length - 1].y} r="2" fill={WINE_ACCENT} />
								</g>
							</svg>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<!-- Staff Picks listing -->
		{#if staffPicks.length > 0}
			<div class="listing-section">
				<div class="section-label">Staff Picks</div>
				{#each visibleStaffPicks as pick}
					<div class="bottle-row">
						<div class="bottle-info">
							<span class="bottle-name">{pick.title}</span>
							<span class="bottle-vendor">{pick.vendor}</span>
						</div>
						<div class="bottle-price-col">
							{#if pick.compareAtPrice}
								<span class="bottle-compare">${pick.compareAtPrice.toFixed(0)}</span>
							{/if}
							<span class="bottle-price" class:on-sale={pick.compareAtPrice !== null}>
								${pick.price.toFixed(0)}
							</span>
							{#if !pick.available}
								<span class="bottle-badge sold-out">Sold Out</span>
							{/if}
						</div>
					</div>
				{/each}
				{#if staffPicks.length > 8}
					<button
						class="show-more-btn"
						onclick={() => (showAllStaffPicks = !showAllStaffPicks)}
					>
						{showAllStaffPicks ? 'Show fewer' : `Show all ${staffPicks.length}`}
					</button>
				{/if}
			</div>
		{/if}

		<!-- Allocated / Limited wines listing -->
		{#if allocatedWines.length > 0}
			<div class="listing-section">
				<div class="section-label">Allocated & Limited</div>
				{#each visibleAllocated as pick}
					<div class="bottle-row">
						<div class="bottle-info">
							<span class="bottle-name">{pick.title}</span>
							<span class="bottle-vendor">{pick.vendor}</span>
						</div>
						<div class="bottle-price-col">
							{#if pick.compareAtPrice}
								<span class="bottle-compare">${pick.compareAtPrice.toFixed(0)}</span>
							{/if}
							<span class="bottle-price" class:on-sale={pick.compareAtPrice !== null}>
								${pick.price.toFixed(0)}
							</span>
							{#if !pick.available}
								<span class="bottle-badge sold-out">Sold Out</span>
							{/if}
						</div>
					</div>
				{/each}
				{#if allocatedWines.length > 6}
					<button
						class="show-more-btn"
						onclick={() => (showAllAllocated = !showAllAllocated)}
					>
						{showAllAllocated ? 'Show fewer' : `Show all ${allocatedWines.length}`}
					</button>
				{/if}
			</div>
		{/if}

		<!-- Attribution -->
		<div class="attribution">
			Data via PlumpJack Wine & Spirits
		</div>
	{:else if dataLoading}
		<div class="empty-state">Loading wine index data...</div>
	{:else}
		<div class="empty-state">Wine index data will appear after the first sync cycle.</div>
	{/if}
</Panel>

<style>
	.categories-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.category-card {
		padding: 0.55rem 0.5rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.category-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.3rem;
	}

	.category-label {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.category-count {
		font-size: 0.45rem;
		color: var(--text-dim);
	}

	.category-body {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
	}

	.category-price-col {
		display: flex;
		flex-direction: column;
	}

	.category-price {
		font-size: 1.1rem;
		font-weight: 700;
		color: #7c3aed;
		letter-spacing: 0.01em;
	}

	.category-sublabel {
		font-size: 0.45rem;
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.category-change {
		font-size: 0.5rem;
		font-weight: 600;
		margin-top: 0.1rem;
	}

	.category-change.up {
		color: #f59e0b;
	}

	.category-change.down {
		color: #10b981;
	}

	.sparkline-svg {
		display: block;
		flex-shrink: 0;
	}

	.listing-section {
		margin-bottom: 0.65rem;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--border);
	}

	.section-label {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin-bottom: 0.3rem;
	}

	.bottle-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.3rem 0;
	}

	.bottle-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.bottle-name {
		font-size: 0.6rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.bottle-vendor {
		font-size: 0.48rem;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.bottle-price-col {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin-left: 0.5rem;
		white-space: nowrap;
	}

	.bottle-compare {
		font-size: 0.55rem;
		color: var(--text-dim);
		text-decoration: line-through;
	}

	.bottle-price {
		font-size: 0.7rem;
		font-weight: 700;
		color: var(--text);
	}

	.bottle-price.on-sale {
		color: #10b981;
	}

	.bottle-badge {
		font-size: 0.42rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.3rem;
		border-radius: 2px;
	}

	.bottle-badge.sold-out {
		color: #f59e0b;
		background: rgba(245, 158, 11, 0.12);
	}

	.show-more-btn {
		display: block;
		width: 100%;
		margin-top: 0.3rem;
		padding: 0.3rem;
		background: none;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 3px;
		color: var(--text-muted);
		font-size: 0.5rem;
		cursor: pointer;
		text-align: center;
		transition: color 0.15s, border-color 0.15s;
	}

	.show-more-btn:hover {
		color: var(--text);
		border-color: rgba(255, 255, 255, 0.12);
	}

	.attribution {
		text-align: center;
		font-size: 0.45rem;
		color: var(--text-dim);
		padding-top: 0.3rem;
	}

	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 0.7rem;
		padding: 1rem;
	}

	@media (max-width: 1100px) {
		.categories-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

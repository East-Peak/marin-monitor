<script lang="ts">
	import type { NewsItem } from '$lib/types';
	import { timeAgo } from '$lib/utils';

	interface Props {
		mode: 'town' | 'pin';
		townName?: string | null;
		townSlug?: string | null;
		items: NewsItem[];
		selectedItemId?: string | null;
		showRelatedByDefault?: boolean;
		pinnedCount?: number;
		townOnlyCount?: number;
		filterActive?: boolean;
		onClose?: () => void;
		onFocusTown?: () => void;
		onClearTown?: () => void;
	}

	let {
		mode,
		townName = null,
		townSlug = null,
		items = [],
		selectedItemId = null,
		showRelatedByDefault = true,
		pinnedCount = 0,
		townOnlyCount = 0,
		filterActive = false,
		onClose,
		onFocusTown,
		onClearTown
	}: Props = $props();

	let relatedExpanded = $state(false);

	const selectedItem = $derived(
		selectedItemId ? (items.find((item) => item.id === selectedItemId) ?? null) : null
	);
	const relatedItems = $derived(
		selectedItem ? items.filter((item) => item.id !== selectedItem.id) : items
	);

	$effect(() => {
		// Reset expansion when context changes (new click, mode change, etc).
		const contextKey = `${mode}:${selectedItemId ?? ''}:${showRelatedByDefault ? '1' : '0'}`;
		if (contextKey) {
			relatedExpanded = mode === 'town' || showRelatedByDefault;
		}
	});

	function categoryLabel(item: NewsItem): string {
		switch (item.category) {
			case 'local':
				return 'Local';
			case 'safety':
				return 'Crime & Safety';
			case 'civic':
				return 'Civic';
			case 'outdoors':
				return 'Outdoors';
			case 'cycling':
				return 'Cycling & Endurance';
			case 'endurance':
				return 'Cycling & Endurance';
			case 'shows':
				return 'Shows & Events';
			case 'prep':
				return 'Sports & Prep';
			case 'farm':
				return 'Farm & Market';
			case 'housing':
				return 'Housing';
			case 'satire':
				return 'Marin Lately';
			default:
				return item.category;
		}
	}

	function hasExactLocation(item: NewsItem): boolean {
		return typeof item.lat === 'number' && typeof item.lon === 'number';
	}
</script>

<aside class="inspector" aria-label="Map story inspector">
	<div class="inspector-header">
		<div class="title-group">
			<div class="kicker">{mode === 'pin' ? 'Pinned Story' : 'Town Inspector'}</div>
			<div class="title">{townName ?? 'Unassigned location'}</div>
			<div class="stats">
				<span>{items.length} {items.length === 1 ? 'story' : 'stories'}</span>
				<span>{pinnedCount} pinned</span>
				<span>{townOnlyCount} town-level</span>
			</div>
		</div>
		<button
			class="close-btn"
			type="button"
			onclick={() => onClose?.()}
			aria-label="Close inspector"
		>
			&times;
		</button>
	</div>

	{#if townSlug}
		<div class="inspector-actions">
			{#if filterActive}
				<button type="button" class="action-btn" onclick={() => onClearTown?.()}>
					Clear Town Filter
				</button>
			{:else}
				<button type="button" class="action-btn" onclick={() => onFocusTown?.()}>
					Focus Columns on {townName}
				</button>
			{/if}
		</div>
	{/if}

	{#if selectedItem}
		<div class="focus-story">
			<div class="story-meta">
				<span class="meta-source">{selectedItem.source}</span>
				<span class="meta-age">{timeAgo(selectedItem.timestamp)}</span>
				<span class="category-chip category-{selectedItem.category}"
					>{categoryLabel(selectedItem)}</span
				>
			</div>
			<a class="story-title" href={selectedItem.link} target="_blank" rel="noopener noreferrer">
				{selectedItem.title}
			</a>
			<div class="story-subline">
				<span class="loc-chip" class:exact={hasExactLocation(selectedItem)}>
					{hasExactLocation(selectedItem) ? 'PIN' : 'TOWN'}
				</span>
				<span>{selectedItem.town ?? townName ?? 'Marin County'}</span>
			</div>
		</div>
	{/if}

	<div class="story-list">
		{#if relatedItems.length === 0}
			<div class="empty">
				{#if selectedItem}
					No additional stories in this area.
				{:else}
					No stories available for this area.
				{/if}
			</div>
		{:else}
			{#if selectedItem}
				<div class="related-toggle-wrap">
					<button
						type="button"
						class="related-toggle"
						onclick={() => (relatedExpanded = !relatedExpanded)}
					>
						{#if relatedExpanded}
							Hide
						{:else}
							Show
						{/if}
						{relatedItems.length} more from {townName ?? 'this town'}
					</button>
				</div>
			{/if}
			{#if !selectedItem || relatedExpanded}
				{#if selectedItem}
					<div class="list-label">Also in {townName ?? 'this area'}</div>
				{/if}
				{#each relatedItems.slice(0, 14) as item (item.id)}
					<div class="story-row">
						<div class="story-meta">
							<span class="meta-source">{item.source}</span>
							<span class="meta-age">{timeAgo(item.timestamp)}</span>
							<span class="category-chip category-{item.category}">{categoryLabel(item)}</span>
						</div>
						<a class="story-title" href={item.link} target="_blank" rel="noopener noreferrer">
							{item.title}
						</a>
						<div class="story-subline">
							<span class="loc-chip" class:exact={hasExactLocation(item)}>
								{hasExactLocation(item) ? 'PIN' : 'TOWN'}
							</span>
							<span>{item.town ?? townName ?? 'Marin County'}</span>
						</div>
					</div>
				{/each}
				{#if relatedItems.length > 14}
					<div class="more">+{relatedItems.length - 14} more in the columns below</div>
				{/if}
			{/if}
		{/if}
	</div>
</aside>

<style>
	.inspector {
		position: absolute;
		right: 0.5rem;
		top: 3rem;
		width: min(390px, calc(100% - 1rem));
		max-height: calc(100% - 3.5rem);
		background: color-mix(in srgb, var(--surface) 93%, transparent);
		border: 1px solid var(--border-light);
		border-radius: 4px;
		backdrop-filter: blur(6px);
		box-shadow: 0 12px 28px rgba(0, 0, 0, 0.3);
		z-index: 30;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.inspector-header {
		padding: 0.6rem 0.7rem 0.5rem;
		border-bottom: 1px solid var(--border);
		display: flex;
		gap: 0.5rem;
		justify-content: space-between;
		align-items: flex-start;
	}

	.title-group {
		min-width: 0;
	}

	.kicker {
		font-size: 0.52rem;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--text-dim);
	}

	.title {
		margin-top: 0.1rem;
		font-size: 0.8rem;
		color: var(--text);
		font-weight: 700;
	}

	.stats {
		margin-top: 0.2rem;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		color: var(--text-muted);
		font-size: 0.55rem;
	}

	.close-btn {
		border: 1px solid var(--border);
		background: rgba(255, 255, 255, 0.04);
		color: var(--text-dim);
		width: 1.25rem;
		height: 1.25rem;
		font: inherit;
		line-height: 1;
		cursor: pointer;
		border-radius: 3px;
	}

	.close-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		color: var(--text);
	}

	.inspector-actions {
		padding: 0.35rem 0.7rem;
		border-bottom: 1px solid var(--border);
	}

	.action-btn {
		font: inherit;
		font-size: 0.58rem;
		padding: 0.22rem 0.42rem;
		border: 1px solid rgba(var(--accent-rgb), 0.45);
		background: rgba(var(--accent-rgb), 0.12);
		color: var(--accent);
		cursor: pointer;
		border-radius: 3px;
	}

	.action-btn:hover {
		background: rgba(var(--accent-rgb), 0.2);
	}

	.focus-story {
		padding: 0.55rem 0.7rem;
		border-bottom: 1px solid var(--border);
		background: rgba(255, 255, 255, 0.02);
	}

	.story-list {
		flex: 1;
		overflow: auto;
		padding: 0.2rem 0.7rem 0.6rem;
	}

	.list-label {
		font-size: 0.54rem;
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 0.25rem 0 0.35rem;
	}

	.related-toggle-wrap {
		padding: 0.25rem 0 0.1rem;
	}

	.related-toggle {
		font: inherit;
		font-size: 0.58rem;
		padding: 0.2rem 0.35rem;
		border-radius: 3px;
		border: 1px solid var(--border-light);
		background: rgba(255, 255, 255, 0.04);
		color: var(--text-dim);
		cursor: pointer;
	}

	.related-toggle:hover {
		color: var(--text);
		background: rgba(255, 255, 255, 0.1);
	}

	.story-row {
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--border);
	}

	.story-row:last-of-type {
		border-bottom: none;
	}

	.story-meta {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.meta-source,
	.meta-age {
		font-size: 0.53rem;
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.story-title {
		display: block;
		margin-top: 0.18rem;
		font-size: 0.66rem;
		line-height: 1.3;
		color: var(--text);
		text-decoration: none;
	}

	.story-title:hover {
		color: var(--accent);
	}

	.story-subline {
		margin-top: 0.2rem;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.54rem;
		color: var(--text-muted);
	}

	.loc-chip {
		display: inline-flex;
		padding: 0.05rem 0.25rem;
		font-size: 0.49rem;
		font-weight: 700;
		border-radius: 3px;
		color: var(--text-muted);
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.04);
	}

	.loc-chip.exact {
		color: #8cc8ff;
		border-color: rgba(140, 200, 255, 0.45);
		background: rgba(59, 130, 246, 0.16);
	}

	.category-chip {
		padding: 0.05rem 0.24rem;
		border-radius: 3px;
		font-size: 0.5rem;
		font-weight: 700;
	}

	.category-local {
		color: #c4b5fd;
		background: rgba(139, 92, 246, 0.2);
	}

	.category-safety {
		color: #fca5a5;
		background: rgba(239, 68, 68, 0.2);
	}

	.category-civic {
		color: #fcd34d;
		background: rgba(245, 158, 11, 0.2);
	}

	.category-outdoors {
		color: #6ee7b7;
		background: rgba(16, 185, 129, 0.2);
	}

	.category-cycling {
		color: #67e8f9;
		background: rgba(6, 182, 212, 0.2);
	}

	.category-endurance {
		color: #bef264;
		background: rgba(132, 204, 22, 0.2);
	}

	.category-shows {
		color: #fdba74;
		background: rgba(249, 115, 22, 0.2);
	}

	.category-prep {
		color: #a5b4fc;
		background: rgba(99, 102, 241, 0.2);
	}

	.category-fishing {
		color: #7dd3fc;
		background: rgba(14, 165, 233, 0.2);
	}

	.category-farm {
		color: #bef264;
		background: rgba(101, 163, 13, 0.22);
	}

	.category-housing {
		color: #5eead4;
		background: rgba(20, 184, 166, 0.2);
	}

	.category-satire {
		color: #f9a8d4;
		background: rgba(236, 72, 153, 0.2);
	}

	.empty,
	.more {
		font-size: 0.58rem;
		color: var(--text-muted);
		padding: 0.6rem 0.1rem;
	}

	@media (max-width: 960px) {
		.inspector {
			top: auto;
			bottom: 0.5rem;
			right: 0.5rem;
			left: 0.5rem;
			width: auto;
			max-height: min(360px, calc(100% - 1rem));
		}
	}
</style>

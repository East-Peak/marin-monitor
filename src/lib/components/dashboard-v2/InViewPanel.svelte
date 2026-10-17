<!-- The map's in-view list and its detail (MAPX2): what the reader can see on the map, newest
     first per layer; a row or a pin opens the item's DetailContent in place. -->
<script lang="ts">
	import type { InViewItem, InViewLayer } from '$lib/dashboard/map-in-view';
	import DetailPanel from './DetailPanel.svelte';
	import DetailContent from './DetailContent.svelte';

	let {
		items,
		selected,
		hovered,
		collapsed,
		emptyText,
		ontoggle,
		onselect,
		onhover,
		onback
	}: {
		items: readonly InViewItem[];
		selected: InViewItem | null;
		hovered: string | null;
		collapsed: boolean;
		/** What an empty view means; null while coverage can't vouch for "nothing here". */
		emptyText: string | null;
		ontoggle: () => void;
		onselect: (id: string) => void;
		onhover: (id: string | null) => void;
		onback: () => void;
	} = $props();

	const LAYER_NAME: Record<InViewLayer, string> = {
		news: 'Stories',
		'311': 'Fix It Marin (311)',
		quake: 'Earthquakes',
		traffic: 'Traffic',
		fire: 'Fire',
		gas: 'Gas',
		ev: 'EV chargers',
		coffee: 'Coffee'
	};
	const groups = $derived(
		[...new Set(items.map((i) => i.layer))].map((layer) => ({
			layer,
			rows: items.filter((i) => i.layer === layer)
		}))
	);
</script>

<DetailPanel label="In view" {collapsed} {ontoggle} onback={selected ? onback : undefined}>
	{#if selected}
		<DetailContent detail={selected.detail} titleId="v2-in-view-detail-title" />
		{#if selected.note}
			<p class="note" data-inspector-note data-text-role="meta">{selected.note}</p>
		{/if}
	{:else}
		<h3 class="head" data-text-role="label" data-in-view-count={items.length}>
			In view · {items.length}
		</h3>
		{#if items.length === 0}
			<p class="muted" data-text-role="body">{emptyText ?? 'Nothing listed in this view.'}</p>
		{/if}
		{#each groups as group (group.layer)}
			<h4 class="group" data-text-role="meta">{LAYER_NAME[group.layer]}</h4>
			<ul>
				{#each group.rows as row (row.id)}
					<li>
						<button
							type="button"
							class="row"
							data-in-view-row={row.id}
							data-hovered={hovered === row.id ? 'true' : undefined}
							onclick={() => onselect(row.id)}
							onmouseenter={() => onhover(row.id)}
							onmouseleave={() => onhover(null)}
							onfocus={() => onhover(row.id)}
							onblur={() => onhover(null)}
						>
							<span data-text-role="body">{row.title}</span>
							{#if row.detail.meta.length}
								<span class="muted" data-text-role="meta">{row.detail.meta.join(' · ')}</span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/each}
	{/if}
</DetailPanel>

<style>
	.head,
	.group {
		margin: 0;
	}
	.group {
		margin-top: 0.75rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	ul {
		margin: 0.25rem 0 0;
		padding: 0;
		list-style: none;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		width: 100%;
		padding: 0.5rem;
		border: 0;
		border-radius: 4px;
		background: transparent;
		color: var(--text-primary);
		text-align: left;
		cursor: pointer;
	}
	.row:hover,
	.row[data-hovered='true'] {
		background: var(--bg-hover, rgb(127 127 127 / 0.15));
	}
	.row:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.muted,
	.note {
		margin: 0;
		color: var(--text-muted);
	}
	.note {
		margin-top: 0.75rem;
	}
</style>

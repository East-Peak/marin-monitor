<!-- The map's in-view list and its detail (MAPX2): what the reader can see on the map, newest
     first per layer; a row or a pin opens the item's DetailContent in place. -->
<script lang="ts">
	import type { InViewItem, InViewLayer } from '$lib/dashboard/map-in-view';
	import DetailPanel from './DetailPanel.svelte';
	import DetailDialog from './DetailDialog.svelte';
	import DetailContent from './DetailContent.svelte';
	import BottomSheet from './BottomSheet.svelte';
	import { tick } from 'svelte';

	let {
		items,
		selected,
		hovered,
		collapsed,
		emptyText,
		gaps = [],
		notice = null,
		sheet = null,
		onsheet,
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
		/** Enabled layers this list can't vouch for (unavailable, loading or kept). */
		gaps?: readonly string[];
		/** Why a linked selection can't be shown (/map's `sel`, MAPX3). */
		notice?: string | null;
		/** /map below desktop (MAPX3): a bottom sheet, its detail a modal dialog over it. */
		sheet?: 'peek' | 'half' | null;
		onsheet?: (next: 'peek' | 'half') => void;
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
		coffee: 'Coffee',
		fitness: 'Fitness studios',
		airport: 'Airports',
		cams: 'Cameras'
	};
	// Keyboard users keep their place (Codex MAPX2 #6): a selection takes focus to its detail's
	// heading; Back returns it to the row it came from, else to the panel's list heading.
	let root = $state<HTMLElement | null>(null);
	let cameFrom: string | null = null;
	/** Set by a change made from the panel itself; a pin click never moves focus. */
	let pending: 'detail' | 'list' | null = null;
	$effect(() => {
		void selected;
		const to = pending;
		pending = null;
		if (!to || !root) return;
		void tick().then(() => {
			if (to === 'detail') root?.querySelector<HTMLElement>('#v2-in-view-detail-title')?.focus();
			else
				(
					[...(root?.querySelectorAll<HTMLElement>('[data-in-view-row]') ?? [])].find(
						(el) => el.dataset.inViewRow === cameFrom
					) ?? root?.querySelector<HTMLElement>('[data-in-view-count]')
				)?.focus();
		});
	});
	function choose(id: string) {
		cameFrom = id;
		pending = 'detail';
		onselect(id);
	}
	function back() {
		// Back's button or an Esc pressed while in the panel: focus goes back to the list.
		pending = root?.closest('aside')?.contains(document.activeElement) ? 'list' : null;
		onback();
	}

	const groups = $derived(
		[...new Set(items.map((i) => i.layer))].map((layer) => ({
			layer,
			rows: items.filter((i) => i.layer === layer)
		}))
	);
</script>

{#snippet listing()}
	{#if notice}
		<p class="notice" role="status" data-in-view-notice data-text-role="body">{notice}</p>
	{/if}
	<h3 class="head" tabindex="-1" data-text-role="label" data-in-view-count={items.length}>
		In view · {items.length}
	</h3>
	{#if gaps.length}
		<p class="muted" data-in-view-gaps data-text-role="meta">
			Not shown, or not current: {gaps.join(', ')}
		</p>
	{/if}
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
						onclick={() => choose(row.id)}
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
{/snippet}

{#snippet detail(item: InViewItem)}
	<DetailContent detail={item.detail} titleId="v2-in-view-detail-title" />
	{#if item.note}
		<p class="note" data-inspector-note data-text-role="meta">{item.note}</p>
	{/if}
{/snippet}

{#if sheet && onsheet}
	<div bind:this={root} class="root in-sheet">
		<BottomSheet label="In view" summary={`In view · ${items.length}`} {sheet} {onsheet}>
			{@render listing()}
		</BottomSheet>
		{#if selected}
			<DetailDialog labelledby="v2-in-view-detail-title" onclose={back} variant="sheet">
				{@render detail(selected)}
			</DetailDialog>
		{/if}
	</div>
{:else}
	<DetailPanel label="In view" {collapsed} {ontoggle} onback={selected ? back : undefined}>
		<div bind:this={root} class="root">
			{#if selected}
				{@render detail(selected)}
			{:else}
				{@render listing()}
			{/if}
		</div>
	</DetailPanel>
{/if}

<style>
	.head,
	.group {
		margin: 0;
	}
	/* The sheet's handle already says "In view · N". */
	.in-sheet .head {
		display: none;
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
	.notice {
		margin: 0 0 0.75rem;
		padding: 0.5rem;
		border-left: 3px solid var(--accent);
		background: var(--bg-hover, rgb(127 127 127 / 0.15));
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

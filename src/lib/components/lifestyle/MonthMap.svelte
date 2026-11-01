<!-- A household's month as a treemap of sections, each tile a link into the budget (COST2). -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		labelFit,
		mapCaption,
		planMap,
		sectionAnchor,
		TILE_INK,
		tileName,
		tileWords,
		type TextMetrics,
		type Tile,
		type TileId
	} from '$lib/lifestyle/treemap';
	import { SECTION_COLOR, type SectionShare } from '$lib/lifestyle/view';

	let {
		sections,
		slug,
		soFar,
		floor,
		onpick
	}: {
		sections: readonly SectionShare[];
		slug: string;
		soFar: boolean;
		/** The smallest a tile's width and height may be. */
		floor: number;
		/** A tile followed, by a plain click or Enter, with the fragment it lands on. */
		onpick?: (hash: string) => void;
	} = $props();

	/** Until it's measured (the server, the first paint) the percentages of a nominal box. */
	let box = $state({ w: 640, h: 300 });
	let metrics = $state<TextMetrics | null>(null);
	let hovered = $state<TileId | null>(null);
	let focused = $state<TileId | null>(null);
	let list = $state<HTMLElement>();

	const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
	const map = $derived(planMap(sections, box.w, box.h, floor));
	const caption = $derived(mapCaption(sections, soFar));
	/** Focus first: scrolling by keyboard slides a new tile under a parked pointer, and that hovers it. */
	const shown = $derived(map.tiles.find((t) => t.id === (focused ?? hovered)) ?? null);
	const words = (t: Tile) => tileWords(t, map.total);
	const fit = (t: Tile) =>
		metrics ? labelFit(tileName(t.id), usd(t.value), t.w, t.h, metrics) : null;
	const percent = (n: number, of: number) => `${(100 * n) / of}%`;

	function pick(e: MouseEvent, t: Tile) {
		if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		onpick?.(`#${sectionAnchor(t.anchor)}`);
	}

	function measureText(el: HTMLElement): TextMetrics | null {
		const ctx = document.createElement('canvas').getContext('2d');
		if (!ctx) return null;
		const style = getComputedStyle(el);
		ctx.font = `600 ${style.fontSize} ${style.fontFamily}`;
		return {
			measure: (text) => Math.ceil(ctx.measureText(text).width),
			lineHeight: parseFloat(style.lineHeight)
		};
	}

	onMount(() => {
		if (!list) return;
		const el = list;
		const observer = new ResizeObserver(() => {
			const { width: w, height: h } = el.getBoundingClientRect();
			if (w > 0 && h > 0) box = { w, h };
		});
		observer.observe(el);
		metrics = measureText(el);
		// The webfont's widths aren't the fallback's.
		void document.fonts?.ready.then(() => (metrics = measureText(el)));
		return () => observer.disconnect();
	});
</script>

<div class="month-map" data-month-map>
	{#if shown}
		<p
			class="readout"
			aria-hidden="true"
			data-map-readout
			style:left={shown.x + shown.w / 2 < box.w / 2 ? percent(shown.x, box.w) : undefined}
			style:right={shown.x + shown.w / 2 < box.w / 2
				? undefined
				: percent(box.w - shown.x - shown.w, box.w)}
		>
			<span data-text-role="label">{words(shown).name}</span>
			<span data-text-role="meta"> · {words(shown).head}</span>
			{#if words(shown).tail}<span class="tail" data-text-role="meta">{words(shown).tail}</span
				>{/if}
		</p>
	{/if}
	<ul
		bind:this={list}
		class="tiles"
		aria-label="The month by section"
		data-colour-exception="series"
		data-text-role="label"
	>
		{#each map.tiles as t (t.id)}
			{@const label = fit(t)}
			<li>
				<a
					class="tile"
					class:rest={t.id === 'rest'}
					class:one={label === 'one'}
					href="/cost/{slug}#{sectionAnchor(t.anchor)}"
					aria-label={words(t).full}
					data-tile={t.id}
					data-label={label}
					style:left={percent(t.x, box.w)}
					style:top={percent(t.y, box.h)}
					style:width={percent(t.w, box.w)}
					style:height={percent(t.h, box.h)}
					style:background={t.id === 'rest' ? undefined : SECTION_COLOR[t.id]}
					style:color={t.id === 'rest' ? undefined : TILE_INK(t.id)}
					onclick={(e) => pick(e, t)}
					onpointerenter={() => (hovered = t.id)}
					onpointerdown={() => (hovered = t.id)}
					onpointerleave={() => (hovered = null)}
					onfocus={() => (focused = t.id)}
					onblur={() => (focused = null)}
				>
					{#if label}
						<span class="name">{tileName(t.id)}</span>
						{#if label !== 'name'}<span class="amount num">{usd(t.value)}</span>{/if}
					{/if}
				</a>
			</li>
		{/each}
	</ul>
	{#if caption}
		<p class="caption" data-map-caption data-text-role="meta">{caption}</p>
	{/if}
</div>

<style>
	.month-map {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--v2-s1);
		min-width: 0;
		height: 100%;
	}
	.tiles {
		position: relative;
		flex: 1 1 0;
		min-height: 0;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.tiles li {
		display: contents;
	}
	.tile {
		position: absolute;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		padding: 2px 4px;
		overflow: hidden;
		border-radius: 3px;
		color: var(--text-secondary);
		font-weight: 600;
		text-decoration: none;
	}
	.tile.one {
		flex-direction: row;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
	}
	.tile.rest {
		background: repeating-linear-gradient(135deg, var(--surface-hover) 0 6px, transparent 6px 12px);
		box-shadow: inset 0 0 0 1px var(--border-light);
	}
	.tile:hover {
		box-shadow: inset 0 0 0 2px var(--text-primary);
	}
	.tile:focus-visible {
		z-index: 2;
		outline: 2px solid var(--text-primary);
		outline-offset: 1px;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	/* The chart readouts' look (CHARTREAD1): this is a list of links, so only the look. */
	.readout {
		position: absolute;
		z-index: 3;
		bottom: 100%;
		box-sizing: border-box;
		width: max-content;
		max-width: 100%;
		margin: 0 0 2px;
		padding: 1px 6px;
		border: 1px solid var(--border-light);
		border-radius: 4px;
		background: var(--bg);
		color: var(--text-muted);
		pointer-events: none;
	}
	.readout [data-text-role='label'] {
		color: var(--text-primary);
		font-weight: 600;
	}
	.tail {
		display: block;
	}
	.caption {
		flex: none;
		margin: 0;
		color: var(--text-muted);
	}
</style>

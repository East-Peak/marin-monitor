<!-- A household's month by section, as one stacked bar, with an optional key of the biggest. -->
<script lang="ts">
	import { SECTION_COLOR, type SectionShare } from '$lib/lifestyle/view';

	let {
		sections,
		key = 0,
		height = 14
	}: { sections: readonly SectionShare[]; key?: number; height?: number } = $props();

	/** A net-income section (a profitable business) is not spending: it has no width. */
	const spending = $derived(sections.filter((s) => s.monthly > 0));
	const pct = (share: number) => (share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);
</script>

<div class="stack" style:height="{height}px" aria-hidden="true" data-section-stack>
	{#each spending as s (s.section)}
		<i title={s.section} style:flex={s.monthly} style:background={SECTION_COLOR[s.section]}></i>
	{/each}
</div>
{#if key > 0}
	<div class="key">
		{#each spending.slice(0, key) as s (s.section)}
			<span data-text-role="meta"
				><i class="sw" style:background={SECTION_COLOR[s.section]}></i>{s.section}
				{pct(s.share)}</span
			>
		{/each}
	</div>
{/if}

<style>
	.stack {
		display: flex;
		gap: 1px;
		overflow: hidden;
		border-radius: 3px;
	}
	.stack i {
		display: block;
		min-width: 2px;
	}
	.key {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 12px;
		color: var(--text-muted);
	}
	.key span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
	.sw {
		display: inline-block;
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}
</style>

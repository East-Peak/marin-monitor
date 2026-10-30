<!-- One line of the card's receipt (COST1): a same-tab link to its line on /cost/<town>. -->
<script lang="ts">
	import { lineAnchor, type ReceiptLine } from '$lib/lifestyle/view';

	let { line, slug }: { line: ReceiptLine; slug: string } = $props();

	const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
	const stale = $derived(line.availability === 'stale');
</script>

<a class="row" href="/cost/{slug}#{lineAnchor(line.id)}" data-line={line.id} data-text-role="body">
	<span class="main">
		<span class="lab">{line.label}</span>
		{#if line.note || stale}
			<span class="meta" data-text-role="meta"
				>{line.note ?? ''}{#if line.note && stale}{' · '}{/if}{#if stale}<span
						class="flag"
						data-attention>stale</span
					>{/if}</span
			>
		{/if}
	</span>
	{#if line.monthly === null}
		<span class="flag" data-attention data-text-role="label">can’t be read</span>
	{:else}
		<span class="num" data-text-role="value">{usd(line.monthly)}</span>
	{/if}
	<span class="end" aria-hidden="true">›</span>
</a>

<style>
	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto 12px;
		column-gap: var(--v2-s2);
		align-items: baseline;
		min-height: 2.75rem;
		padding-block: var(--v2-s1);
		color: var(--text-primary);
		text-decoration: none;
		cursor: pointer;
	}
	.row:hover {
		background: var(--surface-hover, transparent);
	}
	.row:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.main {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.lab {
		overflow-wrap: anywhere;
	}
	.meta,
	.end {
		color: var(--text-muted);
	}
	.flag {
		color: var(--amber, #f59e0b);
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import type { GettingAroundView } from '$lib/dashboard/getting-around';
	import { gettingAroundParts } from '$lib/dashboard/getting-around-rows';
	import type { StatusRow as Row } from '$lib/dashboard/status-row';
	import DetailDialog from './DetailDialog.svelte';
	import StatusDetail from './StatusDetail.svelte';
	import StatusRow from './StatusRow.svelte';

	let { view, onopen }: { view: GettingAroundView; onopen: () => void } = $props();

	// Section.svelte mounts this body only while the section is open: mounting is opening (§7).
	onMount(() => onopen());

	const parts = $derived(gettingAroundParts(view));
	/** The detail row whose panel is open, by id: it closes if the row leaves the list. */
	let openId = $state<string | null>(null);
	const opened = $derived.by(() => {
		for (const p of parts)
			for (const { row: r } of p.items) if (r.id === openId && r.kind === 'detail') return r;
		return null;
	});
	let from = $state<HTMLElement | null>(null);
	const open = (r: Row, el: HTMLElement) => {
		openId = r.id;
		from = el;
	};
	// A row that left the list takes its panel with it, for good: it never reopens on its own.
	$effect(() => {
		if (openId !== null && opened === null) openId = null;
	});
</script>

<!-- Every line is a StatusRow (TEXT0 rev B); road problems first (design 2026-10-16). -->
<div class="ga" data-slot="getting-around">
	{#each parts as p (p.key)}
		<div class="ga-part" data-ga={p.key} data-part-state={p.state}>
			<h3 class="ga-title" data-text-role="label">{p.title}</h3>
			{#if p.scope}
				<p class="ga-scope" data-ga-scope data-text-role="meta">{p.scope}</p>
			{/if}
			{#if p.items.length}
				<ul class="ga-rows">
					{#each p.items as { from, state, row } (row.id)}
						<li
							data-line={from === 'line' ? row.id : undefined}
							data-state={from === 'line' ? state : undefined}
							data-ga-note={from === 'note' ? '' : undefined}
							data-row={from === 'item' ? row.id : undefined}
							data-tone={row.tone}
						>
							<StatusRow {row} onopen={open} />
						</li>
					{/each}
				</ul>
			{/if}
			<p class="ga-foot" data-ga-foot data-text-role="meta">
				{#if p.foot.provenance}<span data-ga-provenance>{p.foot.provenance}</span>{/if}<a
					class="hit-44"
					href={p.foot.link.href}
					target="_blank"
					rel="noopener noreferrer">{p.foot.link.label}</a
				>
			</p>
		</div>
	{/each}
</div>

{#if opened}
	<DetailDialog
		labelledby="v2-ga-detail-title"
		variant="auto"
		opener={from}
		onclose={() => (openId = null)}
	>
		<StatusDetail detail={opened.detail} titleId="v2-ga-detail-title" />
	</DetailDialog>
{/if}

<style>
	.ga {
		display: grid;
		gap: var(--v2-s4);
	}
	@media (min-width: 768px) {
		/* Desktop: the three parts side by side; each stays one readable column, label above body. */
		.ga {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: var(--v2-s5);
		}
	}
	.ga-part {
		display: grid;
		align-content: start;
		gap: var(--v2-s1);
		min-width: 0;
	}
	.ga-title,
	.ga-scope,
	.ga-rows,
	.ga-foot {
		margin: 0;
	}
	.ga-title {
		font-weight: 600;
		color: var(--text-dim, var(--text-muted));
	}
	.ga-scope {
		color: var(--text-muted);
	}
	.ga-rows {
		display: grid;
		gap: var(--v2-s1);
		padding: 0;
		list-style: none;
	}
	.ga-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0 var(--v2-s3);
		color: var(--text-muted);
	}
	a {
		color: var(--accent);
		text-decoration: none;
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { LINKS, type GettingAroundView, type Part } from '$lib/dashboard/getting-around';

	let { view, onopen }: { view: GettingAroundView; onopen: () => void } = $props();

	// Section.svelte mounts this body only while the section is open: mounting is opening (§7).
	onMount(() => onopen());

	const moreLabel = (p: Part, label: string) => `${p.more ? `${p.more} more · ` : ''}${label} ↗`;
</script>

{#snippet block(key: string, title: string, p: Part, href: string, label: string)}
	<div class="ga-part" data-ga={key} data-part-state={p.state}>
		<h3 class="ga-title" data-text-role="label">{title}</h3>
		{#if p.scope}
			<p class="ga-scope" data-ga-scope data-text-role="meta">{p.scope}</p>
		{/if}
		{#if p.lines.length}
			<ul class="ga-list">
				{#each p.lines as line (line.id)}
					<li class="ga-line" data-line={line.id} data-state={line.state} data-text-role="body">
						<span class="ga-label">{line.label}</span>{' · '}{#if line.url}<a
								class="ga-text"
								href={line.url}
								target="_blank"
								rel="noopener noreferrer">{line.text} ↗</a
							>{:else}<span class="ga-text">{line.text}</span>{/if}
					</li>
				{/each}
			</ul>
		{/if}
		{#if p.note}
			<p class="ga-note" data-ga-note data-text-role="body">{p.note}</p>
		{/if}
		{#if p.rows.length}
			<ul class="ga-list">
				{#each p.rows as row (row.id)}
					<li class="ga-row" data-row={row.id}>
						{#if row.url}
							<a href={row.url} target="_blank" rel="noopener noreferrer" data-text-role="body"
								>{row.title}</a
							>
						{:else}
							<span data-text-role="body">{row.title}</span>
						{/if}
						<span class="ga-meta" data-text-role="meta">{row.meta}</span>
					</li>
				{/each}
			</ul>
		{/if}
		<p class="ga-foot" data-ga-foot data-text-role="meta">
			{#if p.meta}{p.meta}{' · '}{/if}<a {href} target="_blank" rel="noopener noreferrer"
				>{moreLabel(p, label)}</a
			>
		</p>
	</div>
{/snippet}

<div class="ga" data-slot="getting-around">
	{@render block('airports', 'Airports', view.airports, LINKS.faa, 'FAA status')}
	{@render block(
		'roads',
		'Marin roads & the airport routes',
		view.roads,
		LINKS.traffic,
		'Live traffic map (511)'
	)}
	{@render block(
		'transit',
		'Transit service alerts',
		view.transit,
		LINKS.transit,
		'All transit alerts (511)'
	)}
</div>

<style>
	.ga {
		display: grid;
		gap: 1rem;
	}
	@media (min-width: 768px) {
		/* Desktop: the three parts side by side; each stays one readable column. */
		.ga {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	.ga-title,
	.ga-list,
	.ga-note,
	.ga-foot {
		margin: 0;
	}
	.ga-title,
	.ga-scope,
	.ga-meta,
	.ga-foot {
		color: var(--text-muted);
	}
	.ga-scope {
		margin: 0.125rem 0 0;
	}
	.ga-list {
		display: grid;
		gap: 0.375rem;
		margin-top: 0.375rem;
		padding: 0;
		list-style: none;
	}
	.ga-row {
		display: grid;
		overflow-wrap: anywhere;
	}
	.ga-label {
		font-weight: 600;
	}
	.ga-line[data-state='unavailable'] .ga-text,
	.ga-line[data-state='stale'] .ga-text,
	.ga-line[data-state='unknown'] .ga-text {
		color: var(--warning, var(--text-primary));
	}
	.ga-note {
		margin-top: 0.375rem;
	}
	.ga-foot {
		margin-top: 0.5rem;
	}
	a {
		color: var(--accent);
	}
</style>

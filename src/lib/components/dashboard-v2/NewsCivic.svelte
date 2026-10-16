<script lang="ts">
	import { onMount } from 'svelte';
	import type { Measured } from '$lib/dashboard/measured';
	import type { NewsCivicView } from '$lib/dashboard/news-civic';
	import CardSource from './CardSource.svelte';

	let { view, now, onopen }: { view: NewsCivicView; now: number; onopen: () => void } = $props();

	// Section.svelte mounts this body only while the section is open: mounting is opening (§7).
	onMount(() => onopen());

	/** A card with no value says why, never 0 or "none"; its source line gives the reason. */
	const notShown = (m: Measured<unknown>) =>
		m.kind === 'loading' ? 'Loading…' : m.kind === 'unknown' ? 'Unverified' : 'Unavailable';

	const wire = $derived(view.wire.kind === 'value' ? view.wire.value : null);
	const fixIt = $derived(view.fixIt.kind === 'value' ? view.fixIt.value : null);
	const dayMax = $derived(Math.max(1, ...(fixIt?.days.map((d) => d.count) ?? [])));
	const typeMax = $derived(fixIt?.types[0]?.count ?? 1);
	const police = $derived(view.police.kind === 'value' ? view.police.value : null);
	const parks = $derived(view.parks.kind === 'value' ? view.parks.value : null);
</script>

<div class="nc">
	<article class="card" data-card="wire">
		<div class="card-head">
			<h3 class="card-title" data-text-role="label">More from the wire</h3>
			<span class="meta" data-text-role="meta">after the five above</span>
		</div>
		{#if wire && wire.length}
			<ul class="wire">
				{#each wire as row (row.id)}
					<li data-wire-row>
						<a href={row.link} target="_blank" rel="noopener" data-text-role="body">{row.title}</a>
						<p class="meta" data-text-role="meta">{row.source} · {row.age} · {row.scope}</p>
					</li>
				{/each}
			</ul>
		{:else if wire}
			{#if view.wireEmpty}
				<p class="empty" data-text-role="body">{view.wireEmpty}</p>
			{/if}
		{:else}
			<p class="empty" data-text-role="body">{notShown(view.wire)}</p>
		{/if}
		<CardSource lines={[{ measured: view.wire }]} {now} />
	</article>

	<div class="pair">
		<article class="card" data-card="fixit">
			<div class="card-head">
				<h3 class="card-title" data-text-role="label">311 · Fix It Marin</h3>
				{#if fixIt}
					<span class="meta" data-text-role="meta">{fixIt.count} recent</span>
				{/if}
			</div>
			{#if fixIt && fixIt.count}
				<div
					class="days"
					role="img"
					aria-label="Reports per day, oldest first"
					data-text-role="meta"
				>
					{#each fixIt.days as d (d.key)}
						<div class="day" data-day={d.key} title="{d.label}: {d.count}">
							<span class="n">{d.count || ''}</span>
							<i class:none={!d.count} style="height:{d.count ? 6 + (d.count / dayMax) * 36 : 2}px"
							></i>
							<span>{d.label.replace(/^\w+ /, '')}</span>
						</div>
					{/each}
				</div>
				<div class="types">
					{#each fixIt.types as t (t.type)}
						<div class="hbar" data-text-role="label">
							<span>{t.type}</span>
							<span class="b" style="width:{(t.count / typeMax) * 100}%"></span>
							<span class="num">{t.count}</span>
						</div>
					{/each}
				</div>
				<ul class="rows">
					{#each fixIt.recent as r (r.id)}
						<li>
							<a href={r.link} target="_blank" rel="noopener" data-text-role="label">{r.type}</a>
							<span class="meta" data-text-role="meta">{r.place} · {r.age}</span>
						</li>
					{/each}
				</ul>
			{:else if fixIt}
				<p class="empty" data-text-role="body">No reports in the feed</p>
			{:else}
				<p class="empty" data-text-role="body">{notShown(view.fixIt)}</p>
			{/if}
			<CardSource lines={[{ measured: view.fixIt }]} {now} />
		</article>

		<article class="card" data-card="police-parks">
			<div class="card-head">
				<h3 class="card-title" data-text-role="label">Police & parks</h3>
			</div>
			<ul class="rows">
				{#each [...(police ?? []), ...(parks ?? [])] as r (r.id)}
					<li>
						<a href={r.link} target="_blank" rel="noopener" data-text-role="label">{r.title}</a>
						<span class="meta" data-text-role="meta">{r.meta}</span>
					</li>
				{/each}
			</ul>
			{#if !police}
				<p class="empty" data-text-role="body">Police logs: {notShown(view.police)}</p>
			{/if}
			{#if !parks}
				<p class="empty" data-text-role="body">Park alerts: {notShown(view.parks)}</p>
			{/if}
			<CardSource
				lines={[
					{ measured: view.police, untimed: 'update time not reported' },
					{ measured: view.parks, untimed: 'update time not reported' }
				]}
				{now}
			/>
		</article>
	</div>
</div>

<style>
	/* The approved mockup's News & Civic cards (desktop-v2-mockup.html). */
	.nc {
		display: flex;
		flex-direction: column;
		gap: var(--v2-gap, 14px);
	}
	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
		gap: var(--v2-gap, 14px);
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
		padding: 12px 14px;
		border: 1px solid var(--border-light);
		border-radius: 8px;
	}
	.card-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.25rem 0.75rem;
	}
	.card-title {
		margin: 0;
		color: var(--text-muted);
		font-weight: 400;
	}
	.meta,
	.empty {
		margin: 0;
		color: var(--text-muted);
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	a {
		color: inherit;
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
	.wire li,
	.rows li {
		display: flex;
		flex-direction: column;
		padding: 7px 0;
		border-bottom: 1px solid var(--border);
		break-inside: avoid;
	}
	.wire li:last-child,
	.rows li:last-child {
		border-bottom: 0;
	}
	@media (min-width: 1024px) {
		.wire {
			columns: 2;
			column-gap: 28px;
		}
	}
	.days {
		display: grid;
		grid-auto-columns: minmax(0, 1fr);
		grid-auto-flow: column;
		gap: 4px;
		align-items: end;
	}
	.day {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		color: var(--text-muted);
	}
	.day i {
		width: 100%;
		border-radius: 3px 3px 0 0;
		background: var(--yellow, #f59e0b);
		opacity: 0.85;
	}
	.day i.none {
		background: var(--surface-2, rgba(30, 41, 59, 0.45));
	}
	.day .n {
		min-height: 1.2em;
		color: var(--text-secondary);
	}
	.hbar {
		display: grid;
		grid-template-columns: minmax(0, 11rem) 1fr 2rem;
		gap: 8px;
		align-items: center;
		padding: 2px 0;
	}
	.hbar span:first-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hbar .b {
		height: 8px;
		border-radius: 2px;
		background: var(--yellow, #f59e0b);
	}
	.num {
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
</style>

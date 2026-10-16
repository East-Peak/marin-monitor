<script lang="ts">
	import { onMount } from 'svelte';
	import type { EventsView } from '$lib/dashboard/events';
	import type { Measured } from '$lib/dashboard/measured';
	import CardSource from './CardSource.svelte';

	let { view, now, onopen }: { view: EventsView; now: number; onopen: () => void } = $props();

	onMount(() => onopen());

	const notShown = (m: Measured<unknown>) =>
		m.kind === 'loading' ? 'Loading…' : m.kind === 'unknown' ? 'Unverified' : 'Unavailable';
	const UNTIMED = 'update time not reported';

	const shows = $derived(view.shows.kind === 'value' ? view.shows.value : null);
	const dayMax = $derived(Math.max(1, ...(shows?.days.map((d) => d.count) ?? [])));
	const races = $derived(view.races.kind === 'value' ? view.races.value : null);
</script>

<div class="ev">
	{#if !shows || !races}
		<!-- Shows and races are one read: until it has a value, one card says why. -->
		<article class="card" data-card="events-read">
			<div class="card-head">
				<h3 class="card-title" data-text-role="label">Shows and races</h3>
			</div>
			<p class="empty" data-text-role="body">{notShown(view.shows)}</p>
			<CardSource lines={[{ measured: view.shows, untimed: UNTIMED }]} {now} />
		</article>
	{:else}
		<article class="card" data-card="shows">
			<div class="card-head">
				<h3 class="card-title" data-text-role="label">Shows, next 10 days</h3>
				<span class="meta" data-text-role="meta">{shows.total} listed</span>
			</div>
			<!-- A day with no shows is a blank, flat bar: never a "0". -->
			<div class="days" role="img" aria-label="Shows per day, today first" data-text-role="meta">
				{#each shows.days as d (d.key)}
					<div class="day" data-show-day={d.key}>
						<span class="n">{d.shown}</span>
						<i class:none={!d.count} style="height:{d.count ? 8 + (d.count / dayMax) * 44 : 2}px"
						></i>
						<span>{d.weekday}<br />{d.date}</span>
					</div>
				{/each}
			</div>
			<ul class="list">
				{#each shows.next as s (s.id)}
					<li class="show">
						<span class="when" data-text-role="meta">{s.weekday}<br />{s.day}</span>
						<span>
							<a href={s.link} target="_blank" rel="noopener" data-text-role="label">{s.title}</a>
							<span class="meta" data-text-role="meta">{s.meta}</span>
						</span>
					</li>
				{/each}
			</ul>
			<CardSource lines={[{ measured: view.shows, untimed: UNTIMED }]} {now} />
		</article>

		<article class="card" data-card="races">
			<div class="card-head">
				<h3 class="card-title" data-text-role="label">Race calendar</h3>
				<span class="meta" data-text-role="meta">trail, road & bike</span>
			</div>
			<ul class="list">
				{#each races as r (r.id)}
					<li class="race">
						<span>
							<a href={r.link} target="_blank" rel="noopener" data-text-role="label">{r.title}</a>
							<span class="meta" data-text-role="meta"
								>{r.when}{r.registrationOpen ? ' · registration open' : ''}</span
							>
						</span>
						<span class="meta num" data-text-role="meta">in {r.inDays} d</span>
					</li>
				{/each}
			</ul>
			<CardSource lines={[{ measured: view.races, untimed: UNTIMED }]} {now} />
		</article>
	{/if}
</div>

<style>
	/* The approved mockup's Events & Sports cards (desktop-v2-mockup.html). */
	.ev {
		display: flex;
		flex-direction: column;
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
		display: block;
		color: inherit;
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
	.days {
		display: grid;
		grid-template-columns: repeat(10, minmax(0, 1fr));
		gap: 4px;
		align-items: end;
	}
	.day {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		color: var(--text-muted);
		text-align: center;
	}
	.day i {
		width: 100%;
		border-radius: 3px 3px 0 0;
		background: var(--purple, #a855f7);
		opacity: 0.85;
	}
	.day i.none {
		background: var(--surface-2, rgba(30, 41, 59, 0.45));
	}
	.day .n {
		min-height: 1.2em;
		color: var(--text-secondary);
	}
	.list li {
		padding: 6px 0;
		border-bottom: 1px solid var(--border);
	}
	.list li:last-child {
		border-bottom: 0;
	}
	.show {
		display: grid;
		grid-template-columns: 3.6rem 1fr;
		gap: 8px;
	}
	.when {
		color: var(--text-dim, var(--text-muted));
	}
	.race {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
</style>

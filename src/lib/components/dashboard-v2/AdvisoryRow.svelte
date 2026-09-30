<script lang="ts">
	import type { Readable } from 'svelte/store';
	import { formatAsOf } from '$lib/dashboard/pacific-time';
	import { advisoryRow, advisoryScope, type AdvisoryFeedState } from '$lib/weather/advisories';

	let { feed, now }: { feed: Readable<AdvisoryFeedState>; now: Readable<number> } = $props();
	// Re-evaluated on every clock tick: an expired advisory leaves without a refetch (§13.1).
	const row = $derived(advisoryRow($feed, $now));
	const unreadableText = (n: number) =>
		`${n} advisory message${n === 1 ? '' : 's'} couldn't be read · check weather.gov`;
</script>

{#if row.kind === 'alerts'}
	<section class="v2-advisories" data-slot="advisories" aria-label="Weather advisories">
		<ul>
			{#each row.advisories as a (a.id)}
				<li data-severity={a.severity}>
					<span class="v2-adv-event" data-text-role="label">{a.event}</span>
					<span data-text-role="meta"
						>{advisoryScope(a.zones)} · until {formatAsOf(a.endsAt ?? a.expiresAt, $now)}</span
					>
				</li>
			{/each}
		</ul>
		{#if row.notUpdatedSince !== null}
			<p role="status" data-text-role="meta">
				Advisories not updated since {formatAsOf(row.notUpdatedSince, $now)}
			</p>
		{/if}
		{#if row.unreadable}
			<p role="status" data-text-role="meta">{unreadableText(row.unreadable)}</p>
		{/if}
	</section>
{:else if row.kind === 'unavailable'}
	<section
		class="v2-advisories v2-advisories-down"
		data-slot="advisories"
		aria-label="Weather advisories"
	>
		<p role="status" data-text-role="meta">
			Advisories unavailable{row.lastSuccessAt !== null
				? ` · last checked ${formatAsOf(row.lastSuccessAt, $now)}`
				: ''}
		</p>
		{#if row.unreadable}
			<p role="status" data-text-role="meta">{unreadableText(row.unreadable)}</p>
		{/if}
	</section>
{/if}

<style>
	.v2-advisories {
		margin: 0.75rem 0 0;
		padding: var(--v2-card-padding);
		border: 1px solid var(--warning, var(--accent));
		border-radius: 8px;
	}
	.v2-advisories-down {
		border-color: var(--border-light);
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.75rem;
	}
	p {
		margin: 0.25rem 0 0;
	}
</style>

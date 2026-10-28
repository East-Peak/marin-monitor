<script lang="ts">
	import type { Readable } from 'svelte/store';
	import { formatAsOf } from '$lib/dashboard/pacific-time';
	import {
		advisoryRow,
		advisoryScope,
		type Advisory,
		type AdvisoryFeedState
	} from '$lib/weather/advisories';
	import DetailContent, { type Detail } from './DetailContent.svelte';
	import DetailDialog from './DetailDialog.svelte';

	let {
		feed,
		now,
		desktop = false
	}: { feed: Readable<AdvisoryFeedState>; now: Readable<number>; desktop?: boolean } = $props();
	// Re-evaluated on every clock tick: an expired advisory leaves without a refetch (§13.1).
	const row = $derived(advisoryRow($feed, $now));
	/** Desktop (MAPX1): the advisory whose NWS text is open, by id; it closes if the advisory ends. */
	let openId = $state<string | null>(null);
	/** The chip that opened it, which gets focus back (WebKit doesn't focus a tapped button). */
	let chip = $state<HTMLElement | null>(null);
	const opened = $derived(
		row.kind === 'alerts' ? (row.advisories.find((a) => a.id === openId) ?? null) : null
	);
	const NWS_OFFICE = {
		label: 'National Weather Service, San Francisco Bay Area',
		href: 'https://www.weather.gov/mtr/'
	};
	function detailOf(a: Advisory): Detail {
		return {
			title: a.event,
			meta: [advisoryScope(a.zones), `until ${formatAsOf(a.endsAt ?? a.expiresAt, $now)}`],
			paragraphs: [a.description, a.instruction].filter((p): p is string => p !== null),
			empty: 'NWS gave no text for this advisory.',
			source: NWS_OFFICE
		};
	}
	const unreadableText = (n: number) =>
		`${n} advisory message${n === 1 ? '' : 's'} couldn't be read · check weather.gov`;
</script>

{#if row.kind === 'alerts' && desktop}
	<!-- Desktop (MAPX1): compact chips sized to their text, never a full-width box. -->
	<section class="v2-adv-chips" data-slot="advisories" aria-label="Weather advisories">
		<ul>
			{#each row.advisories as a (a.id)}
				<li>
					<button
						type="button"
						class="chip"
						data-advisory={a.id}
						data-severity={a.severity}
						data-text-role="label"
						aria-haspopup="dialog"
						onclick={(e) => {
							openId = a.id;
							chip = e.currentTarget;
						}}
						>⚠ {a.event} · {advisoryScope(a.zones)} · until {formatAsOf(
							a.endsAt ?? a.expiresAt,
							$now
						)}</button
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
	{#if opened}
		<DetailDialog labelledby="v2-advisory-title" opener={chip} onclose={() => (openId = null)}>
			<DetailContent detail={detailOf(opened)} titleId="v2-advisory-title" />
		</DetailDialog>
	{/if}
{:else if row.kind === 'alerts'}
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
		class:v2-adv-line={desktop}
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
	.v2-adv-chips {
		margin: 0.75rem 0 0;
	}
	.v2-adv-chips ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.chip {
		min-height: 2rem;
		padding: 0.25rem 0.75rem;
		border: 1px solid var(--warning, var(--accent));
		border-radius: 999px;
		background: transparent;
		color: var(--text-primary);
		text-align: left;
		cursor: pointer;
	}
	.chip:hover {
		background: var(--surface, rgb(255 255 255 / 0.04));
	}
	.chip:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.v2-advisories-down {
		border-color: var(--border-light);
	}
	.v2-adv-line {
		padding: 0;
		border: 0;
		color: var(--text-muted);
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

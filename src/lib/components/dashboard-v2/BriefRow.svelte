<script lang="ts">
	import type { Readable } from 'svelte/store';
	import type { BriefCard, BriefState } from '$lib/dashboard/brief-store';
	import type { CardItem } from '$lib/dashboard/getting-around';
	import { formatAsOf } from '$lib/dashboard/pacific-time';
	import { effectiveState, type SourceEntryState } from '$lib/dashboard/source-status';
	import { nextTide, restOfTodayRainChance } from '$lib/weather/brief';

	let {
		brief,
		now,
		around = [],
		onjump
	}: {
		brief: Readable<BriefState>;
		now: Readable<number>;
		/** Getting Around's status: the desktop card's items, of the parts the phone has read (HARMONIZE1). */
		around?: CardItem[];
		onjump?: (hash: string) => void;
	} = $props();

	/** Clock-driven freshness for a card (G1a): nothing stays "ok" past its limit. */
	function stateOf(card: BriefCard<unknown>, at: number): SourceEntryState {
		return effectiveState(
			{
				id: '',
				name: '',
				state: card.state,
				observedAt: card.observedAt,
				maxAgeMs: card.maxAgeMs,
				detail: card.detail
			},
			at
		);
	}

	const observed = $derived($brief.observed);
	const forecast = $derived($brief.forecast);
	const tides = $derived($brief.tides);
	const observedState = $derived(stateOf(observed, $now));
	const forecastState = $derived(stateOf(forecast, $now));
	const rain = $derived(
		forecast.value ? restOfTodayRainChance(forecast.value.periods, $now) : null
	);
	const tide = $derived(tides.value ? nextTide(tides.value, $now) : null);
	/** One clipped line: what it can't vouch for leads, so the clip only ever hides plain items. */
	const QUALIFIED: readonly SourceEntryState[] = ['stale', 'unknown', 'unavailable'];
	const aroundLine = $derived([
		...around.filter((i) => QUALIFIED.includes(i.state)),
		...around.filter((i) => !QUALIFIED.includes(i.state))
	]);
	const tideState = $derived<SourceEntryState>(
		tides.value !== null && tide === null ? 'unavailable' : stateOf(tides, $now)
	);
</script>

<section class="v2-brief" data-slot="brief" aria-label="Morning brief">
	<article class="v2-card" data-card="weather" data-state={observedState}>
		<h3 class="v2-card-title" data-text-role="label">Weather</h3>
		{#if observed.value}
			<p class="v2-card-value" data-text-role="value">
				{observed.value.tempF === null ? 'Temperature unknown' : `${observed.value.tempF}°F`}
			</p>
			<p data-text-role="meta">
				Observed at {observed.value.stationName} · {formatAsOf(
					observed.value.observedAt,
					$now
				)}{observedState === 'stale' ? ' · out of date' : ''}
			</p>
		{:else if observedState === 'loading'}
			<!-- The loaded card's lines, held (MOBILE1): the value's line, then its words. -->
			<p class="v2-card-value v2-skeleton" data-text-role="value" aria-hidden="true">&nbsp;</p>
			<p class="v2-skeleton" data-text-role="meta">Loading observation…</p>
		{:else}
			<p data-text-role="meta">Observation unavailable</p>
		{/if}

		<div class="v2-card-part" data-card="rain" data-state={forecastState}>
			{#if forecast.value}
				<p data-text-role="body">
					{rain === null ? 'Rain chance unknown' : `Rain today: ${rain.maxPct}%`}
				</p>
				<p data-text-role="meta">
					{forecast.scope}{forecast.observedAt !== null
						? ` · issued ${formatAsOf(forecast.observedAt, $now)}`
						: ' · issue time unknown'}{forecastState === 'stale' ? ' · out of date' : ''}
				</p>
			{:else if forecastState === 'loading'}
				<p class="v2-skeleton" data-text-role="body">Loading forecast…</p>
				<p class="v2-skeleton" data-text-role="meta" aria-hidden="true">&nbsp;</p>
			{:else}
				<p data-text-role="meta">Forecast unavailable</p>
			{/if}
			{#if forecast.updatingFor}
				<p data-text-role="meta">Updating for {forecast.updatingFor}…</p>
			{/if}
			{#if forecast.detail}
				<p class="v2-warn" data-text-role="meta">{forecast.detail}</p>
			{/if}
		</div>
	</article>

	<article class="v2-card" data-card="tide" data-state={tideState}>
		<h3 class="v2-card-title" data-text-role="label">Next tide</h3>
		{#if tide}
			<p class="v2-card-value" data-text-role="value">
				{`${tide.type === 'H' ? 'High' : 'Low'} ${tide.heightFt.toFixed(1)} ft · ${formatAsOf(tide.atMs, $now)}`}
			</p>
			<p data-text-role="meta">{tides.scope} · NOAA prediction</p>
		{:else if tideState === 'loading'}
			<p class="v2-card-value v2-skeleton" data-text-role="value" aria-hidden="true">&nbsp;</p>
			<p class="v2-skeleton" data-text-role="meta">Loading tides…</p>
		{:else}
			<p data-text-role="meta">Tide predictions unavailable</p>
		{/if}
		{#if tides.updatingFor}
			<p data-text-role="meta">Updating for {tides.updatingFor}…</p>
		{/if}
		{#if tides.detail}
			<p class="v2-warn" data-text-role="meta">{tides.detail}</p>
		{/if}
	</article>
	<a
		class="v2-brief-link"
		data-brief-link="getting-around"
		href="#getting-around"
		onclick={() => onjump?.('#getting-around')}
	>
		<span class="v2-brief-link-title" data-text-role="label">Getting around</span>
		<span class="v2-brief-link-parts" data-text-role="meta"
			>{#each aroundLine as item, i (i)}{#if i}{' · '}{/if}<span data-state={item.state}
					>{item.text}</span
				>{/each}</span
		>
		<span aria-hidden="true" data-text-role="label">→</span>
	</a>
</section>

<style>
	.v2-brief-link {
		/* An action, not an answer card (§2.3): one compact full-width line under the cards. */
		flex: 1 1 100%;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		min-height: 2.75rem;
		color: var(--accent);
		text-decoration: none;
	}
	.v2-brief-link-title {
		flex: none;
	}
	.v2-brief-link-parts {
		/* One line, the desktop card's words; the end ellipsized, the arrow always shown. */
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
		color: var(--text-primary);
	}
	.v2-brief-link-parts [data-state='unavailable'],
	.v2-brief-link-parts [data-state='stale'],
	.v2-brief-link-parts [data-state='unknown'] {
		color: var(--warning, var(--text-primary));
	}
	.v2-brief-link:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.v2-brief {
		display: flex;
		flex-wrap: wrap; /* a wrapping row: no swipe-hidden answers (§8) */
		gap: 0.75rem;
		margin: 0.75rem 0;
	}
	@media (min-width: 768px) {
		/* Tablet and narrow desktop: one card per row (the mockup's ≤1279 fallback). */
		.v2-brief {
			display: grid;
			grid-template-columns: 1fr;
		}
	}
	@media (min-width: 1280px) {
		/* Desktop: Weather 5fr · Next tide 4fr · a third slot 3fr (desktop-v2-mockup.html). */
		.v2-brief {
			grid-template-columns: 5fr 4fr 3fr;
			gap: var(--v2-gap, 14px);
		}
		.v2-brief-link {
			align-self: start;
		}
	}
	.v2-card {
		flex: 1 1 14rem;
		padding: var(--v2-card-padding);
		border: 1px solid var(--border-light);
		border-radius: 8px;
	}
	.v2-card-title,
	.v2-card p {
		margin: 0;
	}
	.v2-card-title,
	.v2-skeleton {
		color: var(--text-muted);
	}
	.v2-card-part {
		margin-top: 0.5rem;
	}
	.v2-warn {
		color: var(--warning, var(--text-primary));
	}
</style>

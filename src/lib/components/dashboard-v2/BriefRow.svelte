<script lang="ts">
	import type { Readable } from 'svelte/store';
	import type { BriefCard, BriefState } from '$lib/dashboard/brief-store';
	import { formatAsOf } from '$lib/dashboard/pacific-time';
	import { effectiveState, type SourceEntryState } from '$lib/dashboard/source-status';
	import { nextTide, restOfTodayRainChance } from '$lib/weather/brief';

	let {
		brief,
		now,
		onjump
	}: { brief: Readable<BriefState>; now: Readable<number>; onjump: (hash: string) => void } =
		$props();

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
				<p class="v2-skeleton" data-text-role="meta">Loading forecast…</p>
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

	<article class="v2-card v2-card-action" data-card="getting-around" data-state="ok">
		<h3 class="v2-card-title" data-text-role="label">Getting around</h3>
		<a href="#getting-around" data-text-role="body" onclick={() => onjump('#getting-around')}
			>Traffic cams & map →</a
		>
	</article>
</section>

<style>
	.v2-brief {
		display: flex;
		flex-wrap: wrap; /* a wrapping row: no swipe-hidden answers (§8) */
		gap: 0.75rem;
		margin: 0.75rem 0;
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
	.v2-card-action a {
		color: var(--accent);
	}
</style>

<script lang="ts">
	import type { Readable } from 'svelte/store';
	import type { HealthReportJson } from '$lib/api/marin/health-report';
	import { summarizeHealth } from '$lib/dashboard/health-summary';
	import { formatAsOf } from '$lib/dashboard/pacific-time';
	import type { DatasetFetch } from '$lib/dashboard/source-adapters';

	let {
		report,
		outcomes,
		now
	}: {
		report: Readable<HealthReportJson | null>;
		outcomes: Readable<Readonly<Record<string, DatasetFetch>>>;
		now: Readable<number>;
	} = $props();

	let open = $state(false);
	const summary = $derived(summarizeHealth($report, $outcomes.health, $now));
	const WORD: Record<string, string> = {
		stale: 'out of date',
		unavailable: 'unavailable',
		unknown: 'unverified',
		loading: 'checking'
	};
</script>

<div class="v2-health" data-health={summary.state}>
	<button
		type="button"
		class="v2-health-button"
		data-text-role="label"
		aria-expanded={open}
		aria-controls="v2-health-list"
		onclick={() => (open = !open)}
		onkeydown={(e) => e.key === 'Escape' && (open = false)}
	>
		{summary.label}
	</button>
	{#if open}
		<div class="v2-health-list" id="v2-health-list" data-health-list>
			{#if summary.degraded.length === 0}
				<p data-text-role="meta">
					{summary.state === 'ok'
						? 'Every monitored source is within its freshness limit.'
						: summary.label}
				</p>
			{:else}
				<ul>
					{#each summary.degraded as e (e.id)}
						<li>
							<span data-text-role="label">{e.name}</span>
							<span data-text-role="meta">
								{WORD[e.state] ?? e.state}{e.observedAt !== null
									? ` · as of ${formatAsOf(e.observedAt, $now)}`
									: ''}{e.detail ? ` · ${e.detail}` : ''}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

<style>
	.v2-health {
		position: relative;
	}
	.v2-health-button {
		min-height: 2.25rem;
		padding: 0 0.625rem;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		background: transparent;
		color: var(--text-primary);
		cursor: pointer;
	}
	.v2-health[data-health='degraded'] .v2-health-button,
	.v2-health[data-health='unknown'] .v2-health-button {
		border-color: var(--warning, var(--accent));
	}
	.v2-health-list {
		position: absolute;
		right: 0;
		z-index: 50;
		width: min(22rem, calc(100vw - 2rem));
		margin-top: 0.5rem;
		padding: var(--v2-card-padding);
		border: 1px solid var(--border-light);
		border-radius: 8px;
		background: var(--bg);
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.375rem;
	}
	li {
		display: flex;
		flex-direction: column;
	}
	p {
		margin: 0;
	}
</style>

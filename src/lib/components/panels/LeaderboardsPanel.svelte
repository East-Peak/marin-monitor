<script lang="ts">
	import { onMount } from 'svelte';
	import Panel from '$lib/components/common/Panel.svelte';
	import SegmentCard from './leaderboards/SegmentCard.svelte';
	import RecentActivity from './leaderboards/RecentActivity.svelte';
	import { stravaSegments, loadStravaData } from '$lib/stores/strava';
	import {
		STRAVA_ENABLED,
		STRAVA_DASHBOARD_RIDE_LIMIT,
		STRAVA_DASHBOARD_RUN_LIMIT
	} from '$lib/config/strava';
	const PREFETCH_SEGMENT_LIMIT = 6;

	const cyclingSegments = $derived(
		$stravaSegments.segments
			.filter((s) => s.activityType === 'ride')
			.slice(0, STRAVA_DASHBOARD_RIDE_LIMIT)
	);

	const runningSegments = $derived(
		$stravaSegments.segments
			.filter((s) => s.activityType === 'run')
			.slice(0, STRAVA_DASHBOARD_RUN_LIMIT)
	);

	onMount(() => {
		if (STRAVA_ENABLED) {
			void loadStravaData();
		}
	});
</script>

{#if STRAVA_ENABLED}
	<Panel id="leaderboards" title="Leaderboards" variant="cycling">
		{#snippet children()}
			<div class="leaderboards-grid">
				<section class="leaderboard-column">
					<div class="column-header">
						<span class="column-title cycling">Cycling</span>
						<span class="column-count">{cyclingSegments.length}</span>
					</div>
					<div class="column-body">
						{#if cyclingSegments.length === 0}
							<div class="empty">No cycling segments loaded</div>
						{:else}
							{#each cyclingSegments as segment, index (segment.id)}
								<SegmentCard {segment} prefetch={index < PREFETCH_SEGMENT_LIMIT} />
							{/each}
						{/if}
					</div>
				</section>

				<section class="leaderboard-column">
					<div class="column-header">
						<span class="column-title running">Running</span>
						<span class="column-count">{runningSegments.length}</span>
					</div>
					<div class="column-body">
						{#if runningSegments.length === 0}
							<div class="empty">No running segments loaded</div>
						{:else}
							{#each runningSegments as segment, index (segment.id)}
								<SegmentCard {segment} prefetch={index < PREFETCH_SEGMENT_LIMIT} />
							{/each}
						{/if}
					</div>
				</section>

				<section class="leaderboard-column recent-column">
					<div class="column-header">
						<span class="column-title recent">Recent Changes</span>
					</div>
					<div class="column-body">
						<RecentActivity />
					</div>
				</section>
			</div>
		{/snippet}
	</Panel>
{/if}

<style>
	.leaderboards-grid {
		display: grid;
		grid-template-columns: minmax(0, 1.12fr) minmax(0, 1.12fr) minmax(300px, 0.9fr);
		gap: 1rem;
		align-items: start;
	}

	.leaderboard-column {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}

	.column-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding-bottom: 0.2rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
	}

	.column-title {
		font-size: 0.58rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}

	.column-title.cycling {
		color: #fc4c02;
	}

	.column-title.running {
		color: #2dd4bf;
	}

	.column-title.recent {
		color: #f59e0b;
	}

	.column-count {
		font-size: 0.5rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.column-body {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		max-height: 58rem;
		min-height: 32rem;
		overflow-y: auto;
		padding-right: 0.35rem;
	}

	.empty {
		font-size: 0.6rem;
		color: var(--text-muted);
		text-align: center;
		padding: 1.5rem 0;
	}

	@media (max-width: 1180px) {
		.leaderboards-grid {
			grid-template-columns: 1fr;
		}

		.column-body {
			gap: 0.55rem;
			max-height: none;
			min-height: 0;
			overflow: visible;
			padding-right: 0;
		}
	}
</style>

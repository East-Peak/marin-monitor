<script lang="ts">
	import { onMount } from 'svelte';
	import Panel from '$lib/components/common/Panel.svelte';
	import SegmentCard from './leaderboards/SegmentCard.svelte';
	import RecentActivity from './leaderboards/RecentActivity.svelte';
	import { stravaSegments, loadStravaData } from '$lib/stores/strava';
	import { STRAVA_ENABLED } from '$lib/config/strava';

	type Tab = 'cycling' | 'running' | 'recent';

	let activeTab = $state<Tab>('cycling');

	const cyclingSegments = $derived(
		$stravaSegments.segments
			.filter((s) => s.activityType === 'ride')
			.sort((a, b) => b.totalAttempts - a.totalAttempts)
	);

	const runningSegments = $derived(
		$stravaSegments.segments
			.filter((s) => s.activityType === 'run')
			.sort((a, b) => b.totalAttempts - a.totalAttempts)
	);

	onMount(() => {
		if (STRAVA_ENABLED) {
			loadStravaData();
		}
	});
</script>

{#if STRAVA_ENABLED}
	<Panel id="leaderboards" title="Leaderboards" variant="cycling">
		{#snippet header()}
			<div class="tab-bar">
				<button
					class="tab"
					class:active={activeTab === 'cycling'}
					onclick={() => (activeTab = 'cycling')}
				>
					Cycling
				</button>
				<button
					class="tab"
					class:active={activeTab === 'running'}
					onclick={() => (activeTab = 'running')}
				>
					Running
				</button>
				<button
					class="tab"
					class:active={activeTab === 'recent'}
					onclick={() => (activeTab = 'recent')}
				>
					Recent
				</button>
			</div>
		{/snippet}

		{#snippet children()}
			<div class="leaderboards-content">
				{#if activeTab === 'cycling'}
					{#if cyclingSegments.length === 0}
						<div class="empty">No cycling segments loaded</div>
					{:else}
						<div class="segment-list">
							{#each cyclingSegments as segment (segment.id)}
								<SegmentCard {segment} />
							{/each}
						</div>
					{/if}
				{:else if activeTab === 'running'}
					{#if runningSegments.length === 0}
						<div class="empty">No running segments loaded</div>
					{:else}
						<div class="segment-list">
							{#each runningSegments as segment (segment.id)}
								<SegmentCard {segment} />
							{/each}
						</div>
					{/if}
				{:else if activeTab === 'recent'}
					<RecentActivity />
				{/if}
			</div>
		{/snippet}
	</Panel>
{/if}

<style>
	.tab-bar {
		display: flex;
		gap: 0;
		margin-left: auto;
	}

	.tab {
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 0.2rem 0.5rem;
		font-size: 0.55rem;
		font-weight: 600;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			color 0.15s,
			border-color 0.15s;
	}

	.tab:hover {
		color: var(--text-dim);
	}

	.tab.active {
		color: #fc4c02;
		border-bottom-color: #fc4c02;
	}

	.leaderboards-content {
		display: flex;
		flex-direction: column;
		max-height: 500px;
		overflow-y: auto;
	}

	.segment-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.empty {
		font-size: 0.6rem;
		color: var(--text-muted);
		text-align: center;
		padding: 1.5rem 0;
	}
</style>

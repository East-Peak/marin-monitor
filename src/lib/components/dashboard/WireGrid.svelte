<script lang="ts">
	import { NewsPanel, CommunityPanel } from '$lib/components/panels';
	import LeaderboardsPanel from '$lib/components/panels/LeaderboardsPanel.svelte';
	import { STRAVA_ENABLED } from '$lib/config/strava';
	import { settings } from '$lib/stores';
	import { WIRE_COLUMNS } from '$lib/config/wire-columns';

	interface Props {
		onFeedback: (type: 'feed-request' | 'bug-report' | 'general') => void;
	}

	let { onFeedback }: Props = $props();

	function isPanelVisible(id: string): boolean {
		return ($settings.enabled as Record<string, boolean>)[id] !== false;
	}
</script>

<div class="news-area">
	<div class="wire-grid">
		{#each WIRE_COLUMNS as column (column.panelId)}
			{#if isPanelVisible(column.panelId)}
				<div class="wire-slot">
					<NewsPanel category={column.category} panelId={column.panelId} title={column.title} />
				</div>
			{/if}
		{/each}
		{#if STRAVA_ENABLED && isPanelVisible('leaderboards')}
			<div class="wire-slot wire-slot-leaderboards">
				<LeaderboardsPanel />
			</div>
		{/if}
		<div class="wire-slot">
			<CommunityPanel {onFeedback} />
		</div>
	</div>
</div>

<style>
	.news-area {
		margin-top: 1rem;
	}

	.wire-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
	}

	.wire-slot {
		min-width: 0;
	}

	.wire-slot-leaderboards {
		grid-column: span 2;
	}

	@media (max-width: 1080px) {
		.wire-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		.wire-slot-leaderboards {
			grid-column: 1 / -1;
		}
	}

	@media (max-width: 820px) {
		.wire-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 620px) {
		.wire-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

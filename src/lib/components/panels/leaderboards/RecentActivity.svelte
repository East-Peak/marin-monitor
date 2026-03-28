<script lang="ts">
	import { stravaEvents } from '$lib/stores/strava';

	const events = $derived(
		$stravaEvents.events
			.slice()
			.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
			.slice(0, 20)
	);

	function timeAgo(iso: string): string {
		const diff = Date.now() - new Date(iso).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 60) return `${mins}m ago`;
		const hrs = Math.floor(mins / 60);
		if (hrs < 24) return `${hrs}h ago`;
		const days = Math.floor(hrs / 24);
		return `${days}d ago`;
	}
</script>

<div class="recent-activity">
	{#if events.length === 0}
		<div class="empty">
			<span class="empty-title">No recent leaderboard changes</span>
			<span class="empty-detail">New KOM and QOM swaps from the last 30 days will show up here.</span>
		</div>
	{:else}
		{#each events as event (event.effortId)}
			<div class="event-row">
				<span class="event-badge" class:kom={event.type === 'new_kom'} class:qom={event.type === 'new_qom'}>
					{event.type === 'new_kom' ? 'KOM' : 'QOM'}
				</span>
				<div class="event-info">
					<span class="event-segment">{event.segmentName}</span>
					<span class="event-detail">
						<span class="event-athlete">{event.athlete}</span>
						<span class="event-time">{event.time}</span>
						{#if event.previous}
							<span class="event-prev">prev: {event.previous.athlete}</span>
						{/if}
					</span>
				</div>
				<span class="event-ago">{timeAgo(event.detectedAt)}</span>
			</div>
		{/each}
	{/if}
</div>

<style>
	.recent-activity {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		min-height: 8rem;
		padding: 1rem;
		border: 1px dashed rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.02);
		text-align: center;
	}

	.empty-title {
		font-size: 0.62rem;
		font-weight: 600;
		color: var(--text);
	}

	.empty-detail {
		max-width: 18rem;
		font-size: 0.55rem;
		line-height: 1.4;
		color: var(--text-muted);
	}

	.event-row {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		padding: 0.35rem 0;
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
	}

	.event-row:last-child {
		border-bottom: none;
	}

	.event-badge {
		font-size: 0.45rem;
		font-weight: 700;
		padding: 0.1rem 0.25rem;
		border-radius: 2px;
		white-space: nowrap;
		flex-shrink: 0;
		margin-top: 0.05rem;
	}

	.event-badge.kom {
		color: #f59e0b;
		background: rgba(245, 158, 11, 0.15);
	}

	.event-badge.qom {
		color: #ec4899;
		background: rgba(236, 72, 153, 0.15);
	}

	.event-info {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		flex: 1;
		min-width: 0;
	}

	.event-segment {
		font-size: 0.6rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.event-detail {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.5rem;
		flex-wrap: wrap;
	}

	.event-athlete {
		color: var(--text-dim);
		font-weight: 500;
	}

	.event-time {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.event-prev {
		color: var(--text-muted);
		font-style: italic;
	}

	.event-ago {
		font-size: 0.5rem;
		color: var(--text-muted);
		white-space: nowrap;
		flex-shrink: 0;
	}
</style>

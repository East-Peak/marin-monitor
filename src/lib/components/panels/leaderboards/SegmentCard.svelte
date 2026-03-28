<script lang="ts">
	import type { StravaSegment, StravaLeaderboard } from '$lib/types/strava';
	import { loadLeaderboard } from '$lib/stores/strava';

	interface Props {
		segment: StravaSegment;
	}

	let { segment }: Props = $props();

	let expanded = $state(false);
	let leaderboard = $state<StravaLeaderboard | null>(null);
	let loading = $state(false);
	let loadError = $state<string | null>(null);

	const climbLabel = $derived(climbCategoryLabel(segment.climbCategory));

	function climbCategoryLabel(cat: number): string | null {
		switch (cat) {
			case 5:
				return 'HC';
			case 4:
				return 'Cat 1';
			case 3:
				return 'Cat 2';
			case 2:
				return 'Cat 3';
			case 1:
				return 'Cat 4';
			default:
				return null;
		}
	}

	function formatDistance(meters: number): string {
		const km = meters / 1000;
		if (km >= 1) return `${km.toFixed(1)} km`;
		return `${Math.round(meters)} m`;
	}

	function formatElevation(meters: number): string {
		return `${Math.round(meters)} m`;
	}

	async function toggle() {
		expanded = !expanded;
		if (expanded && !leaderboard && !loading) {
			loading = true;
			loadError = null;
			try {
				leaderboard = await loadLeaderboard(segment.id);
			} catch {
				loadError = 'Failed to load leaderboard';
			} finally {
				loading = false;
			}
		}
	}
</script>

<div class="segment-card" class:expanded>
	<button class="segment-header" onclick={toggle}>
		<div class="segment-info">
			<span class="segment-name">{segment.name}</span>
			{#if climbLabel}
				<span class="climb-badge">{climbLabel}</span>
			{/if}
		</div>
		<div class="segment-records">
			{#if leaderboard?.cr}
				<span class="record cr" title="Course Record">
					<span class="record-label">CR</span>
					<span class="record-holder">{leaderboard.cr.athleteName}</span>
					<span class="record-time">{leaderboard.cr.time}</span>
				</span>
			{/if}
			{#if leaderboard?.qom}
				<span class="record qom" title="Queen of the Mountain">
					<span class="record-label">QOM</span>
					<span class="record-holder">{leaderboard.qom.athleteName}</span>
					<span class="record-time">{leaderboard.qom.time}</span>
				</span>
			{/if}
			{#if !leaderboard}
				<span class="attempts">{segment.totalAttempts.toLocaleString()} attempts</span>
			{/if}
		</div>
		<span class="expand-icon">{expanded ? '\u25B2' : '\u25BC'}</span>
	</button>

	{#if expanded}
		<div class="segment-body">
			{#if loading}
				<div class="loading">Loading leaderboard...</div>
			{:else if loadError}
				<div class="error">{loadError}</div>
			{:else if leaderboard}
				<div class="segment-meta">
					<span class="meta-item">{formatDistance(segment.distance)}</span>
					<span class="meta-sep">/</span>
					<span class="meta-item">{formatElevation(segment.elevationGain)} gain</span>
					<span class="meta-sep">/</span>
					<span class="meta-item">{segment.avgGrade.toFixed(1)}% avg</span>
					<span class="meta-sep">/</span>
					<span class="meta-item">{leaderboard.totalAttempts.toLocaleString()} attempts</span>
				</div>

				{#if leaderboard.rows.length > 0}
					<table class="leaderboard-table">
						<thead>
							<tr>
								<th class="col-rank">#</th>
								<th class="col-name">Name</th>
								<th class="col-time">Time</th>
								{#if segment.activityType === 'ride'}
									<th class="col-speed">Speed</th>
								{/if}
							</tr>
						</thead>
						<tbody>
							{#each leaderboard.rows as row (row.rank)}
								<tr>
									<td class="col-rank">{row.rank}</td>
									<td class="col-name">{row.athleteName}</td>
									<td class="col-time">{row.time}</td>
									{#if segment.activityType === 'ride'}
										<td class="col-speed">{row.speed ?? '-'}</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}

				<a
					class="strava-link"
					href="https://www.strava.com/segments/{segment.id}"
					target="_blank"
					rel="noopener noreferrer"
				>
					View on Strava &rarr;
				</a>
			{/if}
		</div>
	{/if}
</div>

<style>
	.segment-card {
		border: 1px solid var(--border);
		border-radius: 4px;
		background: rgba(255, 255, 255, 0.02);
		overflow: hidden;
		transition: border-color 0.15s;
	}

	.segment-card:hover {
		border-color: var(--border-light, rgba(255, 255, 255, 0.15));
	}

	.segment-card.expanded {
		border-color: rgba(252, 76, 2, 0.3);
	}

	.segment-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.5rem 0.6rem;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		color: var(--text);
	}

	.segment-info {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex: 1;
		min-width: 0;
	}

	.segment-name {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.climb-badge {
		font-size: 0.5rem;
		font-weight: 700;
		color: #fc4c02;
		background: rgba(252, 76, 2, 0.12);
		padding: 0.05rem 0.3rem;
		border-radius: 3px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.segment-records {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.record {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		font-size: 0.55rem;
	}

	.record-label {
		font-weight: 700;
		font-size: 0.5rem;
		padding: 0.05rem 0.2rem;
		border-radius: 2px;
	}

	.record.cr .record-label {
		color: #f59e0b;
		background: rgba(245, 158, 11, 0.15);
	}

	.record.qom .record-label {
		color: #ec4899;
		background: rgba(236, 72, 153, 0.15);
	}

	.record-holder {
		color: var(--text-dim);
		max-width: 6rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.record-time {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.attempts {
		font-size: 0.55rem;
		color: var(--text-muted);
	}

	.expand-icon {
		font-size: 0.45rem;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.segment-body {
		padding: 0.5rem 0.6rem;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.segment-meta {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	.meta-item {
		font-size: 0.55rem;
		color: var(--text-dim);
	}

	.meta-sep {
		font-size: 0.5rem;
		color: var(--text-muted);
	}

	.leaderboard-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.55rem;
	}

	.leaderboard-table th {
		text-align: left;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 0.5rem;
		padding: 0.25rem 0.3rem;
		border-bottom: 1px solid var(--border);
	}

	.leaderboard-table td {
		padding: 0.25rem 0.3rem;
		color: var(--text-dim);
		border-bottom: 1px solid rgba(255, 255, 255, 0.03);
	}

	.col-rank {
		width: 1.5rem;
		text-align: center;
	}

	.col-name {
		max-width: 8rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.col-time {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.col-speed {
		white-space: nowrap;
		text-align: right;
	}

	.strava-link {
		font-size: 0.55rem;
		color: #fc4c02;
		text-decoration: none;
		font-weight: 600;
		align-self: flex-end;
	}

	.strava-link:hover {
		text-decoration: underline;
	}

	.loading,
	.error {
		font-size: 0.6rem;
		text-align: center;
		padding: 0.5rem;
	}

	.loading {
		color: var(--text-muted);
	}

	.error {
		color: var(--danger, #ef4444);
	}
</style>

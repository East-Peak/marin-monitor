<script lang="ts">
	import { onMount } from 'svelte';
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
	const distanceValue = $derived(leaderboard?.distance ?? segment.distance);
	const elevationValue = $derived(leaderboard?.elevationGain ?? segment.elevationGain);
	const avgGradeValue = $derived(leaderboard?.avgGrade ?? segment.avgGrade);
	const attemptsValue = $derived(leaderboard?.totalAttempts ?? segment.totalAttempts);
	const athletesValue = $derived(leaderboard?.totalAthletes ?? segment.totalAthletes);
	const summaryItems = $derived.by(() => {
		const items: string[] = [];
		const distance = formatDistance(distanceValue);
		const elevation = formatElevation(elevationValue);
		const avgGrade = formatAvgGrade(avgGradeValue);
		if (distance) items.push(distance);
		if (elevation) items.push(`${elevation} gain`);
		if (avgGrade) items.push(avgGrade);
		if (attemptsValue > 0) items.push(`${attemptsValue.toLocaleString()} attempts`);
		if (athletesValue > 0) items.push(`${athletesValue.toLocaleString()} athletes`);
		return items;
	});
	const detailItems = $derived.by(() => {
		const items: string[] = [];
		const distance = formatDistance(leaderboard?.distance ?? segment.distance);
		const elevation = formatElevation(leaderboard?.elevationGain ?? segment.elevationGain);
		const avgGrade = formatAvgGrade(leaderboard?.avgGrade ?? segment.avgGrade);
		if (distance) items.push(distance);
		if (elevation) items.push(`${elevation} gain`);
		if (avgGrade) items.push(avgGrade);
		if (leaderboard && leaderboard.totalAttempts > 0) {
			items.push(`${leaderboard.totalAttempts.toLocaleString()} attempts`);
		}
		if (leaderboard && leaderboard.totalAthletes > 0) {
			items.push(`${leaderboard.totalAthletes.toLocaleString()} athletes`);
		}
		return items;
	});

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

	function formatDistance(meters: number | null | undefined): string | null {
		if (!meters || meters <= 0) return null;
		const km = meters / 1000;
		if (km >= 1) return `${km.toFixed(1)} km`;
		return `${Math.round(meters)} m`;
	}

	function formatElevation(meters: number | null | undefined): string | null {
		if (!meters || meters <= 0) return null;
		return `${Math.round(meters)} m`;
	}

	function formatAvgGrade(grade: number | null | undefined): string | null {
		if (!grade || grade <= 0) return null;
		return `${grade.toFixed(1)}% avg`;
	}

	async function ensureLeaderboardLoaded() {
		if (leaderboard || loading) return;
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

	async function toggle() {
		expanded = !expanded;
		if (expanded) {
			await ensureLeaderboardLoaded();
		}
	}

	onMount(() => {
		void ensureLeaderboardLoaded();
	});
</script>

<div class="segment-card" class:expanded>
	<button class="segment-header" onclick={toggle}>
		<div class="segment-main">
				<div class="segment-title">
					<span class="segment-name">{segment.name}</span>
					{#if climbLabel}
						<span class="climb-badge">{climbLabel}</span>
					{/if}
				</div>
				<div class="segment-summary">
					{#each summaryItems as item (item)}
						<span class="summary-item">{item}</span>
					{/each}
				</div>
			</div>
		<div class="segment-records">
			{#if leaderboard?.cr}
				<span class="record cr" title="Course Record">
					<span class="record-top">
						<span class="record-label">CR</span>
						<span class="record-time">{leaderboard.cr.time}</span>
					</span>
					<span class="record-holder">{leaderboard.cr.athleteName}</span>
				</span>
			{/if}
			{#if leaderboard?.qom}
				<span class="record qom" title="Queen of the Mountain">
					<span class="record-top">
						<span class="record-label">QOM</span>
						<span class="record-time">{leaderboard.qom.time}</span>
					</span>
					<span class="record-holder">{leaderboard.qom.athleteName}</span>
				</span>
			{/if}
			{#if loading && !leaderboard}
				<span class="record-pending">Loading records…</span>
			{:else if loadError && !leaderboard}
				<span class="record-pending error">{loadError}</span>
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
						{#if detailItems.length > 0}
							{#each detailItems as item, index (`${item}-${index}`)}
								{#if index > 0}
									<span class="meta-sep">/</span>
								{/if}
								<span class="meta-item">{item}</span>
							{/each}
						{:else}
							<span class="meta-empty">Stats pending next sync</span>
						{/if}
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
							{#each leaderboard.rows as row (`${row.activityId}-${row.rank}`)}
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
					{:else}
						<div class="empty-table">No public leaderboard rows available right now.</div>
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
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.03);
		overflow: hidden;
		transition:
			border-color 0.15s,
			background-color 0.15s;
	}

	.segment-card:hover {
		background: rgba(255, 255, 255, 0.045);
		border-color: var(--border-light, rgba(255, 255, 255, 0.15));
	}

	.segment-card.expanded {
		border-color: rgba(252, 76, 2, 0.3);
	}

	.segment-header {
		display: flex;
		align-items: flex-start;
		gap: 0.65rem;
		width: 100%;
		padding: 0.65rem 0.75rem;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		color: var(--text);
	}

	.segment-main {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		flex: 1;
		min-width: 0;
	}

	.segment-title {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-width: 0;
	}

	.segment-name {
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text);
		line-height: 1.15;
		min-width: 0;
	}

	.climb-badge {
		font-size: 0.52rem;
		font-weight: 700;
		color: #fc4c02;
		background: rgba(252, 76, 2, 0.14);
		padding: 0.1rem 0.35rem;
		border-radius: 999px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.segment-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 0.45rem;
	}

	.summary-item {
		font-size: 0.52rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.segment-records {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.35rem;
		flex-shrink: 0;
		max-width: 14rem;
	}

	.record {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 6.35rem;
		padding: 0.3rem 0.4rem;
		border-radius: 6px;
		font-size: 0.55rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
	}

	.record-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.35rem;
	}

	.record-label {
		font-weight: 700;
		font-size: 0.5rem;
		padding: 0.08rem 0.24rem;
		border-radius: 999px;
	}

	.record.cr .record-label {
		color: #f59e0b;
		background: rgba(245, 158, 11, 0.18);
	}

	.record.qom .record-label {
		color: #ec4899;
		background: rgba(236, 72, 153, 0.18);
	}

	.record-holder {
		color: var(--text-dim, rgba(255, 255, 255, 0.72));
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.record-time {
		color: var(--text);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}

	.record-pending {
		font-size: 0.55rem;
		color: var(--text-muted);
		padding: 0.35rem 0;
	}

	.record-pending.error {
		color: #fca5a5;
	}

	.expand-icon {
		font-size: 0.5rem;
		color: var(--text-muted);
		flex-shrink: 0;
		padding-top: 0.15rem;
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

	.meta-empty {
		font-size: 0.55rem;
		color: var(--text-muted);
		font-style: italic;
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

	.empty-table {
		font-size: 0.58rem;
		color: var(--text-muted);
		font-style: italic;
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

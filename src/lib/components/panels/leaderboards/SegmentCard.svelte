<script lang="ts">
	import { onMount } from 'svelte';
	import type { StravaSegment, StravaLeaderboard, StravaLeaderboardRow } from '$lib/types/strava';
	import { loadLeaderboard } from '$lib/stores/strava';

	interface VisibleLeaderboardRow extends StravaLeaderboardRow {
		displayRank: number;
	}

	interface Props {
		segment: StravaSegment;
	}

	let { segment }: Props = $props();

	let cardElement = $state<HTMLDivElement | null>(null);
	let expanded = $state(false);
	let leaderboard = $state<StravaLeaderboard | null>(null);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	const climbLabel = $derived(climbCategoryLabel(segment.climbCategory));
	const primaryRecordLabel = $derived('KOM');
	const distanceValue = $derived(leaderboard?.distance ?? segment.distance);
	const elevationValue = $derived(leaderboard?.elevationGain ?? segment.elevationGain);
	const avgGradeValue = $derived(leaderboard?.avgGrade ?? segment.avgGrade);
	const topRows = $derived.by<VisibleLeaderboardRow[]>(() =>
		(leaderboard?.rows.slice(0, 3) ?? []).map((row, index) => ({
			...row,
			displayRank: index + 1
		}))
	);
	const hasVisibleRankGaps = $derived(topRows.some((row, index) => row.rank !== index + 1));
	const summaryItems = $derived.by(() => {
		const items: string[] = [];
		const distance = formatDistance(distanceValue);
		const elevation = formatElevation(elevationValue);
		const avgGrade = formatAvgGrade(avgGradeValue);
		if (distance) items.push(distance);
		if (elevation) items.push(`${elevation} gain`);
		if (avgGrade) items.push(avgGrade);
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

	async function ensureLeaderboardLoaded(force = false) {
		if ((leaderboard || loading) && !force) return;
		loading = true;
		loadError = null;
		try {
			const data = await loadLeaderboard(segment.id);
			if (!data) {
				loadError = 'Leaderboard unavailable';
				return;
			}
			leaderboard = data;
		} catch {
			loadError = 'Failed to load leaderboard';
		} finally {
			loading = false;
		}
	}

	async function toggle() {
		const nextExpanded = !expanded;
		expanded = nextExpanded;
		if (nextExpanded) {
			await ensureLeaderboardLoaded(!leaderboard);
		}
	}

	onMount(() => {
		if (!cardElement || typeof IntersectionObserver === 'undefined') {
			void ensureLeaderboardLoaded();
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					void ensureLeaderboardLoaded();
					observer.disconnect();
				}
			},
			{
				root: null,
				rootMargin: '240px 0px',
				threshold: 0.05
			}
		);

		observer.observe(cardElement);
		return () => observer.disconnect();
	});
</script>

<div class="segment-card" class:expanded bind:this={cardElement}>
	<button class="segment-header" onclick={toggle}>
		<div class="segment-main">
			<div class="segment-header-top">
				<div class="segment-title">
					<span class="segment-name">{segment.name}</span>
					{#if climbLabel}
						<span class="climb-badge">{climbLabel}</span>
					{/if}
				</div>
				<span class="expand-icon">{expanded ? '\u25B2' : '\u25BC'}</span>
			</div>
			{#if summaryItems.length > 0}
				<div class="segment-summary">
					{#each summaryItems as item (item)}
						<span class="summary-item">{item}</span>
					{/each}
				</div>
			{/if}

			<div class="segment-overview">
				<div class="segment-section">
					<span class="section-label">Records</span>
					<div class="record-grid">
						<div
							class="record-card primary"
							class:ride={segment.activityType === 'ride'}
							class:run={segment.activityType === 'run'}
						>
								<div class="record-card-top">
									<span class="record-label">{primaryRecordLabel}</span>
									{#if leaderboard?.cr}
										<span class="record-time">{leaderboard.cr.time}</span>
									{/if}
								</div>
								{#if leaderboard?.cr}
									<span class="record-holder">{leaderboard.cr.athleteName}</span>
								{:else if loading}
									<span class="record-empty">Loading…</span>
								{:else if loadError}
									<span class="record-empty error">{loadError}</span>
								{:else if leaderboard}
									<span class="record-empty">No record yet</span>
								{:else}
									<span class="record-empty">Waiting to load…</span>
								{/if}
							</div>

						<div class="record-card secondary">
								<div class="record-card-top">
									<span class="record-label">QOM</span>
									{#if leaderboard?.qom}
										<span class="record-time">{leaderboard.qom.time}</span>
									{/if}
								</div>
								{#if leaderboard?.qom}
									<span class="record-holder">{leaderboard.qom.athleteName}</span>
								{:else if loading}
									<span class="record-empty">Loading…</span>
								{:else if loadError}
									<span class="record-empty error">{loadError}</span>
								{:else if leaderboard}
									<span class="record-empty">No record yet</span>
								{:else}
									<span class="record-empty">Waiting to load…</span>
								{/if}
							</div>
						</div>
					</div>

					<div class="segment-section top-three-section">
						<span class="section-label">Visible Top 3</span>
						{#if topRows.length > 0}
							<div class="top-rows">
								{#each topRows as row}
									<div class="top-row">
										<span class="top-rank">#{row.displayRank}</span>
										<span class="top-athlete">{row.athleteName}</span>
										<span class="top-time">{row.time}</span>
									</div>
								{/each}
							</div>
						{:else if loading}
							<span class="top-empty">Loading…</span>
						{:else if loadError}
							<span class="top-empty error">{loadError}</span>
						{:else if leaderboard}
							<span class="top-empty">No public leaderboard rows right now.</span>
						{:else}
							<span class="top-empty">Waiting to load…</span>
						{/if}
					</div>
			</div>

		</div>
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
						{#if hasVisibleRankGaps}
							<div class="rank-note">
								Visible rows can skip official ranks when Strava hides efforts or multiple athletes tie.
							</div>
						{/if}
						<div class="leaderboard-table-wrap">
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
						</div>
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
		flex-shrink: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.03);
		overflow: hidden;
		min-height: 10rem;
		transition:
			border-color 0.15s,
			background-color 0.15s,
			box-shadow 0.15s;
	}

	.segment-card:hover {
		background: rgba(255, 255, 255, 0.045);
		border-color: var(--border-light, rgba(255, 255, 255, 0.15));
		box-shadow: 0 6px 18px rgba(2, 8, 23, 0.2);
	}

	.segment-card.expanded {
		border-color: rgba(252, 76, 2, 0.3);
		min-height: 0;
		height: auto;
	}

	.segment-header {
		display: block;
		flex-shrink: 0;
		width: 100%;
		padding: 0.85rem 0.95rem;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		color: var(--text);
	}

	.segment-main {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-width: 0;
	}

	.segment-header-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.65rem;
	}

	.segment-title {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
	}

	.segment-name {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text);
		line-height: 1.15;
		min-width: 0;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.climb-badge {
		font-size: 0.58rem;
		font-weight: 700;
		color: #fc4c02;
		background: rgba(252, 76, 2, 0.14);
		padding: 0.12rem 0.38rem;
		border-radius: 999px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.segment-summary {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.55rem;
	}

	.summary-item {
		font-size: 0.62rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.segment-section {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.segment-overview {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 0.8rem;
		align-items: stretch;
	}

	.section-label {
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.record-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
		align-items: stretch;
	}

	.record-card {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.32rem;
		padding: 0.6rem 0.65rem;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		min-height: 4rem;
		min-width: 0;
	}

	.record-card.primary.ride {
		border-color: rgba(252, 76, 2, 0.18);
		background: rgba(252, 76, 2, 0.06);
	}

	.record-card.primary.run {
		border-color: rgba(45, 212, 191, 0.18);
		background: rgba(45, 212, 191, 0.06);
	}

	.record-card.secondary {
		border-color: rgba(236, 72, 153, 0.16);
		background: rgba(236, 72, 153, 0.05);
	}

	.record-card-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.35rem;
	}

	.record-label {
		font-weight: 700;
		font-size: 0.56rem;
		padding: 0.12rem 0.28rem;
		border-radius: 999px;
	}

	.record-card.primary.ride .record-label {
		color: #fc4c02;
		background: rgba(252, 76, 2, 0.16);
	}

	.record-card.primary.run .record-label {
		color: #2dd4bf;
		background: rgba(45, 212, 191, 0.16);
	}

	.record-card.secondary .record-label {
		color: #ec4899;
		background: rgba(236, 72, 153, 0.18);
	}

	.record-holder {
		font-size: 0.66rem;
		line-height: 1.2;
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
		font-size: 0.86rem;
	}

	.record-empty {
		font-size: 0.64rem;
		color: var(--text-muted);
		font-style: italic;
	}

	.record-empty.error {
		color: #fca5a5;
	}

	.top-three-section {
		min-width: 0;
		padding-left: 0.8rem;
		border-left: 1px solid rgba(255, 255, 255, 0.06);
	}

	.top-rows {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.top-row {
		display: grid;
		grid-template-columns: 1.9rem minmax(0, 1fr) auto;
		gap: 0.5rem;
		align-items: center;
		padding: 0.3rem 0;
	}

	.top-row + .top-row {
		border-top: 1px solid rgba(255, 255, 255, 0.05);
	}

	.top-rank {
		font-size: 0.58rem;
		font-weight: 600;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.top-athlete {
		font-size: 0.66rem;
		color: var(--text-dim);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.top-time {
		font-size: 0.7rem;
		color: var(--text);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}

	.top-empty {
		font-size: 0.64rem;
		color: var(--text-muted);
		font-style: italic;
	}

	.top-empty.error {
		color: #fca5a5;
	}

	.expand-icon {
		font-size: 0.56rem;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.segment-body {
		flex-shrink: 0;
		padding: 0.7rem 0.95rem 0.85rem;
		background: rgba(2, 6, 23, 0.22);
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.segment-meta {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	.meta-item {
		font-size: 0.62rem;
		color: var(--text-dim);
	}

	.meta-empty {
		font-size: 0.62rem;
		color: var(--text-muted);
		font-style: italic;
	}

	.meta-sep {
		font-size: 0.56rem;
		color: var(--text-muted);
	}

	.rank-note {
		font-size: 0.6rem;
		color: var(--text-muted);
		font-style: italic;
	}

	.leaderboard-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.62rem;
	}

	.leaderboard-table-wrap {
		max-height: 12rem;
		overflow: auto;
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 6px;
	}

	.empty-table {
		font-size: 0.64rem;
		color: var(--text-muted);
		font-style: italic;
	}

	.leaderboard-table th {
		text-align: left;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 0.56rem;
		padding: 0.35rem 0.4rem;
		border-bottom: 1px solid var(--border);
	}

	.leaderboard-table td {
		padding: 0.35rem 0.4rem;
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
		font-size: 0.62rem;
		color: #fc4c02;
		text-decoration: none;
		font-weight: 600;
		align-self: flex-end;
	}

	@media (max-width: 900px) {
		.segment-overview {
			grid-template-columns: 1fr;
		}

		.top-three-section {
			padding-left: 0;
			border-left: none;
			padding-top: 0.15rem;
			border-top: 1px solid rgba(255, 255, 255, 0.06);
		}
	}

	@media (max-width: 760px) {
		.record-grid {
			grid-template-columns: 1fr;
		}
	}

	.strava-link:hover {
		text-decoration: underline;
	}

	.loading,
	.error {
		font-size: 0.66rem;
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

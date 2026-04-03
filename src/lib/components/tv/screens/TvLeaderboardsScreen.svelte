<script lang="ts">
	import { onMount } from 'svelte';
	import { stravaSegments, stravaEvents, stravaLeaderboards, loadStravaData, loadAllLeaderboards } from '$lib/stores/strava';
	import TvScroller from '$lib/components/tv/TvScroller.svelte';
	import type { StravaSegment, StravaLeaderboard, StravaLeaderboardRow } from '$lib/types/strava';

	interface Props {
		active?: boolean;
	}
	let { active = true }: Props = $props();

	type VisibleLeaderboardRow = StravaLeaderboardRow & {
		displayRank: number;
	};

	const TV_SEGMENTS_PER_COLUMN = 20;

	// ---- Pick segments: events first, then random smattering ----
	function pickTvSegments(
		segments: StravaSegment[],
		activityType: 'ride' | 'run',
		eventSegmentIds: Set<number>
	): StravaSegment[] {
		const pool = segments.filter((s) => s.activityType === activityType);
		if (pool.length === 0) return [];

		// Segments with recent KOM/QOM changes always show first
		const withEvents: StravaSegment[] = [];
		const rest: StravaSegment[] = [];
		for (const seg of pool) {
			if (eventSegmentIds.has(seg.id)) {
				withEvents.push(seg);
			} else {
				rest.push(seg);
			}
		}

		// Shuffle the rest (Fisher-Yates)
		const shuffled = [...rest];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}

		const remaining = TV_SEGMENTS_PER_COLUMN - withEvents.length;
		return [...withEvents, ...shuffled.slice(0, Math.max(0, remaining))];
	}

	// ---- Set of segment IDs with recent events ----
	const eventSegmentIds = $derived(
		new Set($stravaEvents.events.map((e) => e.segmentId))
	);

	// ---- Derived segment lists ----
	const cyclingSegments = $derived(
		pickTvSegments($stravaSegments.segments, 'ride', eventSegmentIds)
	);

	const runningSegments = $derived(
		pickTvSegments($stravaSegments.segments, 'run', eventSegmentIds)
	);

	// ---- Recent events for footer ----
	const recentEvents = $derived($stravaEvents.events.slice(0, 5));

	// ---- Climb category labels ----
	function categoryLabel(cat: number): string {
		if (cat === 5) return 'HC';
		if (cat === 4) return 'Cat 1';
		if (cat === 3) return 'Cat 2';
		if (cat === 2) return 'Cat 3';
		if (cat === 1) return 'Cat 4';
		return '';
	}

	function categoryColor(cat: number): string {
		if (cat === 5) return '#ef4444'; // HC — red
		if (cat === 4) return '#f97316'; // Cat 1 — orange
		if (cat === 3) return '#eab308'; // Cat 2 — yellow
		if (cat === 2) return '#22c55e'; // Cat 3 — green
		if (cat === 1) return '#60a5fa'; // Cat 4 — blue
		return '#6b7280';
	}

	function segmentDistanceLabel(segment: StravaSegment, leaderboard: StravaLeaderboard | undefined): string | null {
		const distance = leaderboard?.distance ?? segment.distance;
		if (!distance || distance <= 0) return null;
		return `${(distance / 1000).toFixed(1)}km`;
	}

	function visibleTopRows(leaderboard: StravaLeaderboard | undefined): VisibleLeaderboardRow[] {
		return (leaderboard?.rows.slice(0, 3) ?? []).map((row, index) => ({
			...row,
			displayRank: index + 1
		}));
	}

	// ---- Leaderboard lookup ----
	function getLeaderboard(segmentId: number): StravaLeaderboard | undefined {
		return $stravaLeaderboards.get(segmentId);
	}

	// ---- Mount: load catalog + events + all leaderboards in one shot ----
	onMount(async () => {
		await loadStravaData();
		await loadAllLeaderboards();
	});

	// ---- Event type label ----
	function eventLabel(type: string): string {
		if (type === 'new_kom') return 'NEW KOM';
		if (type === 'new_qom') return 'NEW QOM';
		return type.toUpperCase();
	}

	// ---- Format relative time ----
	function timeAgo(isoString: string): string {
		const ms = Date.now() - new Date(isoString).getTime();
		const h = Math.floor(ms / 3_600_000);
		const d = Math.floor(h / 24);
		if (d > 0) return `${d}d ago`;
		if (h > 0) return `${h}h ago`;
		const m = Math.floor(ms / 60_000);
		return `${m}m ago`;
	}
</script>

<div class="h-full flex flex-col overflow-hidden" style="background:#0a0a0a; color:#f3f4f6;">

	<!-- Header -->
	<div class="shrink-0 px-4 py-1.5 flex items-center gap-3 border-b border-gray-800">
		<span class="text-lg font-bold tracking-wide" style="color:#fc4c02;">MARIN LEADERBOARDS</span>
		<span class="text-xs text-gray-500 uppercase tracking-widest">Strava KOMs &amp; QOMs</span>
	</div>

	<!-- Two-column body -->
	<div class="flex-1 min-h-0 flex gap-2 px-3 py-2">

		<!-- Cycling column -->
		<div class="flex-1 min-w-0 flex flex-col gap-1.5">
			<div class="shrink-0 text-xs font-bold uppercase tracking-widest" style="color:#f59e0b;">Cycling</div>
			<div class="flex-1 min-h-0">
				<TvScroller screenId="leaderboards-cycling" {active} speed={16}>
					<div class="flex flex-col gap-1.5">
						{#each cyclingSegments as seg (seg.id)}
							{@const lb = getLeaderboard(seg.id)}
							{@const topRows = visibleTopRows(lb)}
							{@const climbLabel = categoryLabel(seg.climbCategory)}
							{@const distanceLabel = segmentDistanceLabel(seg, lb)}
							<div class="rounded-lg border border-gray-800 p-2" style="background:#111;">
								<!-- Segment header -->
								<div class="mb-0.5 flex items-center gap-2">
									<span class="flex-1 truncate text-[11px] font-semibold text-gray-100">{seg.name}</span>
									{#if climbLabel}
										<span
											class="text-[9px] font-bold px-1.5 py-0.5 rounded"
											style="background:{categoryColor(seg.climbCategory)}22; color:{categoryColor(seg.climbCategory)}; border:1px solid {categoryColor(seg.climbCategory)}44;"
										>
											{climbLabel}
										</span>
									{/if}
									{#if distanceLabel}
										<span class="text-[9px] text-gray-500">{distanceLabel}</span>
									{/if}
								</div>

								{#if lb}
									<div class="flex gap-2 min-w-0">
										<div class="min-w-0 basis-[52%] flex flex-col gap-1">
											{#if lb.cr}
												<div class="flex items-center gap-1.5">
													<span class="text-[9px] font-bold px-1 py-0.5 rounded" style="background:#fc4c0222; color:#fc4c02; border:1px solid #fc4c0244;">KOM</span>
													<span class="text-[9px] text-gray-300 truncate flex-1">{lb.cr.athleteName}</span>
													<span class="text-[9px] font-mono" style="color:#fc4c02;">{lb.cr.time}</span>
												</div>
											{/if}
											{#if lb.qom}
												<div class="flex items-center gap-1.5">
													<span class="text-[9px] font-bold px-1 py-0.5 rounded" style="background:#a855f722; color:#a855f7; border:1px solid #a855f744;">QOM</span>
													<span class="text-[9px] text-gray-300 truncate flex-1">{lb.qom.athleteName}</span>
													<span class="text-[9px] font-mono" style="color:#a855f7;">{lb.qom.time}</span>
												</div>
											{/if}
											{#if !lb.cr && !lb.qom}
												<div class="text-[9px] text-gray-600 italic">No public records right now</div>
											{/if}
										</div>

										<div class="min-w-0 flex-1 border-l border-gray-800 pl-2">
											<div class="text-[8px] uppercase tracking-widest text-gray-600 mb-1">Visible Top 3</div>
											{#if topRows.length > 0}
												<div class="flex flex-col gap-0.5">
													{#each topRows as row}
														<div class="flex items-center gap-1.5 text-[9px]">
															<span class="w-4 text-right font-mono text-gray-600">#{row.displayRank}</span>
															<span class="truncate flex-1 text-gray-400">{row.athleteName}</span>
															<span class="font-mono text-gray-300">{row.time}</span>
														</div>
													{/each}
												</div>
											{:else}
												<div class="text-[9px] text-gray-600 italic">No public rows right now</div>
											{/if}
										</div>
									</div>
								{:else}
									<div class="text-[9px] text-gray-600 italic">Loading...</div>
								{/if}
							</div>
						{/each}

						{#if cyclingSegments.length === 0}
							<div class="text-xs text-gray-600 italic text-center py-4">No cycling segments loaded</div>
						{/if}
					</div>
				</TvScroller>
			</div>
		</div>

		<!-- Divider -->
		<div class="shrink-0 w-px bg-gray-800 self-stretch"></div>

		<!-- Running column -->
		<div class="flex-1 min-w-0 flex flex-col gap-1.5">
			<div class="shrink-0 text-xs font-bold uppercase tracking-widest" style="color:#2dd4bf;">Running</div>
			<div class="flex-1 min-h-0">
				<TvScroller screenId="leaderboards-running" {active} speed={16}>
					<div class="flex flex-col gap-1.5">
						{#each runningSegments as seg (seg.id)}
							{@const lb = getLeaderboard(seg.id)}
							{@const topRows = visibleTopRows(lb)}
							{@const distanceLabel = segmentDistanceLabel(seg, lb)}
							<div class="rounded-lg border border-gray-800 p-2" style="background:#111;">
								<!-- Segment header -->
								<div class="mb-0.5 flex items-center gap-2">
									<span class="flex-1 truncate text-[11px] font-semibold text-gray-100">{seg.name}</span>
									{#if distanceLabel}
										<span class="text-[9px] text-gray-500">{distanceLabel}</span>
									{/if}
								</div>

								{#if lb}
									<div class="flex gap-2 min-w-0">
										<div class="min-w-0 basis-[52%] flex flex-col gap-1">
											{#if lb.cr}
												<div class="flex items-center gap-1.5">
													<span class="text-[9px] font-bold px-1 py-0.5 rounded" style="background:#2dd4bf22; color:#2dd4bf; border:1px solid #2dd4bf44;">KOM</span>
													<span class="text-[9px] text-gray-300 truncate flex-1">{lb.cr.athleteName}</span>
													<span class="text-[9px] font-mono" style="color:#2dd4bf;">{lb.cr.time}</span>
												</div>
											{/if}
											{#if lb.qom}
												<div class="flex items-center gap-1.5">
													<span class="text-[9px] font-bold px-1 py-0.5 rounded" style="background:#a855f722; color:#a855f7; border:1px solid #a855f744;">QOM</span>
													<span class="text-[9px] text-gray-300 truncate flex-1">{lb.qom.athleteName}</span>
													<span class="text-[9px] font-mono" style="color:#a855f7;">{lb.qom.time}</span>
												</div>
											{/if}
											{#if !lb.cr && !lb.qom}
												<div class="text-[9px] text-gray-600 italic">No public records right now</div>
											{/if}
										</div>

										<div class="min-w-0 flex-1 border-l border-gray-800 pl-2">
											<div class="text-[8px] uppercase tracking-widest text-gray-600 mb-1">Visible Top 3</div>
											{#if topRows.length > 0}
												<div class="flex flex-col gap-0.5">
													{#each topRows as row}
														<div class="flex items-center gap-1.5 text-[9px]">
															<span class="w-4 text-right font-mono text-gray-600">#{row.displayRank}</span>
															<span class="truncate flex-1 text-gray-400">{row.athleteName}</span>
															<span class="font-mono text-gray-300">{row.time}</span>
														</div>
													{/each}
												</div>
											{:else}
												<div class="text-[9px] text-gray-600 italic">No public rows right now</div>
											{/if}
										</div>
									</div>
								{:else}
									<div class="text-[9px] text-gray-600 italic">Loading...</div>
								{/if}
							</div>
						{/each}

						{#if runningSegments.length === 0}
							<div class="text-xs text-gray-600 italic text-center py-4">No running segments loaded</div>
						{/if}
					</div>
				</TvScroller>
			</div>
		</div>

	</div>

	<!-- Recent events footer strip -->
	{#if recentEvents.length > 0}
		<div class="shrink-0 border-t border-gray-800 px-4 py-1 flex items-center gap-4">
			<span class="text-[9px] font-bold uppercase tracking-widest" style="color:#fc4c02;">Recent</span>
			{#each recentEvents as evt}
				<div class="flex items-center gap-1.5">
					<span class="text-[9px] font-bold px-1 py-0.5 rounded" style="background:#fc4c0222; color:#fc4c02; border:1px solid #fc4c0244;">
						{eventLabel(evt.type)}
					</span>
					<span class="text-[9px] text-gray-300 truncate max-w-[140px]">{evt.segmentName}</span>
					<span class="text-[9px] text-gray-400">{evt.athlete}</span>
					<span class="text-[9px] font-mono" style="color:#fc4c02;">{evt.time}</span>
					<span class="text-[9px] text-gray-600">{timeAgo(evt.detectedAt)}</span>
				</div>
			{/each}
		</div>
	{/if}

</div>

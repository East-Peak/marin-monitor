<script lang="ts">
	import { onMount } from 'svelte';
	import { stravaSegments, stravaEvents, stravaLeaderboards, loadStravaData, loadLeaderboard } from '$lib/stores/strava';
	import TvAutoScroll from '$lib/components/tv/TvAutoScroll.svelte';
	import type { StravaSegment, StravaLeaderboard } from '$lib/types/strava';

	// ---- Derived segment lists ----
	const cyclingSegments = $derived(
		$stravaSegments.segments
			.filter((s) => s.activityType === 'ride')
			.sort((a, b) => b.totalAttempts - a.totalAttempts)
			.slice(0, 8)
	);

	const runningSegments = $derived(
		$stravaSegments.segments
			.filter((s) => s.activityType === 'run')
			.sort((a, b) => b.totalAttempts - a.totalAttempts)
			.slice(0, 8)
	);

	// ---- Recent events for footer ----
	const recentEvents = $derived($stravaEvents.events.slice(0, 3));

	// ---- Climb category labels ----
	function categoryLabel(cat: number): string {
		if (cat === 0) return 'HC';
		if (cat === 1) return 'Cat 1';
		if (cat === 2) return 'Cat 2';
		if (cat === 3) return 'Cat 3';
		if (cat === 4) return 'Cat 4';
		return '';
	}

	function categoryColor(cat: number): string {
		if (cat === 0) return '#ef4444'; // HC — red
		if (cat === 1) return '#f97316'; // Cat 1 — orange
		if (cat === 2) return '#eab308'; // Cat 2 — yellow
		if (cat === 3) return '#22c55e'; // Cat 3 — green
		if (cat === 4) return '#60a5fa'; // Cat 4 — blue
		return '#6b7280';
	}

	// ---- Leaderboard lookup ----
	function getLeaderboard(segmentId: number): StravaLeaderboard | undefined {
		return $stravaLeaderboards.get(segmentId);
	}

	// ---- Lazy-load leaderboards for visible segments ----
	let loadedIds = $state(new Set<number>());

	async function maybeFetch(segment: StravaSegment) {
		if (loadedIds.has(segment.id)) return;
		loadedIds = new Set([...loadedIds, segment.id]);
		await loadLeaderboard(segment.id);
	}

	// ---- Mount: load catalog + events, then fetch leaderboards ----
	onMount(async () => {
		await loadStravaData();

		// Fetch leaderboards for visible segments (up to 16 total)
		const visible = [
			...$stravaSegments.segments
				.filter((s) => s.activityType === 'ride')
				.sort((a, b) => b.totalAttempts - a.totalAttempts)
				.slice(0, 8),
			...$stravaSegments.segments
				.filter((s) => s.activityType === 'run')
				.sort((a, b) => b.totalAttempts - a.totalAttempts)
				.slice(0, 8),
		];
		await Promise.all(visible.map((seg) => maybeFetch(seg)));
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

<div class="h-full flex flex-col" style="background:#0a0a0a; color:#f3f4f6;">

	<!-- Header -->
	<div class="shrink-0 px-4 py-2 flex items-center gap-3 border-b border-gray-800">
		<span class="text-lg font-bold tracking-wide" style="color:#fc4c02;">MARIN LEADERBOARDS</span>
		<span class="text-xs text-gray-500 uppercase tracking-widest">Strava KOMs &amp; Course Records</span>
	</div>

	<!-- Two-column body -->
	<div class="flex-1 min-h-0 flex gap-3 px-4 py-3">

		<!-- Cycling column -->
		<div class="flex-1 min-w-0 flex flex-col gap-2">
			<div class="shrink-0 text-xs font-bold uppercase tracking-widest" style="color:#f59e0b;">Cycling</div>
			<div class="flex-1 min-h-0">
				<TvAutoScroll speed={12}>
					<div class="flex flex-col gap-2">
						{#each cyclingSegments as seg (seg.id)}
							{@const lb = getLeaderboard(seg.id)}
							<div class="rounded-lg border border-gray-800 p-2.5" style="background:#111;">
								<!-- Segment header -->
								<div class="flex items-center gap-2 mb-1">
									<span class="text-xs font-semibold text-gray-100 truncate flex-1">{seg.name}</span>
									{#if seg.climbCategory > 0 || seg.climbCategory === 0 && seg.elevationGain > 50}
										<span
											class="text-[9px] font-bold px-1.5 py-0.5 rounded"
											style="background:{categoryColor(seg.climbCategory)}22; color:{categoryColor(seg.climbCategory)}; border:1px solid {categoryColor(seg.climbCategory)}44;"
										>
											{categoryLabel(seg.climbCategory)}
										</span>
									{/if}
									<span class="text-[9px] text-gray-500">{(seg.distance / 1000).toFixed(1)}km</span>
								</div>

								{#if lb}
									<!-- CR row -->
									{#if lb.cr}
										<div class="flex items-center gap-1.5 mb-1.5">
											<span class="text-[9px] font-bold px-1 py-0.5 rounded" style="background:#fc4c0222; color:#fc4c02; border:1px solid #fc4c0244;">KOM</span>
											<span class="text-[10px] text-gray-300 truncate flex-1">{lb.cr.athleteName}</span>
											<span class="text-[10px] font-mono" style="color:#fc4c02;">{lb.cr.time}</span>
										</div>
									{/if}

									<!-- Top 3 rows -->
									<div class="flex flex-col gap-0.5">
										{#each lb.rows.slice(0, 3) as row}
											<div class="flex items-center gap-1.5 text-[9px]">
												<span class="w-4 text-right font-mono text-gray-600">#{row.rank}</span>
												<span class="truncate flex-1 text-gray-400">{row.athleteName}</span>
												<span class="font-mono text-gray-300">{row.time}</span>
											</div>
										{/each}
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
				</TvAutoScroll>
			</div>
		</div>

		<!-- Divider -->
		<div class="shrink-0 w-px bg-gray-800 self-stretch"></div>

		<!-- Running column -->
		<div class="flex-1 min-w-0 flex flex-col gap-2">
			<div class="shrink-0 text-xs font-bold uppercase tracking-widest" style="color:#2dd4bf;">Running</div>
			<div class="flex-1 min-h-0">
				<TvAutoScroll speed={12}>
					<div class="flex flex-col gap-2">
						{#each runningSegments as seg (seg.id)}
							{@const lb = getLeaderboard(seg.id)}
							<div class="rounded-lg border border-gray-800 p-2.5" style="background:#111;">
								<!-- Segment header -->
								<div class="flex items-center gap-2 mb-1">
									<span class="text-xs font-semibold text-gray-100 truncate flex-1">{seg.name}</span>
									<span class="text-[9px] text-gray-500">{(seg.distance / 1000).toFixed(1)}km</span>
								</div>

								{#if lb}
									<!-- CR row -->
									{#if lb.cr}
										<div class="flex items-center gap-1.5 mb-1.5">
											<span class="text-[9px] font-bold px-1 py-0.5 rounded" style="background:#2dd4bf22; color:#2dd4bf; border:1px solid #2dd4bf44;">CR</span>
											<span class="text-[10px] text-gray-300 truncate flex-1">{lb.cr.athleteName}</span>
											<span class="text-[10px] font-mono" style="color:#2dd4bf;">{lb.cr.time}</span>
										</div>
									{/if}
									{#if lb.qom}
										<div class="flex items-center gap-1.5 mb-1.5">
											<span class="text-[9px] font-bold px-1 py-0.5 rounded" style="background:#a855f722; color:#a855f7; border:1px solid #a855f744;">QOM</span>
											<span class="text-[10px] text-gray-300 truncate flex-1">{lb.qom.athleteName}</span>
											<span class="text-[10px] font-mono" style="color:#a855f7;">{lb.qom.time}</span>
										</div>
									{/if}

									<!-- Top 3 rows -->
									<div class="flex flex-col gap-0.5">
										{#each lb.rows.slice(0, 3) as row}
											<div class="flex items-center gap-1.5 text-[9px]">
												<span class="w-4 text-right font-mono text-gray-600">#{row.rank}</span>
												<span class="truncate flex-1 text-gray-400">{row.athleteName}</span>
												<span class="font-mono text-gray-300">{row.time}</span>
											</div>
										{/each}
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
				</TvAutoScroll>
			</div>
		</div>

	</div>

	<!-- Recent events footer strip -->
	{#if recentEvents.length > 0}
		<div class="shrink-0 border-t border-gray-800 px-4 py-1.5 flex items-center gap-4">
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

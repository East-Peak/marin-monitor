<script lang="ts">
	import { TV_SCREENS } from '$lib/config/tv';

	interface Props {
		carouselIdx: number;
		paused: boolean;
		currentTemp: number | null;
		stories24h: number;
		alertCount: number;
		clockText: string;
		activeScreenName: string;
		activeScreenDescription: string;
		screenProgress: number;
		screenTimeLeftSeconds: number;
		onGoToScreen: (idx: number) => void;
	}

	let {
		carouselIdx,
		paused,
		currentTemp,
		stories24h,
		alertCount,
		clockText,
		activeScreenName,
		activeScreenDescription,
		screenProgress,
		screenTimeLeftSeconds,
		onGoToScreen
	}: Props = $props();
</script>

<header class="relative z-20 border-b border-slate-800/70 bg-slate-950/88 backdrop-blur-md">
	<div class="grid grid-cols-[auto,minmax(0,1fr),auto] items-center gap-4 px-5 py-3">
		<div class="flex min-w-0 items-center gap-3">
			<div class="flex min-w-0 flex-col">
				<span class="text-[10px] font-semibold uppercase tracking-[0.32em] text-sky-300/80">Live Wallboard</span>
				<h1
					class="truncate text-lg font-black tracking-[0.26em]"
					style="background: linear-gradient(135deg, #f8fafc 0%, #7dd3fc 45%, #f59e0b 100%); -webkit-background-clip: text; background-clip: text; color: transparent;"
				>
					MARIN MONITOR
				</h1>
			</div>
			{#if paused}
				<span class="rounded-full border border-amber-400/40 bg-amber-400/12 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-300">
					Paused
				</span>
			{/if}
		</div>

		<div class="min-w-0">
			<div class="flex items-center gap-3">
				<span class="shrink-0 rounded-full border border-slate-700 bg-slate-900/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
					Screen {carouselIdx + 1}/{TV_SCREENS.length}
				</span>
				<h2 class="truncate text-base font-semibold text-slate-100">{activeScreenName}</h2>
				<span class="shrink-0 text-xs font-medium tabular-nums text-slate-400">{screenTimeLeftSeconds}s left</span>
			</div>
			<p class="mt-1 truncate text-xs text-slate-400">{activeScreenDescription}</p>
			<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800/80">
				<div
					class="h-full rounded-full"
					style="width: {Math.max(0, Math.min(screenProgress * 100, 100))}%; background: linear-gradient(90deg, #38bdf8 0%, #f59e0b 100%);"
				></div>
			</div>
		</div>

		<div class="flex items-center gap-5">
			<div class="flex items-center gap-4 text-right">
				<div class="hidden min-[1120px]:block">
					<div class="text-[10px] uppercase tracking-[0.24em] text-slate-500">Now</div>
					<div class="text-sm font-semibold text-slate-200">{currentTemp !== null ? `${currentTemp}°F` : 'Weather --'}</div>
				</div>
				<div class="hidden min-[1120px]:block">
					<div class="text-[10px] uppercase tracking-[0.24em] text-slate-500">Feed</div>
					<div class="text-sm font-semibold text-slate-200">{stories24h} stories</div>
				</div>
				<div>
					<div class="text-[10px] uppercase tracking-[0.24em] text-slate-500">Alerts</div>
					<div class:text-red-300={alertCount > 0} class="text-sm font-semibold text-slate-200">
						{alertCount}
					</div>
				</div>
				<div>
					<div class="text-[10px] uppercase tracking-[0.24em] text-slate-500">Clock</div>
					<div class="text-sm font-medium tabular-nums text-slate-200">{clockText}</div>
				</div>
			</div>

			<div class="flex items-center gap-1.5 overflow-x-auto pb-0.5">
				{#each TV_SCREENS as screen, i (screen.id)}
					<button
						class="h-2.5 w-2.5 shrink-0 rounded-full border transition-all duration-200"
						class:border-sky-300={carouselIdx === i}
						class:border-slate-700={carouselIdx !== i}
						class:bg-sky-300={carouselIdx === i}
						class:bg-slate-700={carouselIdx !== i}
						aria-label={`Go to ${screen.name}`}
						onclick={() => onGoToScreen(i)}
						title={screen.name}
					></button>
				{/each}
			</div>
		</div>
	</div>
</header>

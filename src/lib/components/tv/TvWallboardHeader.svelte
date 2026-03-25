<script lang="ts">
	import { TV_SCREENS } from '$lib/config/tv';

	interface Props {
		carouselIdx: number;
		paused: boolean;
		currentTemp: number | null;
		stories24h: number;
		alertCount: number;
		clockText: string;
		onGoToScreen: (idx: number) => void;
	}

	let { carouselIdx, paused, currentTemp, stories24h, alertCount, clockText, onGoToScreen }: Props = $props();
</script>

<header class="h-12 flex items-center justify-between px-4 bg-gray-900/80 border-b border-gray-800/50 shrink-0 z-10">
	<div class="flex items-center gap-3">
		<h1 class="text-lg font-bold tracking-widest" style="background: linear-gradient(135deg, #f8fafc 0%, #0ea5e9 100%); -webkit-background-clip: text; background-clip: text; color: transparent;">MARIN MONITOR</h1>
		{#if paused}
			<span class="text-xs text-amber-400 font-medium">PAUSED</span>
		{/if}
	</div>
	<div class="flex items-center gap-3">
		{#if currentTemp !== null}
			<span class="text-xs text-gray-500">Now</span>
			<span class="text-sm text-gray-300 font-medium">{currentTemp}&deg;F</span>
		{/if}
		<span class="text-xs text-gray-500">{stories24h} stories</span>
		{#if alertCount > 0}
			<span class="text-xs text-red-400 font-medium">{alertCount} alerts</span>
		{/if}
	</div>
	<div class="flex items-center gap-4">
		<span class="text-sm text-gray-300 tabular-nums">{clockText}</span>
		<div class="flex items-center gap-1.5">
			{#each TV_SCREENS as screen, i (screen.id)}
				<button
					class="w-2.5 h-2.5 rounded-full transition-colors"
					class:bg-blue-400={carouselIdx === i}
					class:bg-gray-600={carouselIdx !== i}
					onclick={() => onGoToScreen(i)}
					title={screen.name}
				></button>
			{/each}
		</div>
	</div>
</header>

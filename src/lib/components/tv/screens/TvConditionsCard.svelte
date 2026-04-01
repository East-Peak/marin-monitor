<script lang="ts">
	interface Props {
		weather: { temp: number | null; wind: string | null; shortForecast: string | null } | null;
		aqi: { value: number; category: string } | null;
		tides: Array<{ time: string; height: number; type: 'H' | 'L' }>;
	}
	let { weather, aqi, tides }: Props = $props();

	function aqiColor(value: number): string {
		if (value <= 50) return 'text-green-400';
		if (value <= 100) return 'text-yellow-400';
		if (value <= 150) return 'text-orange-400';
		return 'text-red-400';
	}

	function formatTideTime(iso: string): string {
		try {
			const d = new Date(iso);
			return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
		} catch {
			return iso;
		}
	}
</script>

<div class="h-full flex flex-col px-12 py-8">
	<h2 class="text-lg font-medium uppercase tracking-widest text-zinc-400">Conditions</h2>

	<div class="mt-6 grid flex-1 grid-cols-3 gap-6">
		<!-- Weather -->
		<div class="rounded-xl bg-zinc-800/60 p-6 flex flex-col items-center justify-center text-center">
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">Weather</p>
			<p class="mt-3 text-5xl font-bold tabular-nums text-white">
				{weather?.temp != null ? `${weather.temp}\u00b0` : '\u2014'}
			</p>
			{#if weather?.shortForecast}
				<p class="mt-2 text-sm text-zinc-400">{weather.shortForecast}</p>
			{/if}
			{#if weather?.wind}
				<p class="mt-1 text-sm text-zinc-500">Wind: {weather.wind}</p>
			{/if}
		</div>

		<!-- Air Quality -->
		<div class="rounded-xl bg-zinc-800/60 p-6 flex flex-col items-center justify-center text-center">
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-500">Air Quality</p>
			<p class="mt-3 text-5xl font-bold tabular-nums {aqi ? aqiColor(aqi.value) : 'text-white'}">
				{aqi?.value ?? '\u2014'}
			</p>
			{#if aqi?.category}
				<p class="mt-2 text-sm text-zinc-400">{aqi.category}</p>
			{/if}
		</div>

		<!-- Tides -->
		<div class="rounded-xl bg-zinc-800/60 p-6">
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-500 text-center">Tides</p>
			<div class="mt-4 space-y-3">
				{#each tides.slice(0, 4) as tide}
					<div class="flex items-baseline justify-between">
						<span class="text-sm text-zinc-400">
							{tide.type === 'H' ? 'High' : 'Low'}
						</span>
						<span class="text-sm tabular-nums text-zinc-300">
							{formatTideTime(tide.time)}
						</span>
						<span class="text-lg font-bold tabular-nums text-white">
							{tide.height.toFixed(1)} ft
						</span>
					</div>
				{/each}
				{#if tides.length === 0}
					<p class="text-sm text-zinc-500 text-center">&mdash;</p>
				{/if}
			</div>
		</div>
	</div>
</div>

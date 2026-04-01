<script lang="ts">
	interface Props {
		weather: { temp: number | null; wind: string | null; shortForecast: string | null } | null;
		aqi: { value: number; category: string } | null;
		tides: Array<{ time: string; height: number; type: 'H' | 'L' }>;
	}
	let { weather, aqi, tides }: Props = $props();

	const CONDITIONS_BLUE = '#3b82f6';

	function aqiBgColor(value: number): string {
		if (value <= 50) return '#22c55e';
		if (value <= 100) return '#eab308';
		if (value <= 150) return '#f97316';
		return '#ef4444';
	}

	function aqiTextOnBg(value: number): string {
		// Yellow background needs dark text
		if (value > 50 && value <= 100) return '#18181b';
		return '#ffffff';
	}

	function tempColor(temp: number | null | undefined): string {
		if (temp == null) return '#ffffff';
		if (temp >= 90) return '#ef4444';
		if (temp >= 80) return '#f97316';
		if (temp >= 70) return '#f59e0b';
		if (temp >= 60) return '#fbbf24';
		if (temp >= 50) return '#a3e635';
		if (temp >= 40) return '#22d3ee';
		return '#60a5fa';
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
		<!-- Air Quality -->
		<div
			class="rounded-xl bg-zinc-800/60 flex flex-col items-center justify-center text-center p-6"
			style="border-top: 4px solid {CONDITIONS_BLUE}"
		>
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-400">Air Quality</p>

			{#if aqi}
				<!-- Circular AQI gauge -->
				<div
					class="mt-4 w-28 h-28 rounded-full flex flex-col items-center justify-center shadow-lg"
					style="background: {aqiBgColor(aqi.value)};"
				>
					<span
						class="text-5xl font-bold tabular-nums leading-none"
						style="color: {aqiTextOnBg(aqi.value)};"
					>
						{aqi.value}
					</span>
				</div>
				<p class="mt-3 text-base font-semibold text-zinc-300">{aqi.category}</p>
				<p class="mt-1 text-sm text-zinc-500">EPA AQI</p>
			{:else}
				<p class="mt-6 text-5xl font-bold text-zinc-600">&mdash;</p>
			{/if}
		</div>

		<!-- Weather -->
		<div
			class="rounded-xl bg-zinc-800/60 flex flex-col items-center justify-center text-center p-6"
			style="border-top: 4px solid {CONDITIONS_BLUE}"
		>
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-400">Weather</p>

			<p class="mt-4 text-7xl font-bold tabular-nums leading-none" style="color: {tempColor(weather?.temp)}">
				{weather?.temp != null ? `${weather.temp}\u00b0` : '\u2014'}
			</p>
			{#if weather?.shortForecast}
				<p class="mt-3 text-base text-zinc-300 leading-snug max-w-[200px]">{weather.shortForecast}</p>
			{/if}
			{#if weather?.wind}
				<p class="mt-2 text-sm text-zinc-500">Wind: {weather.wind}</p>
			{/if}
		</div>

		<!-- Tides -->
		<div
			class="rounded-xl bg-zinc-800/60 p-6 flex flex-col"
			style="border-top: 4px solid {CONDITIONS_BLUE}"
		>
			<p class="text-sm font-medium uppercase tracking-wider text-zinc-400 text-center">Tides</p>
			<div class="mt-4 flex-1 flex flex-col justify-center space-y-4">
				{#each tides.slice(0, 4) as tide}
					<div class="flex items-center gap-3">
						<!-- H/L badge -->
						<div
							class="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold text-white shrink-0"
							style="background: {tide.type === 'H' ? '#3b82f6' : '#14b8a6'};"
						>
							{tide.type}
						</div>
						<div class="flex-1 min-w-0">
							<p class="text-base font-medium text-zinc-300">
								{tide.type === 'H' ? 'High' : 'Low'}
							</p>
							<p class="text-sm tabular-nums text-zinc-500">
								{formatTideTime(tide.time)}
							</p>
						</div>
						<span class="text-2xl font-bold tabular-nums text-white shrink-0">
							{tide.height.toFixed(1)} <span class="text-base text-zinc-400">ft</span>
						</span>
					</div>
				{/each}
				{#if tides.length === 0}
					<p class="text-base text-zinc-500 text-center">&mdash;</p>
				{/if}
			</div>
		</div>
	</div>
</div>

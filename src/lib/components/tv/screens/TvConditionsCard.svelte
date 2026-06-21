<script lang="ts">
	interface HourlyPeriod {
		temperature: number;
		shortForecast?: string;
		startTime: string;
	}

	interface Props {
		weather: { temp: number | null; wind: string | null; shortForecast: string | null } | null;
		aqi: { value: number; category: string; pollutant?: string } | null;
		tides: Array<{ time: string; height: number; type: 'H' | 'L' }>;
		/** Optional hourly forecast periods for the mini-forecast strip */
		hourlyForecast?: HourlyPeriod[];
	}
	let { weather, aqi, tides, hourlyForecast = [] }: Props = $props();

	/** Extract high/low from the next 12 hours of hourly data */
	const forecastHiLo = $derived.by(() => {
		const temps = hourlyForecast.slice(0, 12).map((h) => h.temperature);
		if (temps.length === 0) return null;
		return { hi: Math.max(...temps), lo: Math.min(...temps) };
	});

	/** Next 4 hours for the mini-forecast strip */
	const nextHours = $derived(hourlyForecast.slice(1, 5));

	function formatHour(iso: string): string {
		try {
			const d = new Date(iso);
			return d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
		} catch {
			return '';
		}
	}

	/** Short health guidance based on AQI range */
	function aqiGuidance(value: number): string {
		if (value <= 50) return 'Air quality is satisfactory. No health concern.';
		if (value <= 100)
			return 'Acceptable. Sensitive individuals should limit prolonged outdoor exertion.';
		if (value <= 150)
			return 'Sensitive groups may experience effects. Limit prolonged outdoor exertion.';
		return 'Everyone may experience health effects. Avoid prolonged outdoor exertion.';
	}

	function aqiBgColor(value: number): string {
		if (value <= 50) return '#22c55e';
		if (value <= 100) return '#eab308';
		if (value <= 150) return '#f97316';
		return '#ef4444';
	}

	function aqiTextOnBg(value: number): string {
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

	/** Parse wind string into speed and direction if possible */
	function parseWind(wind: string | null): { speed: string; direction: string } | null {
		if (!wind) return null;
		// NWS format is typically "10 mph" or "S 10 mph" or "10 to 15 mph"
		const match = wind.match(/^([NSEW]{1,3})?\s*(\d+(?:\s*to\s*\d+)?)\s*mph$/i);
		if (match) {
			return {
				direction: match[1] ?? '',
				speed: match[2] + ' mph'
			};
		}
		return { speed: wind, direction: '' };
	}

	const windParsed = $derived(parseWind(weather?.wind ?? null));

	/** Friendly pollutant name */
	function pollutantLabel(pollutant: string | undefined): string {
		if (!pollutant) return '';
		const map: Record<string, string> = {
			'PM2.5': 'Fine Particles (PM2.5)',
			PM10: 'Coarse Particles (PM10)',
			O3: 'Ozone (O3)',
			NO2: 'Nitrogen Dioxide',
			SO2: 'Sulfur Dioxide',
			CO: 'Carbon Monoxide'
		};
		return map[pollutant] ?? pollutant;
	}

	/** Get next high and low tide for a compact summary */
	const nextHigh = $derived(tides.find((t) => t.type === 'H'));
	const nextLow = $derived(tides.find((t) => t.type === 'L'));
</script>

<div class="h-full flex flex-col overflow-hidden px-6 py-3">
	<h2 class="text-base font-semibold text-gray-100 mb-2 shrink-0">Conditions</h2>

	<div class="flex-1 grid grid-cols-3 gap-3 min-h-0">
		<!-- WEATHER COLUMN -->
		<div class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden">
			<!-- Header -->
			<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
				<div class="flex items-baseline justify-between">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
						>Weather</span
					>
					<span class="text-[10px] text-zinc-500">NWS</span>
				</div>
				<div class="flex items-baseline gap-2 mt-1">
					<span
						class="text-4xl font-bold tabular-nums leading-none"
						style="color: {tempColor(weather?.temp)}"
					>
						{weather?.temp != null ? `${weather.temp}\u00b0` : '\u2014'}
					</span>
					<span class="text-[10px] text-zinc-500">F</span>
				</div>
			</div>

			<!-- Forecast details -->
			<div class="flex-1 px-3 py-2 overflow-hidden">
				{#if weather?.shortForecast}
					<div class="mb-2">
						<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
							Forecast
						</div>
						<p class="text-sm text-zinc-200 leading-snug">{weather.shortForecast}</p>
					</div>
				{/if}

				{#if windParsed}
					<div class="mb-2">
						<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
							Wind
						</div>
						<div class="flex items-baseline gap-2">
							<span class="text-lg font-bold tabular-nums text-zinc-200">{windParsed.speed}</span>
							{#if windParsed.direction}
								<span class="text-xs text-zinc-400">{windParsed.direction}</span>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Hi/Lo from hourly forecast -->
				{#if forecastHiLo}
					<div class="mb-2">
						<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
							12h Range
						</div>
						<div class="flex items-baseline gap-3">
							<span class="text-xs text-zinc-400"
								>Lo <span
									class="text-sm font-bold tabular-nums"
									style="color: {tempColor(forecastHiLo.lo)}">{forecastHiLo.lo}&deg;</span
								></span
							>
							<span class="text-xs text-zinc-400"
								>Hi <span
									class="text-sm font-bold tabular-nums"
									style="color: {tempColor(forecastHiLo.hi)}">{forecastHiLo.hi}&deg;</span
								></span
							>
						</div>
					</div>
				{/if}

				<!-- Mini hourly forecast strip -->
				{#if nextHours.length > 0}
					<div class="mb-2 pt-2 border-t border-gray-700/30">
						<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
							Next Hours
						</div>
						<div class="grid grid-cols-4 gap-1">
							{#each nextHours as hour}
								<div class="text-center">
									<div class="text-[9px] text-zinc-500">{formatHour(hour.startTime)}</div>
									<div
										class="text-sm font-bold tabular-nums"
										style="color: {tempColor(hour.temperature)}"
									>
										{hour.temperature}&deg;
									</div>
									{#if hour.shortForecast}
										<div class="text-[8px] text-zinc-500 leading-tight line-clamp-1">
											{hour.shortForecast}
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Quick tide summary -->
				{#if nextHigh || nextLow}
					<div class="mt-auto pt-2 border-t border-gray-700/30">
						<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
							Next Tides
						</div>
						<div class="grid grid-cols-2 gap-2">
							{#if nextHigh}
								<div class="flex items-center gap-1.5">
									<span
										class="text-[9px] font-bold px-1 py-px rounded text-white"
										style="background: #3b82f6">H</span
									>
									<div>
										<span class="text-xs font-bold tabular-nums text-white"
											>{nextHigh.height.toFixed(1)}ft</span
										>
										<span class="text-[9px] text-zinc-500 ml-1"
											>{formatTideTime(nextHigh.time)}</span
										>
									</div>
								</div>
							{/if}
							{#if nextLow}
								<div class="flex items-center gap-1.5">
									<span
										class="text-[9px] font-bold px-1 py-px rounded text-white"
										style="background: #14b8a6">L</span
									>
									<div>
										<span class="text-xs font-bold tabular-nums text-white"
											>{nextLow.height.toFixed(1)}ft</span
										>
										<span class="text-[9px] text-zinc-500 ml-1">{formatTideTime(nextLow.time)}</span
										>
									</div>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- AQI COLUMN -->
		<div class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden">
			<!-- Header -->
			<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
				<div class="flex items-baseline justify-between">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400"
						>Air Quality</span
					>
					<span class="text-[10px] text-zinc-500">EPA AQI</span>
				</div>
			</div>

			<div class="flex-1 px-3 py-3 flex flex-col items-center justify-start overflow-hidden">
				{#if aqi}
					<!-- AQI value circle (smaller, not oversized) -->
					<div
						class="w-20 h-20 rounded-full flex flex-col items-center justify-center shadow-lg shrink-0"
						style="background: {aqiBgColor(aqi.value)};"
					>
						<span
							class="text-3xl font-bold tabular-nums leading-none"
							style="color: {aqiTextOnBg(aqi.value)};"
						>
							{aqi.value}
						</span>
					</div>
					<p class="mt-2 text-sm font-semibold text-zinc-200">{aqi.category}</p>

					<!-- Pollutant details -->
					{#if aqi.pollutant}
						<div class="mt-3 w-full border-t border-gray-700/30 pt-2">
							<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
								Primary Pollutant
							</div>
							<p class="text-xs text-zinc-300">{pollutantLabel(aqi.pollutant)}</p>
						</div>
					{/if}

					<!-- AQI scale reference -->
					<div class="mt-3 w-full border-t border-gray-700/30 pt-2">
						<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
							AQI Scale
						</div>
						<div class="space-y-1">
							{#each [{ min: 0, max: 50, label: 'Good', color: '#22c55e' }, { min: 51, max: 100, label: 'Moderate', color: '#eab308' }, { min: 101, max: 150, label: 'Unhealthy (Sensitive)', color: '#f97316' }, { min: 151, max: 300, label: 'Unhealthy', color: '#ef4444' }] as range}
								{@const isActive = aqi.value >= range.min && aqi.value <= range.max}
								<div class="flex items-center gap-1.5 {isActive ? 'opacity-100' : 'opacity-40'}">
									<div class="w-2 h-2 rounded-sm shrink-0" style="background: {range.color}"></div>
									<span class="text-[9px] text-zinc-300 flex-1">{range.label}</span>
									<span class="text-[9px] text-zinc-500 tabular-nums">{range.min}-{range.max}</span>
								</div>
							{/each}
						</div>
					</div>

					<!-- Health guidance -->
					<div class="mt-3 w-full border-t border-gray-700/30 pt-2">
						<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
							Guidance
						</div>
						<p class="text-[10px] text-zinc-400 leading-snug">{aqiGuidance(aqi.value)}</p>
					</div>
				{:else}
					<div class="flex-1 flex items-center justify-center">
						<p class="text-xs text-zinc-600">No AQI data available</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- TIDES COLUMN -->
		<div class="bg-gray-800/60 rounded-lg border border-gray-700/50 flex flex-col overflow-hidden">
			<!-- Header -->
			<div class="px-3 pt-3 pb-2 border-b border-gray-700/40">
				<div class="flex items-baseline justify-between">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Tides</span
					>
					<span class="text-[10px] text-zinc-500">Pt Reyes / SF Bar</span>
				</div>
			</div>

			<div class="flex-1 px-3 py-2 overflow-hidden">
				<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
					Today's Predictions
				</div>
				{#each tides.slice(0, 6) as tide}
					<div class="flex items-center gap-2 py-1 border-b border-gray-700/20">
						<!-- H/L badge -->
						<span
							class="text-[9px] font-bold px-1.5 py-0.5 rounded text-white shrink-0"
							style="background: {tide.type === 'H' ? '#3b82f6' : '#14b8a6'};"
						>
							{tide.type === 'H' ? 'HIGH' : 'LOW'}
						</span>
						<div class="flex-1 min-w-0">
							<span class="text-xs text-zinc-300 tabular-nums">
								{formatTideTime(tide.time)}
							</span>
						</div>
						<span class="text-sm font-bold tabular-nums text-white shrink-0">
							{tide.height.toFixed(1)} <span class="text-[10px] text-zinc-400">ft</span>
						</span>
					</div>
				{/each}
				{#if tides.length === 0}
					<p class="text-xs text-zinc-600 text-center py-4">No tide data available</p>
				{/if}

				<!-- Tide range summary -->
				{#if tides.length > 0}
					{@const heights = tides.slice(0, 6).map((t) => t.height)}
					{@const maxHeight = Math.max(...heights)}
					{@const minHeight = Math.min(...heights)}
					<div class="mt-2 pt-2 border-t border-gray-700/30">
						<div class="text-[9px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
							Range
						</div>
						<div class="flex items-center gap-2">
							<span class="text-xs text-emerald-400 tabular-nums font-medium"
								>{minHeight.toFixed(1)}ft</span
							>
							<div class="flex-1 h-1 rounded-full bg-zinc-700/50 relative">
								<div
									class="absolute inset-y-0 rounded-full"
									style="left: 0; right: 0; background: linear-gradient(to right, #14b8a6, #3b82f6);"
								></div>
							</div>
							<span class="text-xs text-blue-400 tabular-nums font-medium"
								>{maxHeight.toFixed(1)}ft</span
							>
						</div>
						<p class="text-[9px] text-zinc-500 mt-0.5 tabular-nums">
							{(maxHeight - minHeight).toFixed(1)}ft swing
						</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

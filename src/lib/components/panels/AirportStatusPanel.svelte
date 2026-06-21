<script lang="ts">
	import { Panel } from '$lib/components/common';
	import { fetchAirportStatus } from '$lib/api/marin/airport-status';
	import type {
		AirportStatusData,
		AirportStatus,
		AirportOperationalStatus,
		FlightCategory
	} from '$lib/types/airport';

	let data = $state<AirportStatusData | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const STATUS_COLORS: Record<AirportOperationalStatus, string> = {
		'on-time': '#22c55e',
		delays: '#f59e0b',
		'ground-delay': '#f97316',
		'ground-stop': '#ef4444',
		closed: '#6b7280'
	};

	const STATUS_BG: Record<AirportOperationalStatus, string> = {
		'on-time': 'rgba(34, 197, 94, 0.15)',
		delays: 'rgba(245, 158, 11, 0.15)',
		'ground-delay': 'rgba(249, 115, 22, 0.15)',
		'ground-stop': 'rgba(239, 68, 68, 0.15)',
		closed: 'rgba(107, 114, 128, 0.15)'
	};

	const STATUS_LABELS: Record<AirportOperationalStatus, string> = {
		'on-time': 'On Time',
		delays: 'Delays',
		'ground-delay': 'Ground Delay',
		'ground-stop': 'Ground Stop',
		closed: 'Closed'
	};

	const FLT_CAT_COLORS: Record<FlightCategory, string> = {
		VFR: '#22c55e',
		MVFR: '#3b82f6',
		IFR: '#ef4444',
		LIFR: '#991b1b'
	};

	const FLT_CAT_BG: Record<FlightCategory, string> = {
		VFR: 'rgba(34, 197, 94, 0.15)',
		MVFR: 'rgba(59, 130, 246, 0.15)',
		IFR: 'rgba(239, 68, 68, 0.15)',
		LIFR: 'rgba(153, 27, 27, 0.2)'
	};

	function delayTypeLabel(type: string): string {
		switch (type) {
			case 'ground-stop':
				return 'Ground Stop';
			case 'ground-delay':
				return 'Ground Delay';
			case 'arrival-delay':
				return 'Arrival Delay';
			case 'departure-delay':
				return 'Departure Delay';
			case 'closure':
				return 'Closed';
			default:
				return type;
		}
	}

	function windStr(airport: AirportStatus): string {
		if (!airport.weather) return '';
		const w = airport.weather;
		const dir = w.windDir;
		const spd = w.windSpeed;
		if (spd === 0) return 'Calm';
		const gust = w.windGust ? `g${w.windGust}` : '';
		return `${dir}\u00B0 ${spd}${gust} kt`;
	}

	function ceilingStr(ceiling: number | null): string {
		if (ceiling === null) return 'Clear';
		if (ceiling >= 10000) return `${(ceiling / 1000).toFixed(0)}k ft`;
		return `${ceiling.toLocaleString()} ft`;
	}

	function formatTime(iso: string): string {
		if (!iso) return '';
		return new Date(iso).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit',
			timeZone: 'America/Los_Angeles'
		});
	}

	$effect(() => {
		loading = true;
		error = null;
		fetchAirportStatus()
			.then((result) => {
				data = result;
			})
			.catch((err) => {
				error = (err as Error).message;
			})
			.finally(() => {
				loading = false;
			});
	});
</script>

<Panel id="airport-status" title="Airport Status" variant="default" {loading} {error}>
	{#if data}
		<div class="airport-list">
			{#each data.airports as airport (airport.code)}
				<div class="airport-card">
					<!-- Header -->
					<div class="airport-header">
						<div class="airport-id">
							<span class="airport-code">{airport.code}</span>
							<span class="airport-name">{airport.name}</span>
						</div>
						<span
							class="status-chip"
							style="color: {STATUS_COLORS[airport.status]}; background: {STATUS_BG[
								airport.status
							]}"
						>
							{STATUS_LABELS[airport.status]}
						</span>
					</div>

					<!-- Delay details -->
					{#if airport.delays.length > 0}
						<div class="delay-section">
							{#each airport.delays as delay}
								<div class="delay-row">
									<span class="delay-type">{delayTypeLabel(delay.type)}</span>
									{#if delay.reason}
										<span class="delay-reason">{delay.reason}</span>
									{/if}
									{#if delay.avgDelay || delay.maxDelay}
										<span class="delay-time">
											{delay.avgDelay ?? ''}{delay.maxDelay ? ` (max ${delay.maxDelay})` : ''}
										</span>
									{/if}
									{#if delay.endTime}
										<span class="delay-end">Until {delay.endTime}</span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					<!-- Weather -->
					{#if airport.weather}
						<div class="weather-row">
							<span
								class="flt-cat-badge"
								style="color: {FLT_CAT_COLORS[airport.weather.fltCat]}; background: {FLT_CAT_BG[
									airport.weather.fltCat
								]}"
							>
								{airport.weather.fltCat}
							</span>
							<span class="wx-item" title="Visibility">{airport.weather.visibility}</span>
							<span class="wx-item" title="Ceiling">{ceilingStr(airport.weather.ceiling)}</span>
							<span class="wx-item" title="Wind">{windStr(airport)}</span>
							{#if airport.weather.fogRisk}
								<span class="fog-badge">Fog Risk</span>
							{/if}
						</div>
					{/if}

					<!-- Forecast notes -->
					{#if airport.forecastNotes.length > 0}
						<div class="forecast-notes">
							{#each airport.forecastNotes as note}
								<div class="forecast-note" style="color: {FLT_CAT_COLORS[note.fltCat]}">
									{note.text}
								</div>
							{/each}
						</div>
					{/if}

					<!-- TSA wait times -->
					{#if airport.tsa && airport.tsa.length > 0}
						<div class="tsa-section">
							{#each airport.tsa as wt}
								<div class="tsa-row">
									<span class="tsa-checkpoint">{wt.checkpoint}</span>
									<span class="tsa-wait">{wt.waitMinutes} min</span>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<div class="airport-footer">
			Updated {formatTime(data.lastUpdated)}
		</div>
	{:else if !loading}
		<div class="empty-state">Airport data unavailable.</div>
	{/if}
</Panel>

<style>
	.airport-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.airport-card {
		padding: 0.45rem 0.5rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.airport-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.4rem;
	}

	.airport-id {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		min-width: 0;
	}

	.airport-code {
		font-size: 0.68rem;
		font-weight: 700;
		color: var(--text);
		letter-spacing: 0.02em;
	}

	.airport-name {
		font-size: 0.52rem;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.status-chip {
		font-size: 0.46rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.delay-section {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		padding: 0.3rem 0.35rem;
		background: rgba(239, 68, 68, 0.06);
		border-radius: 3px;
	}

	.delay-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.5rem;
	}

	.delay-type {
		font-weight: 600;
		color: var(--text);
	}

	.delay-reason {
		color: var(--text-muted);
	}

	.delay-time {
		color: #f59e0b;
		font-weight: 500;
	}

	.delay-end {
		color: var(--text-dim);
	}

	.weather-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
	}

	.flt-cat-badge {
		font-size: 0.46rem;
		font-weight: 700;
		padding: 0.08rem 0.3rem;
		border-radius: 3px;
		letter-spacing: 0.03em;
	}

	.wx-item {
		font-size: 0.5rem;
		color: var(--text-secondary);
	}

	.fog-badge {
		font-size: 0.42rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		padding: 0.06rem 0.25rem;
		border-radius: 2px;
		color: #f59e0b;
		background: rgba(245, 158, 11, 0.12);
	}

	.forecast-notes {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.forecast-note {
		font-size: 0.48rem;
		font-style: italic;
	}

	.tsa-section {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding-top: 0.2rem;
		border-top: 1px solid rgba(255, 255, 255, 0.04);
	}

	.tsa-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.48rem;
	}

	.tsa-checkpoint {
		color: var(--text-muted);
	}

	.tsa-wait {
		color: var(--text);
		font-weight: 500;
	}

	.airport-footer {
		margin-top: 0.4rem;
		padding-top: 0.35rem;
		border-top: 1px solid var(--border);
		font-size: 0.48rem;
		color: var(--text-muted);
		text-align: center;
	}

	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 0.7rem;
		padding: 1rem;
	}
</style>

<script lang="ts">
	import { Panel } from '$lib/components/common';
	import { fetchObservedWeather } from '$lib/api/marin/open-meteo';
	import { fetchHourlyForecast } from '$lib/api/marin/nws-hourly';
	import { computeHeroDirt } from '$lib/analysis/indicators';
	import { townLocation } from '$lib/stores/town-filter';
	import type { HeroDirtScore } from '$lib/analysis/indicators';

	let score = $state<HeroDirtScore | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	function dryingLabel(rate: number): string {
		if (rate >= 0.75) return 'Fast';
		if (rate >= 0.5) return 'Moderate';
		if (rate >= 0.25) return 'Slow';
		return 'Very Slow';
	}

	function moisturePosition(moisture: number): number {
		return Math.max(0, Math.min(100, moisture));
	}

	// Re-fetch when town location changes
	$effect(() => {
		const loc = $townLocation;
		const lat = loc.lat;
		const lon = loc.lon;
		loading = true;
		error = null;
		Promise.all([fetchObservedWeather(lat, lon), fetchHourlyForecast(lat, lon)])
			.then(([observed, forecast]) => {
				score = computeHeroDirt(observed, forecast);
			})
			.catch((err) => {
				error = (err as Error).message;
			})
			.finally(() => {
				loading = false;
			});
	});
</script>

<Panel id="conditions" title="Hero Dirt Tracker" variant="outdoors" {loading} {error}>
	{#if score}
		<div class="conditions-layout">
			<!-- Top: Score circle + label/summary -->
			<div class="hero-row">
				<div class="score-ring">
					<svg viewBox="0 0 100 100" class="ring-svg">
						<circle
							cx="50"
							cy="50"
							r="42"
							fill="none"
							stroke="rgba(255,255,255,0.06)"
							stroke-width="6"
						/>
						<circle
							cx="50"
							cy="50"
							r="42"
							fill="none"
							stroke={score.color}
							stroke-width="6"
							stroke-linecap="round"
							stroke-dasharray={`${(score.score / 100) * 264} 264`}
							transform="rotate(-90 50 50)"
						/>
					</svg>
					<div class="score-value" style="color: {score.color}">
						{score.score}
					</div>
				</div>

				<div class="hero-info">
					<div class="hero-label-row">
						<span class="hero-label" style="color: {score.color}">
							{score.label}
						</span>
						<span class="source-badge" class:source-soil={score.moistureSource === 'soil-sensor'}>
							{score.moistureSource === 'soil-sensor' ? 'Soil Data' : 'Rain Model'}
						</span>
					</div>
					<div class="hero-summary">{score.summary}</div>
				</div>
			</div>

			<!-- Moisture spectrum bar -->
			<div class="spectrum-section">
				<div class="spectrum-bar">
					<div class="spectrum-zone spectrum-dry"></div>
					<div class="spectrum-zone spectrum-sweet"></div>
					<div class="spectrum-zone spectrum-wet"></div>
					<div class="spectrum-indicator" style="left: {moisturePosition(score.moistureEstimate)}%">
						<div class="indicator-dot" style="background: {score.color}"></div>
					</div>
				</div>
				<div class="spectrum-labels">
					<span>Dry</span>
					<span class="sweet-label">Sweet Spot</span>
					<span>Wet</span>
				</div>
			</div>

			<!-- Trail Intel -->
			{#if score.trailIntel.length > 0}
				<div class="intel-section">
					<div class="section-label">Trail Intel</div>
					{#each score.trailIntel as item}
						<div class="intel-row" class:intel-primary={item.relevance === 'primary'}>
							<span class="intel-icon">{item.icon}</span>
							<div class="intel-content">
								<span class="intel-title">{item.label}</span>
								<span class="intel-detail">{item.detail}</span>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Compact stats -->
			<div class="stats-section">
				<div class="stats-row">
					<div class="stat">
						<span class="stat-label">Moisture</span>
						<span class="stat-value">{score.moistureEstimate}%</span>
					</div>
					<div class="stat">
						<span class="stat-label">Baseline</span>
						<span class="stat-value">{score.seasonalBaseline}%</span>
					</div>
					<div class="stat">
						<span class="stat-label">Drying</span>
						<span class="stat-value">{dryingLabel(score.dryingRate)}</span>
					</div>
				</div>
			</div>
		</div>
	{/if}
</Panel>

<style>
	.conditions-layout {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* --- Hero row --- */
	.hero-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.score-ring {
		position: relative;
		width: 72px;
		height: 72px;
		flex-shrink: 0;
	}

	.ring-svg {
		width: 100%;
		height: 100%;
	}

	.score-value {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.25rem;
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	.hero-info {
		flex: 1;
		min-width: 0;
	}

	.hero-label-row {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}

	.hero-label {
		font-size: 0.82rem;
		font-weight: 700;
		letter-spacing: 0.01em;
	}

	.source-badge {
		font-size: 0.46rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.3rem;
		border-radius: 2px;
		color: var(--text-muted);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
	}

	.source-badge.source-soil {
		color: #22c55e;
		border-color: rgba(34, 197, 94, 0.25);
		background: rgba(34, 197, 94, 0.08);
	}

	.hero-summary {
		margin-top: 0.15rem;
		font-size: 0.62rem;
		color: var(--text-muted);
		line-height: 1.35;
	}

	/* --- Moisture spectrum bar --- */
	.spectrum-section {
		padding: 0 0.15rem;
	}

	.spectrum-bar {
		position: relative;
		height: 8px;
		border-radius: 4px;
		display: flex;
		overflow: visible;
	}

	.spectrum-zone {
		height: 100%;
	}

	.spectrum-dry {
		flex: 20;
		background: linear-gradient(90deg, #6b7280, #a8a29e);
		border-radius: 4px 0 0 4px;
	}

	.spectrum-sweet {
		flex: 25;
		background: linear-gradient(90deg, #22c55e, #06b6d4);
	}

	.spectrum-wet {
		flex: 55;
		background: linear-gradient(90deg, #eab308, #f97316);
		border-radius: 0 4px 4px 0;
	}

	.spectrum-indicator {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 1;
	}

	.indicator-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 2px solid rgba(0, 0, 0, 0.6);
		box-shadow: 0 0 4px rgba(0, 0, 0, 0.4);
	}

	.spectrum-labels {
		display: flex;
		justify-content: space-between;
		margin-top: 0.2rem;
		font-size: 0.48rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.sweet-label {
		color: #22c55e;
	}

	/* --- Trail Intel --- */
	.intel-section {
		border-top: 1px solid var(--border);
		padding-top: 0.5rem;
	}

	.section-label {
		font-size: 0.56rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		margin-bottom: 0.35rem;
	}

	.intel-row {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		padding: 0.25rem 0.3rem;
		margin-bottom: 0.2rem;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.02);
	}

	.intel-row.intel-primary {
		background: rgba(255, 255, 255, 0.04);
		border-left: 2px solid rgba(255, 255, 255, 0.12);
	}

	.intel-icon {
		font-size: 0.72rem;
		flex-shrink: 0;
		line-height: 1;
		margin-top: 0.05rem;
	}

	.intel-content {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		min-width: 0;
	}

	.intel-title {
		font-size: 0.6rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.intel-detail {
		font-size: 0.52rem;
		color: var(--text-muted);
		line-height: 1.3;
	}

	/* --- Compact stats --- */
	.stats-section {
		border-top: 1px solid var(--border);
		padding-top: 0.4rem;
	}

	.stats-row {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
	}

	.stat-label {
		font-size: 0.46rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}

	.stat-value {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--text-secondary);
	}
</style>

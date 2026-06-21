<script lang="ts">
	import { Panel } from '$lib/components/common';
	import { fetchWastewaterData } from '$lib/api/marin/wastewater';
	import type { WastewaterData, WastewaterPathogen } from '$lib/types';

	let data = $state<WastewaterData | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const STATUS_COLORS: Record<WastewaterPathogen['status'], string> = {
		high: '#ef4444',
		moderate: '#f59e0b',
		low: '#22c55e',
		'not-detected': '#64748b'
	};

	const STATUS_BG: Record<WastewaterPathogen['status'], string> = {
		high: 'rgba(239, 68, 68, 0.15)',
		moderate: 'rgba(245, 158, 11, 0.15)',
		low: 'rgba(34, 197, 94, 0.12)',
		'not-detected': 'rgba(100, 116, 139, 0.1)'
	};

	const TREND_ARROWS: Record<WastewaterPathogen['trendDirection'], string> = {
		rising: '\u2197',
		falling: '\u2198',
		stable: '\u2192'
	};

	function statusLabel(status: WastewaterPathogen['status']): string {
		if (status === 'not-detected') return 'ND';
		return status.charAt(0).toUpperCase() + status.slice(1);
	}

	function formatDate(dateStr: string): string {
		if (!dateStr) return 'N/A';
		return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		});
	}

	function sparklinePath(trend: number[], width: number, height: number): string {
		if (trend.length < 2) return '';
		const max = Math.max(...trend);
		const min = Math.min(...trend);
		const range = max - min || 1;
		const stepX = width / (trend.length - 1);
		const pad = 2;
		const innerH = height - pad * 2;

		return trend
			.map((v, i) => {
				const x = i * stepX;
				const y = pad + innerH - ((v - min) / range) * innerH;
				return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
			})
			.join(' ');
	}

	$effect(() => {
		loading = true;
		error = null;
		fetchWastewaterData()
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

<Panel id="wastewater" title="Pathogen Watch" variant="default" {loading} {error}>
	{#if data}
		<div class="pathogen-list">
			{#each data.pathogens as pathogen (pathogen.id)}
				<div class="pathogen-row">
					<div class="pathogen-info">
						<span class="pathogen-name">{pathogen.label}</span>
						<span
							class="pathogen-status"
							style="color: {STATUS_COLORS[pathogen.status]}; background: {STATUS_BG[
								pathogen.status
							]}"
						>
							{statusLabel(pathogen.status)}
						</span>
						<span
							class="pathogen-trend"
							style="color: {STATUS_COLORS[pathogen.status]}"
							title={pathogen.trendDirection}
						>
							{TREND_ARROWS[pathogen.trendDirection]}
						</span>
					</div>
					<div class="pathogen-sparkline">
						{#if pathogen.trend.length >= 2}
							<svg viewBox="0 0 60 16" class="sparkline-svg">
								<path
									d={sparklinePath(pathogen.trend, 60, 16)}
									fill="none"
									stroke={STATUS_COLORS[pathogen.status]}
									stroke-width="1.2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						{:else}
							<span class="no-trend">--</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>

		<div class="wastewater-footer">
			{data.sewershedCount} plants · Updated {formatDate(data.lastUpdated)}
		</div>
	{:else if !loading}
		<div class="empty-state">Wastewater data unavailable.</div>
	{/if}
</Panel>

<style>
	.pathogen-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.pathogen-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.4rem 0.45rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.pathogen-info {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}

	.pathogen-name {
		font-size: 0.62rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
	}

	.pathogen-status {
		font-size: 0.48rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.1rem 0.35rem;
		border-radius: 3px;
		white-space: nowrap;
	}

	.pathogen-trend {
		font-size: 0.65rem;
		line-height: 1;
	}

	.pathogen-sparkline {
		flex-shrink: 0;
		width: 60px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: flex-end;
	}

	.sparkline-svg {
		width: 60px;
		height: 16px;
		display: block;
	}

	.no-trend {
		font-size: 0.5rem;
		color: var(--text-dim);
	}

	.wastewater-footer {
		margin-top: 0.5rem;
		padding-top: 0.4rem;
		border-top: 1px solid var(--border);
		font-size: 0.5rem;
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

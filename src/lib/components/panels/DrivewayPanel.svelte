<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchDrivewayData } from '$lib/api/marin/driveway';
	import { drivewayStore } from '$lib/stores/driveway';
	import {
		DRIVEWAY_ACCENT,
		FUEL_TYPE_LABELS,
		FUEL_TYPE_COLORS,
		FUEL_TYPE_ORDER
	} from '$lib/config/driveway';
	import type { DrivewayData, FuelBreakdown } from '$lib/types/driveway';

	let data = $state<DrivewayData>({ current: null, history: [] });
	let dataLoading = $state(false);
	let showAllMakes = $state(false);

	const current = $derived(data.current);

	// Show top 10 makes by default, expandable to all
	const visibleMakes = $derived.by(() => {
		if (!current?.topMakes) return [];
		return showAllMakes ? current.topMakes : current.topMakes.slice(0, 10);
	});

	// Max count for bar scaling
	const maxMakeCount = $derived(current?.topMakes[0]?.count ?? 1);

	// Non-gasoline fuel types for the breakdown (gasoline gets its own stat)
	const altFuelTypes = $derived.by<FuelBreakdown[]>(() => {
		if (!current?.fuelBreakdown) return [];
		return current.fuelBreakdown.filter((f) => f.fuelType !== 'gasoline');
	});

	// Gasoline percentage for headline stat
	const gasPct = $derived(
		current?.fuelBreakdown.find((f) => f.fuelType === 'gasoline')?.pct ?? 0
	);

	// EV share (BEV + PHEV)
	const evShare = $derived.by(() => {
		if (!current?.fuelBreakdown) return 0;
		const bev = current.fuelBreakdown.find((f) => f.fuelType === 'battery-electric')?.pct ?? 0;
		const phev = current.fuelBreakdown.find((f) => f.fuelType === 'plug-in-hybrid')?.pct ?? 0;
		return Math.round((bev + phev) * 100) / 100;
	});

	function formatNumber(n: number): string {
		return n.toLocaleString('en-US');
	}

	onMount(() => {
		void (async () => {
			dataLoading = true;
			try {
				data = await fetchDrivewayData();
				drivewayStore.set(data);
			} finally {
				dataLoading = false;
			}
		})();
	});
</script>

<Panel id="driveway" title="The Marin Driveway Index" loading={dataLoading}>
	{#if current}
		<!-- Headline stats -->
		<div class="stats-grid">
			<div class="stat-card">
				<div class="stat-value" style:color={DRIVEWAY_ACCENT}>{formatNumber(current.totalVehicles)}</div>
				<div class="stat-label">Registered Vehicles</div>
			</div>
			<div class="stat-card">
				<div class="stat-value" style:color={DRIVEWAY_ACCENT}>{gasPct}%</div>
				<div class="stat-label">Gasoline</div>
			</div>
			<div class="stat-card">
				<div class="stat-value" style:color={FUEL_TYPE_COLORS['battery-electric']}>{evShare}%</div>
				<div class="stat-label">EV (BEV + PHEV)</div>
			</div>
		</div>

		<!-- Fuel type breakdown bar -->
		<div class="fuel-section">
			<div class="section-label">Fuel Type Breakdown</div>
			<div class="fuel-bar">
				{#each FUEL_TYPE_ORDER as ft}
					{@const entry = current.fuelBreakdown.find((f) => f.fuelType === ft)}
					{#if entry && entry.pct >= 0.5}
						<div
							class="fuel-segment"
							style:width={`${entry.pct}%`}
							style:background={FUEL_TYPE_COLORS[ft]}
							title={`${FUEL_TYPE_LABELS[ft]}: ${formatNumber(entry.count)} (${entry.pct}%)`}
						></div>
					{/if}
				{/each}
			</div>
			<div class="fuel-legend">
				{#each current.fuelBreakdown as entry}
					<div class="legend-item">
						<span class="legend-dot" style:background={FUEL_TYPE_COLORS[entry.fuelType]}></span>
						<span class="legend-text">{FUEL_TYPE_LABELS[entry.fuelType]}</span>
						<span class="legend-count">{formatNumber(entry.count)}</span>
						<span class="legend-pct">{entry.pct}%</span>
					</div>
				{/each}
			</div>
		</div>

		<!-- Fun stats callouts -->
		<div class="fun-stats">
			<div class="section-label">Spotted in Marin</div>
			<div class="fun-grid">
				<div class="fun-card">
					<span class="fun-value">{formatNumber(current.funStats.tesla)}</span>
					<span class="fun-label">Teslas (#3 overall)</span>
				</div>
				<div class="fun-card">
					<span class="fun-value">{formatNumber(current.funStats.porsche)}</span>
					<span class="fun-label">Porsches</span>
				</div>
				<div class="fun-card">
					<span class="fun-value">{formatNumber(current.funStats.rivian)}</span>
					<span class="fun-label">Rivians</span>
				</div>
				<div class="fun-card">
					<span class="fun-value">{formatNumber(current.funStats.lucid)}</span>
					<span class="fun-label">Lucids</span>
				</div>
				<div class="fun-card hydrogen">
					<span class="fun-value">{formatNumber(current.funStats.hydrogen)}</span>
					<span class="fun-label">Hydrogen vehicles (yes, {numberToWord(current.funStats.hydrogen)})</span>
				</div>
			</div>
		</div>

		<!-- Top makes ranked list -->
		<div class="makes-section">
			<div class="section-label">Top Makes Registered</div>
			{#each visibleMakes as make, i}
				<div class="make-row">
					<div class="make-rank">#{i + 1}</div>
					<div class="make-info">
						<span class="make-name">{make.make}</span>
						<div class="make-bar-track">
							<div
								class="make-bar-fill"
								style:width={`${(make.count / maxMakeCount) * 100}%`}
							></div>
						</div>
					</div>
					<span class="make-count">{formatNumber(make.count)}</span>
				</div>
			{/each}
			{#if current.topMakes.length > 10}
				<button class="show-more" onclick={() => (showAllMakes = !showAllMakes)}>
					{showAllMakes ? 'Show less' : `Show all ${current.topMakes.length} makes`}
				</button>
			{/if}
		</div>

		<!-- Attribution -->
		<div class="attribution">
			Source: California DMV Vehicle Fuel Type Count by Zip Code ({current.dataYear}) via data.ca.gov
		</div>
	{:else if dataLoading}
		<div class="empty-state">Loading vehicle registration data...</div>
	{:else}
		<div class="empty-state">Driveway data will appear after the first sync cycle.</div>
	{/if}
</Panel>

<script module lang="ts">
	/** Convert a small number to a word for playful display */
	function numberToWord(n: number): string {
		const words: Record<number, string> = {
			1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five',
			6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten',
			11: 'eleven', 12: 'twelve', 13: 'thirteen', 14: 'fourteen',
			15: 'fifteen', 16: 'sixteen', 17: 'seventeen', 18: 'eighteen',
			19: 'nineteen', 20: 'twenty', 30: 'thirty', 40: 'forty',
			50: 'fifty', 60: 'sixty', 68: 'sixty-eight', 70: 'seventy',
			80: 'eighty', 90: 'ninety'
		};
		if (words[n]) return words[n];
		if (n < 100) {
			const tens = Math.floor(n / 10) * 10;
			const ones = n % 10;
			return `${words[tens] ?? tens}-${words[ones] ?? ones}`;
		}
		return String(n);
	}
</script>

<style>
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.stat-card {
		text-align: center;
		padding: 0.55rem 0.35rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.stat-value {
		font-size: 1rem;
		font-weight: 700;
		letter-spacing: 0.01em;
	}

	.stat-label {
		font-size: 0.48rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 0.15rem;
	}

	.fuel-section {
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.section-label {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin-bottom: 0.35rem;
	}

	.fuel-bar {
		display: flex;
		height: 18px;
		border-radius: 3px;
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.fuel-segment {
		height: 100%;
		min-width: 2px;
		transition: opacity 0.15s;
	}

	.fuel-segment:hover {
		opacity: 0.8;
	}

	.fuel-legend {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.25rem 0.75rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.5rem;
	}

	.legend-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.legend-text {
		color: var(--text-muted);
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.legend-count {
		color: var(--text);
		font-weight: 600;
		white-space: nowrap;
	}

	.legend-pct {
		color: var(--text-dim);
		white-space: nowrap;
	}

	.fun-stats {
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.fun-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.4rem;
	}

	.fun-card {
		display: flex;
		flex-direction: column;
		padding: 0.4rem 0.5rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.fun-card.hydrogen {
		grid-column: 1 / -1;
		text-align: center;
		background: rgba(6, 182, 212, 0.06);
		border-color: rgba(6, 182, 212, 0.12);
	}

	.fun-value {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text);
	}

	.fun-label {
		font-size: 0.48rem;
		color: var(--text-dim);
	}

	.makes-section {
		margin-bottom: 0.5rem;
	}

	.make-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.22rem 0;
	}

	.make-rank {
		font-size: 0.48rem;
		color: var(--text-dim);
		width: 1.4rem;
		text-align: right;
		flex-shrink: 0;
	}

	.make-info {
		flex: 1;
		min-width: 0;
	}

	.make-name {
		font-size: 0.58rem;
		font-weight: 600;
		color: var(--text);
	}

	.make-bar-track {
		height: 3px;
		background: rgba(255, 255, 255, 0.06);
		border-radius: 1.5px;
		margin-top: 0.12rem;
	}

	.make-bar-fill {
		height: 100%;
		background: #6366f1;
		border-radius: 1.5px;
		transition: width 0.3s ease;
	}

	.make-count {
		font-size: 0.55rem;
		font-weight: 600;
		color: var(--text-muted);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.show-more {
		display: block;
		width: 100%;
		padding: 0.35rem;
		margin-top: 0.3rem;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.03);
		color: var(--text-muted);
		font-size: 0.5rem;
		cursor: pointer;
		text-align: center;
		transition: background 0.15s, color 0.15s;
	}

	.show-more:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text);
	}

	.attribution {
		text-align: center;
		font-size: 0.45rem;
		color: var(--text-dim);
		padding-top: 0.3rem;
		line-height: 1.4;
	}

	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 0.7rem;
		padding: 1rem;
	}

	@media (max-width: 1100px) {
		.stats-grid {
			grid-template-columns: 1fr;
		}

		.fuel-legend {
			grid-template-columns: 1fr;
		}

		.fun-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { Panel } from '$lib/components/common';
	import { fetchEvChargingData } from '$lib/api/marin/ev-charging';
	import { evChargingStore } from '$lib/stores/ev-charging';
	import { townFilter, selectedTownObj } from '$lib/stores/town-filter';
	import { findNearestTown } from '$lib/geo';
	import type { EvChargingData, ChargingStation, ConnectorType } from '$lib/types/ev-charging';

	type SummaryCard = {
		label: string;
		value: string;
		detail: string;
		tone?: 'default' | 'positive' | 'warning';
	};

	let data = $state<EvChargingData>({ current: null, history: [] });
	let dataLoading = $state(false);

	const current = $derived(data.current);

	// Filter stations by selected town (proximity match)
	const filteredStations = $derived.by<ChargingStation[]>(() => {
		if (!current?.stations) return [];
		if (!$townFilter) return current.stations;
		return current.stations.filter((s) => findNearestTown(s.lat, s.lon) === $townFilter);
	});

	const topNetworks = $derived.by<[string, number][]>(() => {
		if (filteredStations.length === 0) return [];
		const breakdown: Record<string, number> = {};
		for (const s of filteredStations) {
			breakdown[s.network] = (breakdown[s.network] ?? 0) + 1;
		}
		return Object.entries(breakdown)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5);
	});

	const connectorEntries = $derived.by<[ConnectorType, number][]>(() => {
		if (filteredStations.length === 0) return [];
		const breakdown: Partial<Record<ConnectorType, number>> = {};
		for (const s of filteredStations) {
			for (const c of s.connectors) {
				breakdown[c.type] = (breakdown[c.type] ?? 0) + c.count;
			}
		}
		return Object.entries(breakdown)
			.filter(([, count]) => count > 0)
			.sort((a, b) => b[1] - a[1]) as [ConnectorType, number][];
	});

	const fastestStations = $derived.by<ChargingStation[]>(() => {
		return [...filteredStations]
			.filter((s) => s.connectors.some((c) => c.powerKw))
			.sort((a, b) => {
				const maxA = Math.max(...a.connectors.map((c) => c.powerKw ?? 0));
				const maxB = Math.max(...b.connectors.map((c) => c.powerKw ?? 0));
				return maxB - maxA;
			})
			.slice(0, 3);
	});

	const pricedStations = $derived.by<ChargingStation[]>(() => {
		return filteredStations.filter((s) => s.pricingInfo).slice(0, 3);
	});

	const summaryCards = $derived.by<SummaryCard[]>(() => {
		if (!current) return [];

		const townName = $selectedTownObj?.name;
		const topNetwork = topNetworks[0];
		const dcFastCount = filteredStations.filter((s) => s.dcFastCount > 0).length;
		const totalPorts = filteredStations.reduce((sum, s) => sum + s.totalPorts, 0);

		return [
			{
				label: 'Total Stations',
				value: String(filteredStations.length),
				detail: townName ? `In ${townName}` : 'Across Marin County',
				tone: 'default' as const
			},
			{
				label: 'DC Fast',
				value: String(dcFastCount),
				detail: 'High-speed charging',
				tone: 'positive' as const
			},
			{
				label: 'Top Network',
				value: topNetwork ? topNetwork[0] : 'N/A',
				detail: topNetwork ? `${topNetwork[1]} stations` : 'No data',
				tone: 'default' as const
			},
			{
				label: 'Total Ports',
				value: String(totalPorts),
				detail: 'All connector types',
				tone: 'default' as const
			}
		];
	});

	function connectorLabel(type: ConnectorType): string {
		switch (type) {
			case 'J1772':
				return 'J1772 (Level 2)';
			case 'CCS':
				return 'CCS (DC Fast)';
			case 'CHAdeMO':
				return 'CHAdeMO (DC Fast)';
			case 'NACS':
				return 'NACS / Tesla';
			default:
				return 'Other';
		}
	}

	function stationLevel(station: ChargingStation): string {
		return station.chargingLevels.includes('DCFast') ? 'DC Fast' : 'Level 2';
	}

	onMount(() => {
		void (async () => {
			dataLoading = true;
			try {
				data = await fetchEvChargingData();
				evChargingStore.set(data);
			} finally {
				dataLoading = false;
			}
		})();
	});
</script>

<Panel id="ev-charging" title="EV Charging" loading={dataLoading}>
	{#if current}
		<div class="snapshot-bar">
			<div class="metric">
				<span class="metric-value">{current.stationCount}</span>
				<span class="metric-label">Stations</span>
			</div>
			<div class="metric">
				<span class="metric-value">{current.dcFastStationCount}</span>
				<span class="metric-label">DC Fast</span>
			</div>
			<div class="metric">
				<span class="metric-value">{current.level2StationCount}</span>
				<span class="metric-label">Level 2</span>
			</div>
			<div class="metric">
				<span class="metric-value">{Object.keys(current.networkBreakdown).length}</span>
				<span class="metric-label">Networks</span>
			</div>
		</div>
	{/if}

	{#if dataLoading && !current}
		<div class="chart-loading">Loading EV charging data...</div>
	{:else if !current && !dataLoading}
		<div class="empty-state">EV charging data will appear after the first sync cycle.</div>
	{/if}

	{#if summaryCards.length > 0}
		<div class="market-summary">
			{#each summaryCards as card}
				<div class={`summary-card ${card.tone ?? 'default'}`}>
					<div class="summary-label">{card.label}</div>
					<div class="summary-value">{card.value}</div>
					<div class="summary-detail">{card.detail}</div>
				</div>
			{/each}
		</div>
	{/if}

	{#if topNetworks.length > 0}
		<div class="breakdown-section">
			<div class="section-label">Top Networks</div>
			{#each topNetworks as [network, count]}
				<div class="breakdown-row">
					<span class="breakdown-name">{network}</span>
					<span class="breakdown-count">{count}</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if connectorEntries.length > 0}
		<div class="breakdown-section">
			<div class="section-label">Connector Types</div>
			{#each connectorEntries as [type, count]}
				<div class="breakdown-row">
					<span class="breakdown-name">{connectorLabel(type)}</span>
					<span class="breakdown-count">{count}</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if fastestStations.length > 0}
		<div class="station-list-section">
			<div class="section-label">Fastest Chargers</div>
			{#each fastestStations as station}
				<div class="station-row">
					<div class="station-info">
						<span class="station-name">{station.name}</span>
						<span class="station-address">{station.network} &middot; {stationLevel(station)}</span>
					</div>
					<span class="station-badge positive">
						{Math.max(...station.connectors.map((c) => c.powerKw ?? 0))} kW
					</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if pricedStations.length > 0}
		<div class="station-list-section">
			<div class="section-label">Stations with Pricing</div>
			{#each pricedStations as station}
				<div class="station-row">
					<div class="station-info">
						<span class="station-name">{station.name}</span>
						<span class="station-address">{station.network}</span>
					</div>
					<span class="station-badge">{station.pricingInfo}</span>
				</div>
			{/each}
		</div>
	{/if}
</Panel>

<style>
	.snapshot-bar {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
		gap: 0.55rem;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
	}

	.metric {
		text-align: center;
		padding: 0.65rem 0.45rem 0.55rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.metric-value {
		display: block;
		font-size: 1.1rem;
		font-weight: 700;
		color: #a855f7;
		letter-spacing: 0.01em;
	}

	.metric-label {
		display: block;
		font-size: 0.58rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 0.18rem;
	}

	.section-label {
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin-bottom: 0.3rem;
	}

	.market-summary {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.summary-card {
		padding: 0.55rem 0.6rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.04);
		border-radius: 4px;
	}

	.summary-card.positive {
		background: rgba(168, 85, 247, 0.08);
	}

	.summary-card.warning {
		background: rgba(245, 158, 11, 0.08);
	}

	.summary-label {
		font-size: 0.52rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.summary-value {
		margin-top: 0.14rem;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--text);
	}

	.summary-detail {
		margin-top: 0.12rem;
		font-size: 0.54rem;
		line-height: 1.35;
		color: var(--text-dim);
	}

	.breakdown-section {
		margin-bottom: 0.65rem;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--border);
	}

	.breakdown-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.25rem 0;
	}

	.breakdown-name {
		font-size: 0.62rem;
		color: var(--text);
	}

	.breakdown-count {
		font-size: 0.62rem;
		font-weight: 700;
		color: #a855f7;
	}

	.station-list-section {
		margin-bottom: 0.65rem;
		padding-bottom: 0.55rem;
		border-bottom: 1px solid var(--border);
	}

	.station-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.35rem 0;
	}

	.station-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.station-name {
		font-size: 0.62rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.station-address {
		font-size: 0.52rem;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.station-badge {
		font-size: 0.58rem;
		font-weight: 600;
		margin-left: 0.5rem;
		white-space: nowrap;
		color: var(--text-dim);
	}

	.station-badge.positive {
		color: #a855f7;
	}

	.chart-loading {
		font-size: 0.6rem;
		color: var(--text-muted);
		text-align: center;
		padding: 0.5rem;
	}

	.empty-state {
		text-align: center;
		color: var(--text-dim);
		font-size: 0.7rem;
		padding: 1rem;
	}

	@media (max-width: 1100px) {
		.market-summary {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>

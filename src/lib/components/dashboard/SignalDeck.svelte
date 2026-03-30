<script lang="ts">
	import {
		WeatherPanel,
		TidesPanel,
		PulsePanel,
		OutlooksPanel,
		SignalsPanel,
		HousingPanel,
		GasPricesPanel,
		EvChargingPanel,
		EnvironmentPanel,
		ConditionsPanel,
		WastewaterPanel,
		AirportStatusPanel,
		CappuccinoPanel,
		GroceryBasketPanel,
		WineIndexPanel,
		SchoolTuitionPanel,
		FitnessPanel,
		DrivewayPanel,
		CompositePanel
	} from '$lib/components/panels';
	import { settings, allNewsItems } from '$lib/stores';
	import type { WeatherData, FireWeatherAlert, EarthquakeData } from '$lib/types';
	import type { PanelId } from '$lib/config';

	interface Props {
		weatherForecast: (WeatherData & { name: string })[];
		weatherAlerts: FireWeatherAlert[];
		weatherLoading: boolean;
		weatherError: string | null;
		userLocation: { lat: number; lon: number; name: string; tideStation?: string; tideStationName?: string };
		earthquakesRaw: EarthquakeData[];
		isPanelVisible: (id: PanelId) => boolean;
	}

	let { weatherForecast, weatherAlerts, weatherLoading, weatherError, userLocation, earthquakesRaw, isPanelVisible }: Props = $props();

	type PanelEntry = {
		key: string;
		visible: boolean;
		className: string;
		component: any;
		props: any;
	};

	const leftColumnPanels = $derived.by<PanelEntry[]>(() => [
		{
			key: 'composite',
			visible: isPanelVisible('composite'),
			className: 'signal-composite animate-enter-up stagger-1 hover-lift',
			component: CompositePanel,
			props: {}
		},
		{
			key: 'pulse',
			visible: isPanelVisible('pulse'),
			className: 'signal-pulse animate-enter-up stagger-1 hover-lift',
			component: PulsePanel,
			props: { forecast: weatherForecast, weatherAlerts, earthquakes: earthquakesRaw }
		},
		{
			key: 'wine-index',
			visible: isPanelVisible('wine-index'),
			className: 'signal-wine-index animate-enter-up stagger-2 hover-lift',
			component: WineIndexPanel,
			props: {}
		},
		{
			key: 'conditions',
			visible: isPanelVisible('conditions'),
			className: 'signal-conditions animate-enter-up stagger-3 hover-lift',
			component: ConditionsPanel,
			props: {}
		},
		{
			key: 'airport-status',
			visible: isPanelVisible('airport-status'),
			className: 'signal-airport-status animate-enter-up stagger-3 hover-lift',
			component: AirportStatusPanel,
			props: {}
		},
		{
			key: 'wastewater',
			visible: isPanelVisible('wastewater'),
			className: 'signal-wastewater animate-enter-up stagger-3 hover-lift',
			component: WastewaterPanel,
			props: {}
		},
		{
			key: 'signals',
			visible: isPanelVisible('narrative') || isPanelVisible('correlation'),
			className: 'signal-signals animate-enter-up stagger-4 hover-lift',
			component: SignalsPanel,
			props: { news: $allNewsItems }
		}
	]);

	const middleColumnPanels = $derived.by<PanelEntry[]>(() => [
		{
			key: 'weather',
			visible: isPanelVisible('weather'),
			className: 'signal-weather animate-enter-up stagger-1 hover-lift',
			component: WeatherPanel,
			props: {
				forecast: weatherForecast,
				alerts: weatherAlerts,
				loading: weatherLoading,
				error: weatherError,
				locationLat: userLocation.lat,
				locationLon: userLocation.lon,
				locationName: userLocation.name
			}
		},
		{
			key: 'outlooks',
			visible: isPanelVisible('weather'),
			className: 'signal-outlooks animate-enter-up stagger-2 hover-lift',
			component: OutlooksPanel,
			props: {
				forecast: weatherForecast,
				loading: weatherLoading,
				error: weatherError,
				locationLat: userLocation.lat,
				locationLon: userLocation.lon
			}
		},
		{
			key: 'tides',
			visible: isPanelVisible('weather'),
			className: 'signal-tides animate-enter-up stagger-3 hover-lift',
			component: TidesPanel,
			props: {
				tideStation: userLocation.tideStation,
				tideStationName: userLocation.tideStationName,
				locationLat: userLocation.lat,
				locationLon: userLocation.lon
			}
		},
		{
			key: 'environment',
			visible: isPanelVisible('weather'),
			className: 'signal-environment animate-enter-up stagger-4 hover-lift',
			component: EnvironmentPanel,
			props: {}
		},
		{
			key: 'housing',
			visible: isPanelVisible('housing'),
			className: 'signal-housing animate-enter-up stagger-4 hover-lift',
			component: HousingPanel,
			props: {}
		},
		{
			key: 'cappuccino',
			visible: isPanelVisible('cappuccino'),
			className: 'signal-cappuccino animate-enter-up stagger-4 hover-lift',
			component: CappuccinoPanel,
			props: {}
		},
		{
			key: 'school-tuition',
			visible: isPanelVisible('school-tuition'),
			className: 'signal-school-tuition animate-enter-up stagger-4 hover-lift',
			component: SchoolTuitionPanel,
			props: {}
		}
	]);

	const rightColumnPanels = $derived.by<PanelEntry[]>(() => [
		{
			key: 'gas-prices',
			visible: isPanelVisible('gas-prices'),
			className: 'signal-gas-prices animate-enter-up stagger-2 hover-lift',
			component: GasPricesPanel,
			props: {}
		},
		{
			key: 'grocery-basket',
			visible: isPanelVisible('grocery-basket'),
			className: 'signal-grocery-basket animate-enter-up stagger-3 hover-lift',
			component: GroceryBasketPanel,
			props: {}
		},
		{
			key: 'ev-charging',
			visible: isPanelVisible('ev-charging'),
			className: 'signal-ev-charging animate-enter-up stagger-3 hover-lift',
			component: EvChargingPanel,
			props: {}
		},
		{
			key: 'fitness',
			visible: isPanelVisible('fitness'),
			className: 'signal-fitness animate-enter-up stagger-4 hover-lift',
			component: FitnessPanel,
			props: {}
		},
		{
			key: 'driveway',
			visible: isPanelVisible('driveway'),
			className: 'signal-driveway animate-enter-up stagger-4 hover-lift',
			component: DrivewayPanel,
			props: {}
		}
	]);
</script>

<!-- Dashboard collapse toggle -->
<button class="dash-toggle" onclick={() => settings.toggleDashboard()}>
	<span class="dash-toggle-line"></span>
	<span class="dash-toggle-label">
		{$settings.dashboardExpanded ? 'Hide' : 'Show'} Dashboard
		<span class="dash-toggle-chevron">{$settings.dashboardExpanded ? '\u25B4' : '\u25BE'}</span>
	</span>
	<span class="dash-toggle-line"></span>
</button>

<!-- Signal deck -->
<div class="signal-layout" class:collapsed={!$settings.dashboardExpanded}>
	<div class="signal-column signal-column-left">
		{#each leftColumnPanels as panel (panel.key)}
			{#if panel.visible}
				<div class={`signal-card ${panel.className}`}>
					<panel.component {...panel.props} />
				</div>
			{/if}
		{/each}
	</div>

	<div class="signal-column signal-column-middle">
		{#each middleColumnPanels as panel (panel.key)}
			{#if panel.visible}
				<div class={`signal-card ${panel.className}`}>
					<panel.component {...panel.props} />
				</div>
			{/if}
		{/each}
	</div>

	<div class="signal-column signal-column-right">
		{#each rightColumnPanels as panel (panel.key)}
			{#if panel.visible}
				<div class={`signal-card ${panel.className}`}>
					<panel.component {...panel.props} />
				</div>
			{/if}
		{/each}
	</div>
</div>

<style>
	.dash-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0;
		border: none;
		background: none;
		cursor: pointer;
		color: var(--text-dim);
		font-size: 0.55rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		transition: color 0.2s;
	}

	.dash-toggle:hover {
		color: var(--text-secondary);
	}

	.dash-toggle-line {
		flex: 1;
		height: 1px;
		background: rgba(255, 255, 255, 0.06);
	}

	.dash-toggle-label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
	}

	.dash-toggle-chevron {
		font-size: 0.5rem;
	}

	.signal-layout {
		display: grid;
		grid-template-columns: 1fr 1.2fr 1fr;
		gap: 1rem;
		margin-top: 0.5rem;
		transition: all 0.3s ease;
	}

	.signal-layout.collapsed {
		display: none;
	}

	.signal-column {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.signal-card {
		min-width: 0;
	}

	@media (max-width: 1320px) {
		.signal-layout {
			grid-template-columns: 1fr;
		}

		.signal-column {
			display: contents;
		}
	}
</style>

<script lang="ts">
	import { settings } from '$lib/stores';
	import { allNewsItems } from '$lib/stores';
	import type { PanelId } from '$lib/config/panels';
	import type { WeatherData, FireWeatherAlert, EarthquakeData } from '$lib/types';
	import {
		PulsePanel,
		WeatherPanel,
		OutlooksPanel,
		TidesPanel,
		EnvironmentPanel,
		ConditionsPanel,
		AirportStatusPanel,
		WastewaterPanel,
		HousingPanel,
		GasPricesPanel,
		EvChargingPanel,
		SignalsPanel,
		CappuccinoPanel,
		GroceryBasketPanel,
		WineIndexPanel,
		SchoolTuitionPanel,
		FitnessPanel,
		DrivewayPanel,
		CompositePanel
	} from '$lib/components/panels';

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
		{#if isPanelVisible('composite')}
			<div class="signal-card signal-composite animate-enter-up stagger-1 hover-lift">
				<CompositePanel />
			</div>
		{/if}

		{#if isPanelVisible('pulse')}
			<div class="signal-card signal-pulse animate-enter-up stagger-1 hover-lift">
				<PulsePanel forecast={weatherForecast} {weatherAlerts} earthquakes={earthquakesRaw} />
			</div>
		{/if}

		{#if isPanelVisible('wine-index')}
			<div class="signal-card signal-wine-index animate-enter-up stagger-2 hover-lift">
				<WineIndexPanel />
			</div>
		{/if}

		{#if isPanelVisible('conditions')}
			<div class="signal-card signal-conditions animate-enter-up stagger-3 hover-lift">
				<ConditionsPanel />
			</div>
		{/if}

		{#if isPanelVisible('airport-status')}
			<div class="signal-card signal-airport-status animate-enter-up stagger-3 hover-lift">
				<AirportStatusPanel />
			</div>
		{/if}

		{#if isPanelVisible('wastewater')}
			<div class="signal-card signal-wastewater animate-enter-up stagger-3 hover-lift">
				<WastewaterPanel />
			</div>
		{/if}

		{#if isPanelVisible('narrative') || isPanelVisible('correlation')}
			<div class="signal-card signal-signals animate-enter-up stagger-4 hover-lift">
				<SignalsPanel news={$allNewsItems} />
			</div>
		{/if}
	</div>

	<div class="signal-column signal-column-middle">
		{#if isPanelVisible('weather')}
			<div class="signal-card signal-weather animate-enter-up stagger-1 hover-lift">
				<WeatherPanel
					forecast={weatherForecast}
					alerts={weatherAlerts}
					loading={weatherLoading}
					error={weatherError}
					locationLat={userLocation.lat}
					locationLon={userLocation.lon}
					locationName={userLocation.name}
				/>
			</div>
		{/if}

		{#if isPanelVisible('weather')}
			<div class="signal-card signal-outlooks animate-enter-up stagger-2 hover-lift">
				<OutlooksPanel
					forecast={weatherForecast}
					loading={weatherLoading}
					error={weatherError}
					locationLat={userLocation.lat}
					locationLon={userLocation.lon}
				/>
			</div>
		{/if}

		{#if isPanelVisible('weather')}
			<div class="signal-card signal-tides animate-enter-up stagger-3 hover-lift">
				<TidesPanel
					tideStation={userLocation.tideStation}
					tideStationName={userLocation.tideStationName}
					locationLat={userLocation.lat}
					locationLon={userLocation.lon}
				/>
			</div>
		{/if}

		{#if isPanelVisible('weather')}
			<div class="signal-card signal-environment animate-enter-up stagger-4 hover-lift">
				<EnvironmentPanel />
			</div>
		{/if}

		{#if isPanelVisible('housing')}
			<div class="signal-card signal-housing animate-enter-up stagger-4 hover-lift">
				<HousingPanel />
			</div>
		{/if}

		{#if isPanelVisible('cappuccino')}
			<div class="signal-card signal-cappuccino animate-enter-up stagger-4 hover-lift">
				<CappuccinoPanel />
			</div>
		{/if}

		{#if isPanelVisible('school-tuition')}
			<div class="signal-card signal-school-tuition animate-enter-up stagger-4 hover-lift">
				<SchoolTuitionPanel />
			</div>
		{/if}
	</div>

	<div class="signal-column signal-column-right">
		{#if isPanelVisible('gas-prices')}
			<div class="signal-card signal-gas-prices animate-enter-up stagger-2 hover-lift">
				<GasPricesPanel />
			</div>
		{/if}

		{#if isPanelVisible('grocery-basket')}
			<div class="signal-card signal-grocery-basket animate-enter-up stagger-3 hover-lift">
				<GroceryBasketPanel />
			</div>
		{/if}

		{#if isPanelVisible('ev-charging')}
			<div class="signal-card signal-ev-charging animate-enter-up stagger-3 hover-lift">
				<EvChargingPanel />
			</div>
		{/if}

		{#if isPanelVisible('fitness')}
			<div class="signal-card signal-fitness animate-enter-up stagger-4 hover-lift">
				<FitnessPanel />
			</div>
		{/if}

		{#if isPanelVisible('driveway')}
			<div class="signal-card signal-driveway animate-enter-up stagger-4 hover-lift">
				<DrivewayPanel />
			</div>
		{/if}
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
		color: var(--text-secondary);
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		transition: color 0.2s;
	}
	.dash-toggle:hover {
		color: var(--text-primary);
	}
	.dash-toggle-line {
		flex: 1;
		height: 1px;
		background: var(--border-subtle);
	}
	.dash-toggle-label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		white-space: nowrap;
	}
	.dash-toggle-chevron {
		font-size: 0.6rem;
	}
	.signal-layout {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
		padding: 0.5rem 0;
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
		background: var(--card-bg);
		border: 1px solid var(--border-subtle);
		border-radius: 0.5rem;
		padding: 0.75rem;
		transition: border-color 0.2s;
	}
	.hover-lift:hover {
		border-color: var(--border-hover);
	}
	.animate-enter-up {
		animation: enter-up 0.3s ease-out both;
	}
	.stagger-1 { animation-delay: 0ms; }
	.stagger-2 { animation-delay: 50ms; }
	.stagger-3 { animation-delay: 100ms; }
	.stagger-4 { animation-delay: 150ms; }
	@keyframes enter-up {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@media (max-width: 1024px) {
		.signal-layout {
			grid-template-columns: 1fr 1fr;
		}
	}
	@media (max-width: 640px) {
		.signal-layout {
			grid-template-columns: 1fr;
		}
	}
</style>

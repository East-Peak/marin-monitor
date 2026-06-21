<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import TvScreen from './TvScreen.svelte';
	import TvChyron from './TvChyron.svelte';
	import TvWallboardHeader from './TvWallboardHeader.svelte';
	import TvMapScreen from './screens/TvMapScreen.svelte';
	import NewsWireScreen from './screens/NewsWireScreen.svelte';
	import SafetyScreen from './screens/SafetyScreen.svelte';
	import TvCameraClusterScreen from './screens/TvCameraClusterScreen.svelte';
	import TvCommunityScreen from './screens/TvCommunityScreen.svelte';
	import TvLeaderboardsScreen from './screens/TvLeaderboardsScreen.svelte';
	import TvCompositeHero from './screens/TvCompositeHero.svelte';
	import TvDailyLifeCard from './screens/TvDailyLifeCard.svelte';
	import TvLifestyleCard from './screens/TvLifestyleCard.svelte';
	import TvStructuralCard from './screens/TvStructuralCard.svelte';
	import TvDrivewayCard from './screens/TvDrivewayCard.svelte';
	import Tv311PhotoWall from './screens/Tv311PhotoWall.svelte';
	import TvConditionsCard from './screens/TvConditionsCard.svelte';
	import TvOutdoorsCard from './screens/TvOutdoorsCard.svelte';
	import { loadStravaData } from '$lib/stores/strava';
	import { TV_SCREENS, TV_MAP_VIEWS, CURSOR_HIDE_MS, TV_REFRESH_INTERVAL_MS } from '$lib/config/tv';
	import { refresh, allNewsItems, alerts, mapStore, settings, threeOneOneNews } from '$lib/stores';
	import { townFilter } from '$lib/stores/town-filter';
	import {
		fetchFireIncidents,
		fetchAirQuality,
		fetchStreamGauges,
		fetchObservedWeather
	} from '$lib/api/marin';
	import { fetchTidePredictions } from '$lib/api/marin/tides';
	import { loadAllNews } from '$lib/api/marin/load-all';
	import { fetchHourlyForecast } from '$lib/api/marin/nws-hourly';
	import { fetchCompositeDataWithStatus } from '$lib/api/marin/composite';
	import { fetchCappuccinoDataWithStatus } from '$lib/api/marin/cappuccino';
	import { fetchGroceryBasketDataWithStatus } from '$lib/api/marin/grocery-basket';
	import { fetchWineIndexDataWithStatus } from '$lib/api/marin/wine-index';
	import { fetchFitnessDataWithStatus } from '$lib/api/marin/fitness';
	import { fetchSchoolTuitionDataWithStatus } from '$lib/api/marin/school-tuition';
	import { fetchDrivewayDataWithStatus } from '$lib/api/marin/driveway';
	import { fetchGasPriceDataWithStatus } from '$lib/api/marin/gas-prices';
	import { fetchHousingDataWithStatus } from '$lib/api/marin/housing';
	import { computeHeroDirt } from '$lib/analysis/indicators';
	import { tvIndexData } from '$lib/stores/tv';
	import type { NewsItem, AirQualityData, TidePrediction } from '$lib/types';
	import type { CompositeData } from '$lib/types/composite';
	import type { CoffeeData } from '$lib/types/coffee';
	import type { GroceryBasketData } from '$lib/types/grocery';
	import type { WineIndexData } from '$lib/types/wine';
	import type { FitnessData } from '$lib/types/fitness';
	import type { SchoolIndexData } from '$lib/types/school';
	import type { DrivewayData } from '$lib/types/driveway';
	import type { GasPriceData } from '$lib/types/gas';
	import type { HousingMetric } from '$lib/api/marin/housing';
	import type { StreamGauge } from '$lib/api/marin/streams';
	import type { HeroDirtScore } from '$lib/analysis/indicators';
	import { initSwipe, progressSwipe, commitSwipe, shouldBailSwipe, type SwipeState } from './swipe';

	// --- Index data state ---
	let compositeData = $state<CompositeData | null>(null);
	let cappuccinoData = $state<CoffeeData | null>(null);
	let groceryData = $state<GroceryBasketData | null>(null);
	let wineData = $state<WineIndexData | null>(null);
	let fitnessData = $state<FitnessData | null>(null);
	let tuitionData = $state<SchoolIndexData | null>(null);
	let drivewayData = $state<DrivewayData | null>(null);
	let gasData = $state<GasPriceData | null>(null);
	let housingData = $state<HousingMetric[]>([]);

	// --- Conditions & outdoors data state ---
	let aqiData = $state<AirQualityData | null>(null);
	let tidePredictions = $state<TidePrediction[]>([]);
	let streamGauges = $state<StreamGauge[]>([]);
	let heroDirt = $state<HeroDirtScore | null>(null);

	// 311 items from the store (for 311 photo wall and map overlay)
	const threeOneOneItems = $derived($threeOneOneNews.items ?? []);

	// --- Carousel state ---
	// Uses a single setInterval that ticks every second and checks elapsed time.
	// This is more robust than recursive setTimeout which can get lost if
	// component lifecycle events (MapContainer destroy/create) cause errors.
	let carouselIdx = $state(0);
	let paused = $state(false);
	let carouselTimer: ReturnType<typeof setInterval> | null = null;
	let screenStartedAt = Date.now();

	/** Check if a screen should be skipped (e.g., 311-photos with no photos) */
	function shouldSkipScreen(idx: number): boolean {
		const screen = TV_SCREENS[idx];
		if (screen.id === '311-photos') {
			const photoItems = threeOneOneItems.filter((i) => i.imageUrl);
			return photoItems.length === 0;
		}
		return false;
	}

	/** Find the next valid screen index, skipping screens with no content */
	function nextValidIdx(fromIdx: number, direction: 1 | -1 = 1): number {
		let nextIdx = (fromIdx + direction + TV_SCREENS.length) % TV_SCREENS.length;
		let attempts = 0;
		while (shouldSkipScreen(nextIdx) && attempts < TV_SCREENS.length) {
			nextIdx = (nextIdx + direction + TV_SCREENS.length) % TV_SCREENS.length;
			attempts++;
		}
		return nextIdx;
	}

	function advanceCarousel() {
		if (paused) return;
		const duration = TV_SCREENS[carouselIdx]?.durationMs ?? 20_000;
		if (Date.now() - screenStartedAt >= duration) {
			carouselIdx = nextValidIdx(carouselIdx, 1);
			screenStartedAt = Date.now();
		}
	}

	function nextScreen() {
		carouselIdx = nextValidIdx(carouselIdx, 1);
		screenStartedAt = Date.now();
	}

	function prevScreen() {
		carouselIdx = nextValidIdx(carouselIdx, -1);
		screenStartedAt = Date.now();
	}

	function goToScreen(idx: number) {
		let targetIdx = idx;
		if (shouldSkipScreen(targetIdx)) {
			targetIdx = nextValidIdx(targetIdx);
		}
		carouselIdx = targetIdx;
		screenStartedAt = Date.now();
	}

	function togglePause() {
		paused = !paused;
		if (!paused) screenStartedAt = Date.now();
	}

	function startCarousel() {
		stopCarousel();
		carouselTimer = setInterval(advanceCarousel, 1000);
	}

	function stopCarousel() {
		if (carouselTimer) {
			clearInterval(carouselTimer);
			carouselTimer = null;
		}
	}

	function restartCarousel() {
		screenStartedAt = Date.now();
	}

	// --- Clock ---
	let clockText = $state('');
	let clockTimer: ReturnType<typeof setInterval> | null = null;

	function updateClock() {
		const now = new Date();
		clockText =
			now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
			'  ' +
			now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
	}

	// --- Cursor auto-hide ---
	let cursorHidden = $state(false);
	let cursorTimer: ReturnType<typeof setTimeout> | null = null;

	// --- Touch swipe state ---
	let swipeState: SwipeState | null = null;

	function resetCursorTimer() {
		cursorHidden = false;
		if (cursorTimer) clearTimeout(cursorTimer);
		cursorTimer = setTimeout(() => {
			cursorHidden = true;
		}, CURSOR_HIDE_MS);
	}

	// --- Keyboard shortcuts ---
	function handleKeydown(e: KeyboardEvent) {
		switch (e.key) {
			case 'ArrowRight':
				nextScreen();
				restartCarousel();
				break;
			case 'ArrowLeft':
				prevScreen();
				restartCarousel();
				break;
			case ' ':
				e.preventDefault();
				togglePause();
				break;
			case 'r':
			case 'R':
				handleRefresh();
				break;
			case 'Escape':
			case 'm':
			case 'M':
				goto('/');
				break;
			case 'f':
			case 'F':
				if (document.fullscreenElement) {
					document.exitFullscreen();
				} else {
					document.documentElement.requestFullscreen();
				}
				break;
		}
	}

	// --- Visibility change (re-sync on tab focus) ---
	function handleVisibilityChange() {
		if (document.hidden) {
			stopCarousel();
		} else if (!paused) {
			startCarousel();
		}
	}

	// --- Touch swipe handlers ---
	function handleTouchStart(e: TouchEvent) {
		swipeState = initSwipe(
			e.touches[0].clientX,
			e.touches[0].clientY,
			e.touches.length,
			shouldBailSwipe(e.target)
		);
	}

	function handleTouchMove(e: TouchEvent) {
		if (!swipeState) return;
		const result = progressSwipe(e.touches[0].clientX, e.touches[0].clientY, swipeState);
		swipeState = result.state;
		if (result.preventDefault) e.preventDefault();
	}

	function handleTouchEnd(e: TouchEvent) {
		if (!swipeState) return;
		const action = commitSwipe(e.changedTouches[0].clientX, swipeState);
		swipeState = null;
		if (action === 'next') {
			nextScreen();
			restartCarousel();
		} else if (action === 'prev') {
			prevScreen();
			restartCarousel();
		}
	}

	function handleTouchCancel() {
		swipeState = null;
	}

	// --- Shared data for map screens ---
	let earthquakeItems = $state<NewsItem[]>([]);
	let fireIncidents = $state<import('$lib/api/marin/calfire').FireIncident[]>([]);
	let hourlyPeriods = $state<import('$lib/api/marin/nws-hourly').HourlyPeriod[]>([]);

	// Pre-fetched weather cache for all map regions
	let regionWeather = $state<Record<string, { temp: number; wind: string; shortForecast: string }>>(
		{}
	);

	// --- Pulse stats for header bar ---
	const stories24h = $derived(
		$allNewsItems.filter((item) => Date.now() - item.timestamp <= 24 * 60 * 60 * 1000).length
	);
	const alertCount = $derived($alerts.length);

	// Degraded badge: surface count of failed adapters from the most recent
	// refresh cycle. handleRefresh threads errors[] into refresh.endRefresh,
	// which lands in refresh.refreshHistory[0].errors.
	const degradedErrorCount = $derived($refresh.refreshHistory[0]?.errors.length ?? 0);

	// Derived: current map viewId (for the persistent map instance)
	const activeMapViewId = $derived(TV_SCREENS[carouselIdx]?.mapViewId ?? 'county');
	const isMapScreenActive = $derived(!!TV_SCREENS[carouselIdx]?.mapViewId);
	// Use the first hourly period (current hour) for actual current temp,
	// NOT weatherForecast[0] which is the daytime high
	const currentTemp = $derived(hourlyPeriods[0]?.temperature ?? null);

	// --- Region context for map sidebar ---
	type RegionContextItem = { label: string; value: string };

	/** Region lat/lon bounding boxes for filtering shops/stations by map view */
	const REGION_BOUNDS: Record<
		string,
		{ latMin: number; latMax: number; lonMin: number; lonMax: number }
	> = {
		south: { latMin: 37.83, latMax: 37.92, lonMin: -122.6, lonMax: -122.45 },
		central: { latMin: 37.92, latMax: 38.0, lonMin: -122.6, lonMax: -122.45 },
		north: { latMin: 38.0, latMax: 38.12, lonMin: -122.65, lonMax: -122.45 },
		west: { latMin: 37.9, latMax: 38.1, lonMin: -122.85, lonMax: -122.6 }
	};

	function inBounds(
		lat: number,
		lon: number,
		bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }
	): boolean {
		return (
			lat >= bounds.latMin && lat <= bounds.latMax && lon >= bounds.lonMin && lon <= bounds.lonMax
		);
	}

	const regionContext = $derived.by((): RegionContextItem[] => {
		const viewId = activeMapViewId;

		if (viewId === 'county') {
			const items: RegionContextItem[] = [];
			if (aqiData) items.push({ label: 'AQI', value: `${aqiData.aqi} ${aqiData.category}` });
			const activeStreams = streamGauges.filter((s) => s.streamflow != null).length;
			if (activeStreams > 0)
				items.push({ label: 'Stream gauges', value: `${activeStreams} reporting` });
			if (threeOneOneItems.length > 0)
				items.push({ label: '311 reports', value: `${threeOneOneItems.length} this week` });
			return items;
		}

		if (viewId === 'south') {
			const items: RegionContextItem[] = [];
			const bounds = REGION_BOUNDS.south;
			const southShops = (cappuccinoData?.current?.shops ?? []).filter(
				(s) => s.price != null && inBounds(s.lat, s.lon, bounds)
			);
			if (southShops.length > 0) {
				const cheapest = southShops.reduce((a, b) => (a.price! < b.price! ? a : b));
				items.push({
					label: 'Cappuccino',
					value: `$${cheapest.price!.toFixed(2)} at ${cheapest.name}`
				});
			}
			const southGas = (gasData?.current?.stations ?? []).filter((s) =>
				inBounds(s.lat, s.lon, bounds)
			);
			const southRegular = southGas.flatMap((s) =>
				s.fuelPrices
					.filter((f) => f.type === 'REGULAR_UNLEADED')
					.map((f) => ({ price: f.price, name: s.name }))
			);
			if (southRegular.length > 0) {
				const cheapestGas = southRegular.reduce((a, b) => (a.price < b.price ? a : b));
				items.push({
					label: 'Regular gas',
					value: `$${cheapestGas.price.toFixed(2)} at ${cheapestGas.name}`
				});
			}
			return items;
		}

		if (viewId === 'central') {
			const items: RegionContextItem[] = [];
			const bounds = REGION_BOUNDS.central;
			const centralStudios = (fitnessData?.current?.studios ?? []).filter((s) =>
				inBounds(s.lat, s.lon, bounds)
			);
			if (centralStudios.length > 0) {
				const prices = centralStudios.map((s) => s.dropInPrice).sort((a, b) => a - b);
				const median = prices[Math.floor(prices.length / 2)];
				items.push({
					label: 'Fitness drop-in',
					value: `$${median} median (${centralStudios.length} studios)`
				});
			}
			const centralShops = (cappuccinoData?.current?.shops ?? []).filter(
				(s) => s.price != null && inBounds(s.lat, s.lon, bounds)
			);
			if (centralShops.length > 0) {
				const cheapest = centralShops.reduce((a, b) => (a.price! < b.price! ? a : b));
				items.push({
					label: 'Cappuccino',
					value: `$${cheapest.price!.toFixed(2)} at ${cheapest.name}`
				});
			}
			return items;
		}

		if (viewId === 'north') {
			const items: RegionContextItem[] = [];
			const bounds = REGION_BOUNDS.north;
			const northGas = (gasData?.current?.stations ?? []).filter((s) =>
				inBounds(s.lat, s.lon, bounds)
			);
			const northRegular = northGas.flatMap((s) =>
				s.fuelPrices.filter((f) => f.type === 'REGULAR_UNLEADED').map((f) => f.price)
			);
			if (northRegular.length > 0) {
				const avg = northRegular.reduce((a, b) => a + b, 0) / northRegular.length;
				items.push({
					label: 'Gas avg (regular)',
					value: `$${avg.toFixed(2)} (${northGas.length} stations)`
				});
			}
			const north311 = threeOneOneItems.filter(
				(i) => i.lat != null && i.lon != null && inBounds(i.lat!, i.lon!, bounds)
			);
			if (north311.length > 0)
				items.push({ label: '311 reports', value: `${north311.length} nearby` });
			return items;
		}

		if (viewId === 'west') {
			const items: RegionContextItem[] = [];
			if (heroDirt) items.push({ label: 'Trail conditions', value: heroDirt.label });
			const westStreams = streamGauges.filter((s) => s.streamflow != null && s.lon < -122.6);
			if (westStreams.length > 0) {
				const avgCfs = Math.round(
					westStreams.reduce((a, s) => a + s.streamflow!, 0) / westStreams.length
				);
				items.push({
					label: 'Avg streamflow',
					value: `${avgCfs} cfs (${westStreams.length} gauges)`
				});
			}
			return items;
		}

		return [];
	});

	async function loadNews(errors: string[]) {
		try {
			const result = await loadAllNews();
			earthquakeItems = result.earthquakeNews;
			errors.push(...result.errors);
		} catch (err) {
			errors.push(`news: ${(err as Error).message}`);
		}
	}

	let lastRegionWeatherFetch = 0;
	const REGION_WEATHER_TTL = 15 * 60 * 1000; // 15 minutes for map region weather

	async function loadWeather(errors: string[]) {
		try {
			const hourly = await fetchHourlyForecast();
			if (hourly.length > 0) hourlyPeriods = hourly;
		} catch (err) {
			errors.push(`weather/hourly: ${(err as Error).message}`);
		}

		if (
			Date.now() - lastRegionWeatherFetch < REGION_WEATHER_TTL &&
			Object.keys(regionWeather).length > 0
		) {
			return;
		}

		const results = await Promise.allSettled(
			TV_MAP_VIEWS.map(async (view) => {
				const h = await fetchHourlyForecast(view.center[1], view.center[0]);
				if (h.length > 0) {
					return {
						id: view.id,
						data: {
							temp: h[0].temperature,
							wind: `${h[0].windSpeed}`,
							shortForecast: h[0].shortForecast ?? ''
						}
					};
				}
				return null;
			})
		);

		const newWeather: Record<string, { temp: number; wind: string; shortForecast: string }> = {
			...regionWeather
		};
		for (let i = 0; i < results.length; i++) {
			const r = results[i];
			if (r.status === 'fulfilled' && r.value) {
				newWeather[r.value.id] = r.value.data;
			} else if (r.status === 'rejected') {
				errors.push(`weather/${TV_MAP_VIEWS[i].id}: ${(r.reason as Error)?.message ?? r.reason}`);
			}
		}
		regionWeather = newWeather;
		const allSucceeded = results.every((r) => r.status === 'fulfilled' && r.value !== null);
		if (allSucceeded) {
			lastRegionWeatherFetch = Date.now();
		}
	}

	async function loadFireIncidents(errors: string[]) {
		try {
			fireIncidents = await fetchFireIncidents();
		} catch (err) {
			errors.push(`fire-incidents: ${(err as Error).message}`);
		}
	}

	async function loadStravaSafe(errors: string[]) {
		try {
			await loadStravaData();
		} catch (err) {
			errors.push(`strava: ${(err as Error).message}`);
		}
	}

	/**
	 * Apply a tagged FetchResult to TV state. On success, `setter(result.data)`
	 * runs; on failure, previous state is preserved and the error is collected.
	 * Returns the value that should be used downstream — `data` on success,
	 * `null` on failure (so callers can skip publishing fallback data into the
	 * ticker store, etc.).
	 */
	function applyResult<T>(
		label: string,
		result: { ok: true; data: T } | { ok: false; error: string; fallback: T },
		setter: (value: T) => void,
		errors: string[]
	): T | null {
		if (result.ok) {
			setter(result.data);
			return result.data;
		}
		errors.push(`${label}: ${result.error}`);
		return null;
	}

	async function loadIndexData(errors: string[]): Promise<void> {
		const [composite, cappuccino, grocery, wine, fitness, tuition, driveway, gas] =
			await Promise.all([
				fetchCompositeDataWithStatus(),
				fetchCappuccinoDataWithStatus(),
				fetchGroceryBasketDataWithStatus(),
				fetchWineIndexDataWithStatus(),
				fetchFitnessDataWithStatus(),
				fetchSchoolTuitionDataWithStatus(),
				fetchDrivewayDataWithStatus(),
				fetchGasPriceDataWithStatus()
			]);

		const compositeLive = applyResult('composite', composite, (v) => (compositeData = v), errors);
		const cappuccinoLive = applyResult(
			'cappuccino',
			cappuccino,
			(v) => (cappuccinoData = v),
			errors
		);
		const groceryLive = applyResult('grocery', grocery, (v) => (groceryData = v), errors);
		const wineLive = applyResult('wine', wine, (v) => (wineData = v), errors);
		const fitnessLive = applyResult('fitness', fitness, (v) => (fitnessData = v), errors);
		const tuitionLive = applyResult('school-tuition', tuition, (v) => (tuitionData = v), errors);
		const drivewayLive = applyResult('driveway', driveway, (v) => (drivewayData = v), errors);
		const gasLive = applyResult('gas-prices', gas, (v) => (gasData = v), errors);

		// Ticker store gets only live values — silent fallbacks would scroll fake numbers.
		tvIndexData.set({
			composite: compositeLive,
			cappuccino: cappuccinoLive,
			grocery: groceryLive,
			wine: wineLive,
			fitness: fitnessLive,
			tuition: tuitionLive,
			driveway: drivewayLive,
			gas: gasLive
		});

		const housing = await fetchHousingDataWithStatus();
		applyResult('housing', housing, (v) => (housingData = v), errors);

		const [aqiResult, tidesResult, streamsResult, observedResult] = await Promise.allSettled([
			fetchAirQuality(),
			fetchTidePredictions(),
			fetchStreamGauges(),
			fetchObservedWeather(37.97, -122.53)
		]);

		if (aqiResult.status === 'fulfilled') aqiData = aqiResult.value;
		else errors.push(`aqi: ${(aqiResult.reason as Error)?.message ?? aqiResult.reason}`);

		if (tidesResult.status === 'fulfilled') tidePredictions = tidesResult.value ?? [];
		else errors.push(`tides: ${(tidesResult.reason as Error)?.message ?? tidesResult.reason}`);

		if (streamsResult.status === 'fulfilled') streamGauges = streamsResult.value ?? [];
		else
			errors.push(`streams: ${(streamsResult.reason as Error)?.message ?? streamsResult.reason}`);

		let observed: Awaited<ReturnType<typeof fetchObservedWeather>> | null = null;
		if (observedResult.status === 'fulfilled') {
			observed = observedResult.value;
		} else {
			errors.push(
				`observed-weather: ${(observedResult.reason as Error)?.message ?? observedResult.reason}`
			);
		}

		if (observed && hourlyPeriods.length > 0) {
			try {
				heroDirt = computeHeroDirt(observed, hourlyPeriods);
			} catch (err) {
				errors.push(`hero-dirt: ${(err as Error).message}`);
				heroDirt = null;
			}
		} else {
			heroDirt = null;
		}
	}

	let refreshInFlight = false;
	async function handleRefresh() {
		if (refreshInFlight) return;
		refreshInFlight = true;
		refresh.startRefresh();
		const errors: string[] = [];
		try {
			await Promise.all([
				loadNews(errors),
				loadWeather(errors),
				loadFireIncidents(errors),
				loadStravaSafe(errors),
				loadIndexData(errors)
			]);
		} catch (error) {
			// Should be unreachable — every loader catches internally — but keep a
			// belt-and-suspenders entry so an unexpected throw still surfaces.
			errors.push(`refresh: ${(error as Error).message ?? String(error)}`);
		} finally {
			refresh.endRefresh(errors);
			refreshInFlight = false;
		}
	}

	// --- Data refresh interval ---
	let refreshTimer: ReturnType<typeof setInterval> | null = null;

	// --- Periodic page reload to reclaim memory (WebGL, tile cache, JS heap) ---
	const PAGE_RELOAD_MS = 6 * 60 * 60 * 1000; // 6 hours
	let reloadTimer: ReturnType<typeof setTimeout> | null = null;

	// --- Force dark theme ---
	let originalTheme = '';
	let originalSettingsTheme: 'dark' | 'light' = 'dark';

	onMount(() => {
		// Reset shared state so TV mode starts county-wide, not town-scoped
		townFilter.clear();
		mapStore.selectTown(null);

		// Reset map layers to prevent dashboard layer bleed
		mapStore.clearAllLayers();

		// Force dark theme — both data-theme attribute AND settings store
		// (MapContainer reads settings.theme for basemap style)
		originalTheme = document.documentElement.getAttribute('data-theme') ?? '';
		originalSettingsTheme =
			(document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark';
		document.documentElement.setAttribute('data-theme', 'dark');
		settings.setTheme('dark');

		// Start carousel
		startCarousel();

		// Start clock
		updateClock();
		clockTimer = setInterval(updateClock, 1000);

		// Cursor auto-hide
		resetCursorTimer();
		window.addEventListener('mousemove', resetCursorTimer);

		// Keyboard shortcuts
		window.addEventListener('keydown', handleKeydown);

		// Touch swipe
		window.addEventListener('touchstart', handleTouchStart, { passive: true });
		window.addEventListener('touchmove', handleTouchMove, { passive: false });
		window.addEventListener('touchend', handleTouchEnd, { passive: true });
		window.addEventListener('touchcancel', handleTouchCancel, { passive: true });

		// Visibility change
		document.addEventListener('visibilitychange', handleVisibilityChange);

		// Initial data load
		handleRefresh();

		// Recurring data refresh
		refreshTimer = setInterval(handleRefresh, TV_REFRESH_INTERVAL_MS);

		// Periodic full page reload to reclaim accumulated memory (standard for TV dashboards)
		reloadTimer = setTimeout(() => location.reload(), PAGE_RELOAD_MS);
	});

	onDestroy(() => {
		stopCarousel();
		if (clockTimer) clearInterval(clockTimer);
		if (cursorTimer) clearTimeout(cursorTimer);
		if (refreshTimer) clearInterval(refreshTimer);
		if (reloadTimer) clearTimeout(reloadTimer);

		if (browser) {
			window.removeEventListener('mousemove', resetCursorTimer);
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('touchstart', handleTouchStart);
			window.removeEventListener('touchmove', handleTouchMove);
			window.removeEventListener('touchend', handleTouchEnd);
			window.removeEventListener('touchcancel', handleTouchCancel);
			document.removeEventListener('visibilitychange', handleVisibilityChange);

			// Restore original theme (both data-theme and settings store)
			document.documentElement.setAttribute('data-theme', originalTheme || 'dark');
			settings.setTheme(originalSettingsTheme);
		}
	});
</script>

<div
	class="fixed inset-0 bg-gray-950 text-gray-100 flex flex-col overflow-hidden select-none"
	class:cursor-none={cursorHidden}
>
	<TvWallboardHeader
		{carouselIdx}
		{paused}
		{currentTemp}
		{stories24h}
		{alertCount}
		{clockText}
		{degradedErrorCount}
		onGoToScreen={goToScreen}
	/>

	<!-- Carousel area -->
	<div class="relative min-h-0 shrink-0" style="height: calc(100dvh - 48px - 45px);">
		<!-- Persistent map — single MapContainer, never destroyed. Hidden when non-map screen active. -->
		<div
			class="absolute inset-0"
			style="z-index: {isMapScreenActive ? 1 : 0}; visibility: {isMapScreenActive
				? 'visible'
				: 'hidden'};"
		>
			<TvMapScreen
				{earthquakeItems}
				{fireIncidents}
				viewId={activeMapViewId}
				weather={regionWeather[activeMapViewId] ?? null}
				{threeOneOneItems}
				coffeeShops={cappuccinoData?.current?.shops ?? []}
				gasStations={gasData?.current?.stations ?? []}
				fitnessStudios={fitnessData?.current?.studios ?? []}
				{regionContext}
			/>
		</div>

		<!-- Non-map screens — destroyed/created normally -->
		{#each TV_SCREENS as screen, i (screen.id)}
			{#if !screen.mapViewId}
				<TvScreen active={carouselIdx === i}>
					{#if screen.id === 'news-wire'}
						<NewsWireScreen active={carouselIdx === i} />
					{:else if screen.id === 'safety'}
						<SafetyScreen active={carouselIdx === i} />
					{:else if screen.id === 'cameras-tam-coast'}
						<TvCameraClusterScreen clusterId="tam-coast" />
					{:else if screen.id === 'cameras-central-highway'}
						<TvCameraClusterScreen clusterId="central-highway" />
					{:else if screen.id === 'cameras-west-north'}
						<TvCameraClusterScreen clusterId="west-north" />
					{:else if screen.id === 'composite'}
						<TvCompositeHero data={compositeData} />
					{:else if screen.id === 'daily-life'}
						<TvDailyLifeCard cappuccino={cappuccinoData} grocery={groceryData} gas={gasData} />
					{:else if screen.id === 'lifestyle'}
						<TvLifestyleCard wine={wineData} fitness={fitnessData} />
					{:else if screen.id === 'structural'}
						<TvStructuralCard tuition={tuitionData} housing={housingData} />
					{:else if screen.id === 'driveway'}
						<TvDrivewayCard data={drivewayData} />
					{:else if screen.id === '311-photos'}
						<Tv311PhotoWall items={threeOneOneItems} active={carouselIdx === i} />
					{:else if screen.id === 'community'}
						<TvCommunityScreen active={carouselIdx === i} />
					{:else if screen.id === 'leaderboards'}
						<TvLeaderboardsScreen active={carouselIdx === i} />
					{:else if screen.id === 'conditions'}
						<TvConditionsCard
							weather={regionWeather?.['county'] ?? null}
							aqi={aqiData
								? { value: aqiData.aqi, category: aqiData.category, pollutant: aqiData.pollutant }
								: null}
							tides={tidePredictions}
							hourlyForecast={hourlyPeriods}
						/>
					{:else if screen.id === 'outdoors'}
						<TvOutdoorsCard
							surf={[]}
							dirt={heroDirt
								? {
										condition: heroDirt.label,
										color: heroDirt.color,
										lastRain: heroDirt.summary,
										score: heroDirt.score,
										moistureEstimate: heroDirt.moistureEstimate,
										dryingRate: heroDirt.dryingRate,
										seasonalBaseline: heroDirt.seasonalBaseline,
										confidence: heroDirt.confidence,
										trailIntel: heroDirt.trailIntel
									}
								: null}
							streams={streamGauges
								.filter((s) => s.streamflow != null)
								.map((s) => ({
									name: s.shortName || s.name,
									cfs: Math.round(s.streamflow!),
									trend: 'stable' as const,
									gageHeight: s.gageHeight
								}))}
						/>
					{/if}
				</TvScreen>
			{/if}
		{/each}
	</div>

	<!-- Chyron -->
	<TvChyron />
</div>

<style>
	.cursor-none {
		cursor: none;
	}
</style>

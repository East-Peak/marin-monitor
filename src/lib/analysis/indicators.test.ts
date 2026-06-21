import { describe, it, expect } from 'vitest';
import { computeHeroDirt } from './indicators';
import type { ObservedWeather } from '$lib/api/marin/open-meteo';
import type { HourlyPeriod } from '$lib/api/marin/nws-hourly';

/** Generate an array of hourly ISO timestamps going back N hours from now */
function makeTimestamps(hours: number): string[] {
	const now = Date.now();
	return Array.from({ length: hours }, (_, i) => {
		const t = new Date(now - (hours - 1 - i) * 3_600_000);
		return t.toISOString();
	});
}

/** Create a basic observed weather object with sensible defaults (7 days) */
function makeObserved(overrides: Partial<ObservedWeather> = {}): ObservedWeather {
	const hours = 168; // 7 days
	return {
		time: makeTimestamps(hours),
		temperature: Array(hours).fill(65),
		humidity: Array(hours).fill(50),
		dewpoint: Array(hours).fill(45),
		precipitation: Array(hours).fill(0),
		windSpeed: Array(hours).fill(8),
		soilMoisture0to1cm: Array(hours).fill(0.15),
		soilMoisture1to3cm: Array(hours).fill(0.16),
		soilTemperature0cm: Array(hours).fill(58),
		weatherCode: Array(hours).fill(0),
		cloudCoverLow: Array(hours).fill(10),
		directRadiation: Array(hours).fill(150),
		vapourPressureDeficit: Array(hours).fill(0.8),
		evapotranspiration: Array(hours).fill(0.1),
		...overrides
	};
}

/** Create a minimal forecast array */
function makeForecast(overrides: Partial<HourlyPeriod> = {}): HourlyPeriod[] {
	return [
		{
			startTime: new Date().toISOString(),
			temperature: 65,
			precipitationChance: 0,
			temperatureUnit: 'F',
			windSpeed: '8 mph',
			windDirection: 'NW',
			shortForecast: 'Sunny',
			isDaytime: true,
			dewpoint: 45,
			relativeHumidity: 50,
			...overrides
		}
	];
}

describe('computeHeroDirt', () => {
	// --- Core scoring (rain-model fallback path) ---

	it('returns "Too Dry" when no rain and dry soil', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.05) // very dry soil
		});
		const result = computeHeroDirt(observed, makeForecast());

		expect(result.score).toBeLessThan(50);
		expect(result.label).toBe('Too Dry');
		expect(result.totalRecentRain).toBe(0);
		expect(result.lastRainHoursAgo).toBeNull();
	});

	it('returns "Too Wet" when soil is saturated', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.4) // near saturation
		});
		const result = computeHeroDirt(observed, makeForecast());

		expect(result.moistureEstimate).toBeGreaterThan(60);
		expect(result.label).toBe('Too Wet');
	});

	it('returns high score for soil in the sweet spot', () => {
		// 0.03 → 0%, 0.45 → 100%, so IDEAL_MOISTURE=25% maps to about 0.135 m³/m³
		const sweetSpotRaw = 0.03 + 0.25 * (0.45 - 0.03); // = 0.135
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(sweetSpotRaw)
		});
		const result = computeHeroDirt(observed, makeForecast());

		expect(result.score).toBeGreaterThanOrEqual(85);
		expect(result.label).toMatch(/Hero Dirt!|Good/);
		expect(result.moistureSource).toBe('soil-sensor');
	});

	it('returns high score for good rain ~24h ago in warm dry conditions (rain-model fallback)', () => {
		const observed = makeObserved({
			temperature: Array(168).fill(68),
			humidity: Array(168).fill(35),
			dewpoint: Array(168).fill(38),
			windSpeed: Array(168).fill(10),
			// No soil moisture data → triggers rain-model fallback
			soilMoisture0to1cm: Array(168).fill(-1)
		});
		// 0.8 inches of rain about 24 hours ago
		const rainIdx = observed.precipitation.length - 24;
		observed.precipitation[rainIdx] = 0.4;
		observed.precipitation[rainIdx + 1] = 0.4;

		const result = computeHeroDirt(observed, makeForecast());

		expect(result.moistureSource).toBe('rain-model');
		expect(result.totalRecentRain).toBe(0.8);
		expect(result.dryingRate).toBeGreaterThan(0.5);
	});

	it('returns lower score for light rain long ago (rain-model fallback)', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(-1) // force rain-model
		});
		const rainIdx = observed.precipitation.length - 48;
		observed.precipitation[rainIdx] = 0.15;

		const result = computeHeroDirt(observed, makeForecast());

		expect(result.totalRecentRain).toBe(0.15);
		expect(result.lastRainHoursAgo).toBeGreaterThanOrEqual(47);
		expect(result.moistureSource).toBe('rain-model');
	});

	// --- Graceful degradation ---

	it('handles empty observed data gracefully', () => {
		const empty: ObservedWeather = {
			time: [],
			temperature: [],
			humidity: [],
			dewpoint: [],
			precipitation: [],
			windSpeed: [],
			soilMoisture0to1cm: [],
			soilMoisture1to3cm: [],
			soilTemperature0cm: [],
			weatherCode: [],
			cloudCoverLow: [],
			directRadiation: [],
			vapourPressureDeficit: [],
			evapotranspiration: []
		};

		const result = computeHeroDirt(empty, makeForecast());

		expect(result.score).toBeDefined();
		expect(result.label).toBe('Too Dry');
		expect(result.totalRecentRain).toBe(0);
		expect(result.confidence).toBe('low');
	});

	it('handles empty forecast gracefully', () => {
		const observed = makeObserved();
		const result = computeHeroDirt(observed, []);

		expect(result.score).toBeDefined();
		expect(result.label).toBeDefined();
		expect(result.confidence).toBe('high');
	});

	it('falls back to forecast conditions when observed data is sparse', () => {
		const shortObserved: ObservedWeather = {
			time: makeTimestamps(6),
			temperature: Array(6).fill(null as unknown as number),
			humidity: Array(6).fill(null as unknown as number),
			dewpoint: Array(6).fill(null as unknown as number),
			precipitation: Array(6).fill(0),
			windSpeed: Array(6).fill(null as unknown as number),
			soilMoisture0to1cm: Array(6).fill(-1),
			soilMoisture1to3cm: Array(6).fill(-1),
			soilTemperature0cm: Array(6).fill(null as unknown as number),
			weatherCode: Array(6).fill(0),
			cloudCoverLow: Array(6).fill(0),
			directRadiation: Array(6).fill(0),
			vapourPressureDeficit: Array(6).fill(0),
			evapotranspiration: Array(6).fill(0)
		};

		const result = computeHeroDirt(
			shortObserved,
			makeForecast({ temperature: 72, relativeHumidity: 40, dewpoint: 48 })
		);

		expect(result.confidence).toBe('medium');
		expect(result.score).toBeDefined();
	});

	// --- Moisture monotonicity ---

	it('produces increasing moisture with wetter soil', () => {
		const dry = computeHeroDirt(
			makeObserved({ soilMoisture0to1cm: Array(168).fill(0.05) }),
			makeForecast()
		);
		const mid = computeHeroDirt(
			makeObserved({ soilMoisture0to1cm: Array(168).fill(0.15) }),
			makeForecast()
		);
		const wet = computeHeroDirt(
			makeObserved({ soilMoisture0to1cm: Array(168).fill(0.35) }),
			makeForecast()
		);

		expect(dry.moistureEstimate).toBeLessThan(mid.moistureEstimate);
		expect(mid.moistureEstimate).toBeLessThan(wet.moistureEstimate);
	});

	// --- Field completeness ---

	it('score color matches label', () => {
		const result = computeHeroDirt(
			makeObserved({ soilMoisture0to1cm: Array(168).fill(0.05) }),
			makeForecast()
		);

		expect(result.color).toBe('#6b7280'); // "Too Dry" → gray

		expect(result).toHaveProperty('score');
		expect(result).toHaveProperty('label');
		expect(result).toHaveProperty('color');
		expect(result).toHaveProperty('moistureEstimate');
		expect(result).toHaveProperty('lastRainHoursAgo');
		expect(result).toHaveProperty('totalRecentRain');
		expect(result).toHaveProperty('dryingRate');
		expect(result).toHaveProperty('confidence');
		expect(result).toHaveProperty('summary');
		expect(result).toHaveProperty('moistureSource');
		expect(result).toHaveProperty('seasonalBaseline');
		expect(result).toHaveProperty('moistureEvents');
		expect(result).toHaveProperty('trailIntel');
	});

	// --- Drying rate ---

	it('drying rate increases with warmer, drier, windier conditions', () => {
		const coldWet = makeObserved({
			temperature: Array(168).fill(42),
			humidity: Array(168).fill(90),
			dewpoint: Array(168).fill(40),
			windSpeed: Array(168).fill(2),
			soilMoisture0to1cm: Array(168).fill(0.2)
		});

		const hotDry = makeObserved({
			temperature: Array(168).fill(78),
			humidity: Array(168).fill(25),
			dewpoint: Array(168).fill(40),
			windSpeed: Array(168).fill(18),
			soilMoisture0to1cm: Array(168).fill(0.2)
		});

		const coldResult = computeHeroDirt(coldWet, makeForecast());
		const hotResult = computeHeroDirt(hotDry, makeForecast());

		expect(hotResult.dryingRate).toBeGreaterThan(coldResult.dryingRate);
	});

	// --- Summary ---

	it('summary includes rain info when present', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(-1) // rain-model
		});
		observed.precipitation[observed.precipitation.length - 10] = 0.3;

		const result = computeHeroDirt(observed, makeForecast());

		expect(result.summary).toContain('rain');
	});

	it('summary says "No rain in 7d" when dry and no events', () => {
		const observed = makeObserved({
			// Baseline ~21% (above 10% threshold) so we get "No rain" not "moon dust"
			soilMoisture0to1cm: Array(168).fill(0.12),
			// Ensure no dew events: large temp-dewpoint spread
			temperature: Array(168).fill(75),
			dewpoint: Array(168).fill(45)
		});
		const result = computeHeroDirt(observed, makeForecast());
		expect(result.summary).toContain('No rain in 7d');
	});

	// --- Soil-sensor primary path ---

	it('uses soil-sensor when valid soil moisture data is present', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.2)
		});
		const result = computeHeroDirt(observed, makeForecast());

		expect(result.moistureSource).toBe('soil-sensor');
		expect(result.confidence).toBe('high');
	});

	it('falls back to rain-model when soil moisture is invalid', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(-1)
		});
		const result = computeHeroDirt(observed, makeForecast());

		expect(result.moistureSource).toBe('rain-model');
		expect(result.confidence).toBe('medium');
	});

	it('maps soil moisture endpoints correctly', () => {
		// At minimum (0.03) → ~0%
		const dryResult = computeHeroDirt(
			makeObserved({ soilMoisture0to1cm: Array(168).fill(0.03) }),
			makeForecast()
		);
		expect(dryResult.moistureEstimate).toBe(0);

		// At maximum (0.45) → 100%
		const wetResult = computeHeroDirt(
			makeObserved({ soilMoisture0to1cm: Array(168).fill(0.45) }),
			makeForecast()
		);
		expect(wetResult.moistureEstimate).toBe(100);
	});

	// --- Seasonal baseline ---

	it('computes seasonal baseline from soil moisture average', () => {
		// Wet season: high ambient soil moisture
		const wetSeason = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.25)
		});
		const wetResult = computeHeroDirt(wetSeason, makeForecast());
		expect(wetResult.seasonalBaseline).toBeGreaterThan(30);

		// Dry season: low ambient soil moisture
		const drySeason = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.06)
		});
		const dryResult = computeHeroDirt(drySeason, makeForecast());
		expect(dryResult.seasonalBaseline).toBeLessThan(15);
	});

	it('falls back to default baseline with insufficient soil data', () => {
		const sparse: ObservedWeather = {
			time: makeTimestamps(12),
			temperature: Array(12).fill(65),
			humidity: Array(12).fill(50),
			dewpoint: Array(12).fill(45),
			precipitation: Array(12).fill(0),
			windSpeed: Array(12).fill(8),
			soilMoisture0to1cm: Array(12).fill(0.15),
			soilMoisture1to3cm: Array(12).fill(0.16),
			soilTemperature0cm: Array(12).fill(58),
			weatherCode: Array(12).fill(0),
			cloudCoverLow: Array(12).fill(10),
			directRadiation: Array(12).fill(150),
			vapourPressureDeficit: Array(12).fill(0.8),
			evapotranspiration: Array(12).fill(0.1)
		};
		const result = computeHeroDirt(sparse, makeForecast());
		// With < 24h of data, baseline falls back to 5%
		expect(result.seasonalBaseline).toBe(5);
	});

	// --- Dew detection ---

	it('detects dew events from dewpoint spread overnight', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.15)
		});
		// Create dew conditions: narrow spread overnight
		// Find the most recent overnight hour
		for (let i = observed.time.length - 1; i >= observed.time.length - 24; i--) {
			const hour = new Date(observed.time[i]).getHours();
			if (hour >= 20 || hour <= 8) {
				observed.temperature[i] = 52;
				observed.dewpoint[i] = 50; // spread = 2°F < 4°F threshold
				break;
			}
		}

		const result = computeHeroDirt(observed, makeForecast());

		expect(result.moistureEvents.some((e) => e.type === 'dew')).toBe(true);
	});

	it('does not detect dew during daytime hours', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.15)
		});
		// Set narrow spread during mid-day only (noon)
		for (let i = observed.time.length - 1; i >= observed.time.length - 24; i--) {
			const hour = new Date(observed.time[i]).getHours();
			if (hour === 12) {
				observed.temperature[i] = 52;
				observed.dewpoint[i] = 50;
				break;
			}
		}

		const result = computeHeroDirt(observed, makeForecast());

		// Check the recent events — should be no dew in the last 24h at noon
		const recentDew = result.moistureEvents.filter((e) => e.type === 'dew' && e.hoursAgo <= 24);
		expect(recentDew.length).toBe(0);
	});

	// --- Fog detection ---

	it('detects fog from WMO weather codes', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.15)
		});
		// Set fog code on a recent hour
		const recentIdx = observed.weatherCode.length - 3;
		observed.weatherCode[recentIdx] = 45; // WMO fog code

		const result = computeHeroDirt(observed, makeForecast());

		expect(result.moistureEvents.some((e) => e.type === 'fog')).toBe(true);
	});

	it('detects fog-drip from high low-cloud cover', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.15)
		});
		const recentIdx = observed.cloudCoverLow.length - 3;
		observed.cloudCoverLow[recentIdx] = 90; // above 85% threshold
		observed.weatherCode[recentIdx] = 3; // overcast but not fog code — non-zero

		const result = computeHeroDirt(observed, makeForecast());

		expect(result.moistureEvents.some((e) => e.type === 'fog-drip')).toBe(true);
	});

	it('detects drizzle from WMO codes 51-55', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.15)
		});
		const recentIdx = observed.weatherCode.length - 3;
		observed.weatherCode[recentIdx] = 53; // drizzle

		const result = computeHeroDirt(observed, makeForecast());

		expect(result.moistureEvents.some((e) => e.type === 'drizzle')).toBe(true);
	});

	// --- Trail Intel ---

	it('generates dew trail intel for recent dew events', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.15)
		});
		// Inject dew conditions on recent overnight hours
		for (let i = observed.time.length - 1; i >= observed.time.length - 18; i--) {
			const hour = new Date(observed.time[i]).getHours();
			if (hour >= 20 || hour <= 8) {
				observed.temperature[i] = 52;
				observed.dewpoint[i] = 50;
				break;
			}
		}

		const result = computeHeroDirt(observed, makeForecast());

		if (result.moistureEvents.some((e) => e.type === 'dew')) {
			const labels = result.trailIntel.map((t) => t.label);
			expect(labels).toContain('Exposed Trails');
			expect(labels).toContain('Under Canopy');
		}
	});

	it('generates fog trail intel for recent fog events', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.15)
		});
		// Inject fog
		observed.weatherCode[observed.weatherCode.length - 5] = 45;

		const result = computeHeroDirt(observed, makeForecast());

		if (result.moistureEvents.some((e) => e.type === 'fog' || e.type === 'fog-drip')) {
			const labels = result.trailIntel.map((t) => t.label);
			expect(labels).toContain('Fog Drip');
			expect(labels).toContain('Open Ridges');
		}
	});

	it('generates moon dust intel when seasonal baseline is very low', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.04) // very dry
		});
		const result = computeHeroDirt(observed, makeForecast());

		const labels = result.trailIntel.map((t) => t.label);
		expect(labels).toContain('Moon Dust Season');
	});

	it('generates wet season intel when seasonal baseline is high', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.3) // wet
		});
		const result = computeHeroDirt(observed, makeForecast());

		const labels = result.trailIntel.map((t) => t.label);
		expect(labels).toContain('Wet Season');
	});

	it('generates solar exposure intel with strong radiation', () => {
		const observed = makeObserved({
			directRadiation: Array(168).fill(350)
		});
		const result = computeHeroDirt(observed, makeForecast());

		const labels = result.trailIntel.map((t) => t.label);
		expect(labels).toContain('South-Facing');
	});

	it('generates overcast intel with low radiation', () => {
		const observed = makeObserved({
			directRadiation: Array(168).fill(30)
		});
		const result = computeHeroDirt(observed, makeForecast());

		const labels = result.trailIntel.map((t) => t.label);
		expect(labels).toContain('Overcast');
	});

	it('caps trail intel at 5 items', () => {
		const observed = makeObserved({
			soilMoisture0to1cm: Array(168).fill(0.3),
			directRadiation: Array(168).fill(30),
			vapourPressureDeficit: Array(168).fill(0.2)
		});
		// Add dew + fog to create many intel items
		for (let i = observed.time.length - 1; i >= observed.time.length - 24; i--) {
			const hour = new Date(observed.time[i]).getHours();
			if (hour >= 20 || hour <= 8) {
				observed.temperature[i] = 52;
				observed.dewpoint[i] = 50;
				break;
			}
		}
		observed.weatherCode[observed.weatherCode.length - 5] = 45;

		const result = computeHeroDirt(observed, makeForecast());

		expect(result.trailIntel.length).toBeLessThanOrEqual(5);
	});

	// --- VPD context ---

	it('generates VPD dry intel when air is very dry', () => {
		const observed = makeObserved({
			vapourPressureDeficit: Array(168).fill(2.5)
		});
		const result = computeHeroDirt(observed, makeForecast());

		const labels = result.trailIntel.map((t) => t.label);
		expect(labels).toContain('Air Very Dry');
	});

	it('generates VPD saturated intel when air is very humid', () => {
		const observed = makeObserved({
			vapourPressureDeficit: Array(168).fill(0.1)
		});
		const result = computeHeroDirt(observed, makeForecast());

		const labels = result.trailIntel.map((t) => t.label);
		expect(labels).toContain('Air Saturated');
	});
});

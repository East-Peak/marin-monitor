/**
 * Composite condition indicators
 *
 * Pure computation functions that derive actionable scores from multiple
 * weather data sources. No side effects, fully testable.
 *
 * Hero Dirt Tracker is the flagship indicator — uses Open-Meteo modeled soil
 * moisture as the primary signal, with dew/fog detection, seasonal baselines,
 * and exposure-aware trail intel.
 */

import type { ObservedWeather } from '$lib/api/marin/open-meteo';
import type { HourlyPeriod } from '$lib/api/marin/nws-hourly';

// --- Public types ---

export interface MoistureEvent {
	type: 'rain' | 'dew' | 'fog' | 'fog-drip' | 'drizzle';
	hoursAgo: number;
	description: string;
}

export interface TrailIntelItem {
	icon: string;
	label: string;
	detail: string;
	relevance: 'primary' | 'secondary';
}

export interface HeroDirtScore {
	score: number;
	label: string;
	color: string;
	moistureEstimate: number;
	lastRainHoursAgo: number | null;
	totalRecentRain: number;
	dryingRate: number;
	confidence: 'high' | 'medium' | 'low';
	summary: string;
	moistureSource: 'soil-sensor' | 'rain-model';
	seasonalBaseline: number;
	moistureEvents: MoistureEvent[];
	trailIntel: TrailIntelItem[];
}

// --- Constants ---

const RAIN_HALF_LIFE = 20;
const IDEAL_MOISTURE = 25;
const SATURATION_MOISTURE = 85;
const BASELINE_MOISTURE = 5; // fallback when no soil data
const SATURATION_RAIN = 1.0;
const SIGMA = 15;

// Soil moisture mapping (Open-Meteo m³/m³ → our 0-100% scale)
const SOIL_MOISTURE_MIN = 0.03; // air-dry Marin clay-loam
const SOIL_MOISTURE_MAX = 0.45; // near saturation

// Dew/fog detection
const DEW_SPREAD_THRESHOLD = 4; // °F
const FOG_WEATHER_CODES = new Set([45, 48]);
const DRIZZLE_WEATHER_CODES = new Set([51, 53, 55, 56, 57]);
const FOG_LOW_CLOUD_THRESHOLD = 85;

// --- Soil moisture helpers ---

function soilMoistureToPercent(raw: number): number {
	const clamped = Math.max(SOIL_MOISTURE_MIN, Math.min(SOIL_MOISTURE_MAX, raw));
	return Math.round(
		((clamped - SOIL_MOISTURE_MIN) / (SOIL_MOISTURE_MAX - SOIL_MOISTURE_MIN)) * 100
	);
}

function getLatestSoilMoisture(
	soilMoisture: number[],
	times: string[],
	nowMs: number
): number | null {
	for (let i = soilMoisture.length - 1; i >= 0; i--) {
		if (soilMoisture[i] != null && soilMoisture[i] >= 0) {
			const hoursAgo = (nowMs - new Date(times[i]).getTime()) / 3_600_000;
			if (hoursAgo <= 6) return soilMoisture[i];
		}
	}
	return null;
}

function computeSeasonalBaseline(soilMoisture: number[]): number {
	const valid = soilMoisture.filter((v) => v != null && v >= 0);
	if (valid.length < 24) return BASELINE_MOISTURE;
	const avg = valid.reduce((sum, v) => sum + v, 0) / valid.length;
	return soilMoistureToPercent(avg);
}

// --- Rain model helpers (fallback) ---

function computeEffectiveRain(
	times: string[],
	precipitation: number[],
	nowMs: number,
	dryingRate: number
): { effectiveRain: number; totalRain: number; lastRainHoursAgo: number | null } {
	const effectiveHalfLife = RAIN_HALF_LIFE / (0.5 + dryingRate);
	let effectiveRain = 0;
	let totalRain = 0;
	let lastRainHoursAgo: number | null = null;

	for (let i = 0; i < times.length; i++) {
		const precip = precipitation[i] ?? 0;
		if (precip <= 0) continue;

		totalRain += precip;
		const hoursAgo = (nowMs - new Date(times[i]).getTime()) / 3_600_000;
		if (hoursAgo < 0) continue;

		effectiveRain += precip * Math.pow(0.5, hoursAgo / effectiveHalfLife);

		if (lastRainHoursAgo === null || hoursAgo < lastRainHoursAgo) {
			lastRainHoursAgo = hoursAgo;
		}
	}

	if (lastRainHoursAgo !== null) {
		lastRainHoursAgo = Math.round(lastRainHoursAgo);
	}

	return { effectiveRain, totalRain: Math.round(totalRain * 100) / 100, lastRainHoursAgo };
}

function estimateMoistureFromRain(effectiveRain: number, baseline: number): number {
	if (effectiveRain <= 0) return baseline;
	const satFrac = Math.min(1, effectiveRain / SATURATION_RAIN);
	return Math.round(
		Math.max(0, Math.min(100, baseline + (SATURATION_MOISTURE - baseline) * satFrac))
	);
}

// --- Drying rate ---

function computeDryingRate(
	temperature: number | null,
	humidity: number | null,
	dewpoint: number | null,
	windSpeed: number | null
): number {
	let rate = 0.5;

	if (temperature != null) {
		if (temperature >= 75) rate += 0.15;
		else if (temperature >= 60) rate += 0.1;
		else if (temperature >= 45) rate += 0.0;
		else rate -= 0.1;
	}

	if (temperature != null && dewpoint != null) {
		const spread = temperature - dewpoint;
		if (spread >= 25) rate += 0.15;
		else if (spread >= 15) rate += 0.1;
		else if (spread >= 8) rate += 0.05;
		else rate -= 0.05;
	}

	if (humidity != null) {
		if (humidity < 40) rate += 0.1;
		else if (humidity < 60) rate += 0.05;
		else if (humidity > 80) rate -= 0.1;
	}

	if (windSpeed != null) {
		if (windSpeed >= 15) rate += 0.1;
		else if (windSpeed >= 8) rate += 0.05;
	}

	return Math.max(0, Math.min(1, rate));
}

// --- Condition helpers ---

function getLatestConditions(observed: ObservedWeather): {
	temperature: number | null;
	humidity: number | null;
	dewpoint: number | null;
	windSpeed: number | null;
} {
	const len = observed.time.length;
	let temperature: number | null = null;
	let humidity: number | null = null;
	let dewpoint: number | null = null;
	let windSpeed: number | null = null;

	for (let i = len - 1; i >= 0 && i >= len - 6; i--) {
		if (temperature === null && observed.temperature[i] != null)
			temperature = observed.temperature[i];
		if (humidity === null && observed.humidity[i] != null) humidity = observed.humidity[i];
		if (dewpoint === null && observed.dewpoint[i] != null) dewpoint = observed.dewpoint[i];
		if (windSpeed === null && observed.windSpeed[i] != null) windSpeed = observed.windSpeed[i];
	}

	return { temperature, humidity, dewpoint, windSpeed };
}

function getLatestValue(arr: number[]): number | null {
	for (let i = arr.length - 1; i >= Math.max(0, arr.length - 6); i--) {
		if (arr[i] != null) return arr[i];
	}
	return null;
}

// --- Dew/Fog detection ---

function detectDewEvents(observed: ObservedWeather, nowMs: number): MoistureEvent[] {
	const events: MoistureEvent[] = [];
	for (let i = 0; i < observed.time.length; i++) {
		const temp = observed.temperature[i];
		const dew = observed.dewpoint[i];
		const precip = observed.precipitation[i] ?? 0;
		if (temp == null || dew == null) continue;

		const spread = temp - dew;
		const hour = new Date(observed.time[i]).getHours();
		const isOvernight = hour >= 20 || hour <= 8;
		const hoursAgo = (nowMs - new Date(observed.time[i]).getTime()) / 3_600_000;

		if (spread <= DEW_SPREAD_THRESHOLD && isOvernight && precip <= 0 && hoursAgo >= 0) {
			events.push({
				type: 'dew',
				hoursAgo: Math.round(hoursAgo),
				description: hoursAgo < 12 ? 'Dew overnight' : `Dew ${Math.round(hoursAgo / 24)}d ago`
			});
			i += 5; // skip 6h to avoid counting same event
		}
	}
	return events;
}

function detectFogEvents(observed: ObservedWeather, nowMs: number): MoistureEvent[] {
	const events: MoistureEvent[] = [];
	for (let i = 0; i < observed.time.length; i++) {
		const code = observed.weatherCode[i];
		const lowCloud = observed.cloudCoverLow[i];
		const hoursAgo = (nowMs - new Date(observed.time[i]).getTime()) / 3_600_000;
		if (hoursAgo < 0) continue;

		if (FOG_WEATHER_CODES.has(code)) {
			events.push({
				type: 'fog',
				hoursAgo: Math.round(hoursAgo),
				description: `Fog ${Math.round(hoursAgo)}h ago`
			});
			i += 2;
		} else if (lowCloud != null && lowCloud >= FOG_LOW_CLOUD_THRESHOLD && code !== 0) {
			events.push({
				type: 'fog-drip',
				hoursAgo: Math.round(hoursAgo),
				description: `Fog drip ${Math.round(hoursAgo)}h ago`
			});
			i += 2;
		} else if (DRIZZLE_WEATHER_CODES.has(code)) {
			events.push({
				type: 'drizzle',
				hoursAgo: Math.round(hoursAgo),
				description: `Mist/drizzle ${Math.round(hoursAgo)}h ago`
			});
			i += 2;
		}
	}
	return events;
}

function moistureBumpFromEvents(events: MoistureEvent[]): number {
	let bump = 0;
	for (const e of events) {
		if (e.hoursAgo > 24) continue;
		const decay = Math.pow(0.5, e.hoursAgo / 12);
		switch (e.type) {
			case 'dew':
				bump += 1.5 * decay;
				break;
			case 'fog':
				bump += 3 * decay;
				break;
			case 'fog-drip':
				bump += 4 * decay;
				break;
			case 'drizzle':
				bump += 2 * decay;
				break;
		}
	}
	return Math.min(bump, 8);
}

// --- Scoring ---

function moistureToScore(moisture: number): number {
	const distance = Math.abs(moisture - IDEAL_MOISTURE);
	const raw = 100 * Math.exp(-(distance * distance) / (2 * SIGMA * SIGMA));
	return Math.round(Math.max(0, Math.min(100, raw)));
}

function scoreToLabel(score: number, moisture: number): { label: string; color: string } {
	if (score >= 90) return { label: 'Hero Dirt!', color: '#22c55e' };
	if (score >= 70) return { label: 'Good', color: '#06b6d4' };
	if (score >= 50) return { label: 'Drying Out', color: '#eab308' };
	if (moisture > IDEAL_MOISTURE) return { label: 'Too Wet', color: '#f97316' };
	return { label: 'Too Dry', color: '#6b7280' };
}

// --- Trail Intel ---

function buildTrailIntel(
	observed: ObservedWeather,
	moistureEvents: MoistureEvent[],
	moistureEstimate: number,
	dryingRate: number,
	seasonalBaseline: number
): TrailIntelItem[] {
	const intel: TrailIntelItem[] = [];
	const latestRadiation = getLatestValue(observed.directRadiation);
	const latestVPD = getLatestValue(observed.vapourPressureDeficit);

	// Dew context
	const recentDew = moistureEvents.filter((e) => e.type === 'dew' && e.hoursAgo <= 18);
	if (recentDew.length > 0) {
		intel.push({
			icon: '\u{1F4A7}',
			label: 'Exposed Trails',
			detail: 'Tacky from overnight dew',
			relevance: 'primary'
		});
		intel.push({
			icon: '\u{1F332}',
			label: 'Under Canopy',
			detail: 'Likely stayed dry \u2014 canopy blocked dew',
			relevance: 'secondary'
		});
	}

	// Fog context
	const recentFog = moistureEvents.filter(
		(e) => (e.type === 'fog' || e.type === 'fog-drip') && e.hoursAgo <= 24
	);
	if (recentFog.length > 0) {
		intel.push({
			icon: '\u{1F32B}\u{FE0F}',
			label: 'Fog Drip',
			detail: 'Under canopy got wet \u2014 fog condensation on trees',
			relevance: 'primary'
		});
		intel.push({
			icon: '\u{2600}\u{FE0F}',
			label: 'Open Ridges',
			detail: 'Exposed trails stayed drier',
			relevance: 'secondary'
		});
	}

	// Solar exposure
	if (latestRadiation != null && latestRadiation > 200) {
		intel.push({
			icon: '\u{2600}\u{FE0F}',
			label: 'South-Facing',
			detail: `Drying fastest \u2014 strong solar (${Math.round(latestRadiation)} W/m\u{00B2})`,
			relevance: 'primary'
		});
	} else if (latestRadiation != null && latestRadiation < 50) {
		intel.push({
			icon: '\u{2601}\u{FE0F}',
			label: 'Overcast',
			detail: 'Low solar \u2014 all aspects drying slowly',
			relevance: 'secondary'
		});
	}

	// North-facing retention
	if (moistureEstimate > 30 && dryingRate < 0.5) {
		intel.push({
			icon: '\u{1F9ED}',
			label: 'North-Facing',
			detail: 'Retaining moisture longest \u2014 slow drying conditions',
			relevance: 'secondary'
		});
	}

	// VPD context
	if (latestVPD != null) {
		if (latestVPD > 2.0) {
			intel.push({
				icon: '\u{1F3DC}\u{FE0F}',
				label: 'Air Very Dry',
				detail: 'High VPD \u2014 trails drying fast, dust risk on exposed',
				relevance: 'secondary'
			});
		} else if (latestVPD < 0.3) {
			intel.push({
				icon: '\u{1F4A7}',
				label: 'Air Saturated',
				detail: 'Low VPD \u2014 moisture lingering, minimal evaporation',
				relevance: 'secondary'
			});
		}
	}

	// Seasonal context
	if (seasonalBaseline < 10) {
		intel.push({
			icon: '\u{1F319}',
			label: 'Moon Dust Season',
			detail: 'Extended dry \u2014 trails very powdery baseline',
			relevance: 'primary'
		});
	} else if (seasonalBaseline > 35) {
		intel.push({
			icon: '\u{1F4A6}',
			label: 'Wet Season',
			detail: 'Ambient moisture high \u2014 non-exposed trails stay tacky',
			relevance: 'secondary'
		});
	}

	// Sort primary first, cap at 5
	intel.sort((a, b) => {
		if (a.relevance === b.relevance) return 0;
		return a.relevance === 'primary' ? -1 : 1;
	});
	return intel.slice(0, 5);
}

// --- Summary ---

function buildSummary(
	totalRain: number,
	lastRainHoursAgo: number | null,
	temperature: number | null,
	humidity: number | null,
	label: string,
	moistureEvents: MoistureEvent[],
	seasonalBaseline: number
): string {
	const parts: string[] = [];

	// Lead with most recent moisture event
	const recentEvent = moistureEvents.find((e) => e.hoursAgo <= 24);
	if (recentEvent) {
		parts.push(recentEvent.description);
	} else if (totalRain > 0 && lastRainHoursAgo !== null) {
		parts.push(`${totalRain}" rain ${lastRainHoursAgo}h ago`);
	} else if (totalRain === 0 && seasonalBaseline < 10) {
		parts.push('Dry spell \u2014 moon dust risk');
	} else if (totalRain === 0) {
		parts.push('No rain in 7d');
	}

	if (temperature != null) {
		const tempStr = `${Math.round(temperature)}\u00B0F`;
		if (humidity != null) {
			parts.push(`${tempStr}, ${Math.round(humidity)}% humidity`);
		} else {
			parts.push(tempStr);
		}
	}

	if (parts.length === 0) return label;
	return parts.join(' \u00B7 ');
}

// --- Main computation ---

export function computeHeroDirt(
	observed: ObservedWeather,
	forecast: HourlyPeriod[]
): HeroDirtScore {
	const nowMs = Date.now();

	// 1. Current conditions
	const latest = getLatestConditions(observed);
	const forecastNow = forecast.length > 0 ? forecast[0] : null;
	const temperature = latest.temperature ?? forecastNow?.temperature ?? null;
	const humidity = latest.humidity ?? forecastNow?.relativeHumidity ?? null;
	const dewpoint = latest.dewpoint ?? forecastNow?.dewpoint ?? null;
	const windSpeed = latest.windSpeed ?? (forecastNow ? parseFloat(forecastNow.windSpeed) : null);

	// 2. Drying rate
	const dryingRate = computeDryingRate(temperature, humidity, dewpoint, windSpeed);

	// 3. Seasonal baseline
	const seasonalBaseline = computeSeasonalBaseline(observed.soilMoisture0to1cm);

	// 4. Moisture events
	const dewEvents = detectDewEvents(observed, nowMs);
	const fogEvents = detectFogEvents(observed, nowMs);
	const moistureEvents = [...dewEvents, ...fogEvents].sort((a, b) => a.hoursAgo - b.hoursAgo);

	// 5. Primary moisture estimation
	let moistureEstimate: number;
	let moistureSource: 'soil-sensor' | 'rain-model';

	const latestSoil = getLatestSoilMoisture(observed.soilMoisture0to1cm, observed.time, nowMs);

	if (latestSoil != null) {
		moistureEstimate = soilMoistureToPercent(latestSoil);
		moistureSource = 'soil-sensor';
	} else {
		const { effectiveRain } = computeEffectiveRain(
			observed.time,
			observed.precipitation,
			nowMs,
			dryingRate
		);
		const baseMoisture = estimateMoistureFromRain(effectiveRain, seasonalBaseline);
		const eventBump = moistureBumpFromEvents(moistureEvents);
		moistureEstimate = Math.round(Math.min(100, baseMoisture + eventBump));
		moistureSource = 'rain-model';
	}

	// 6. Rain stats (always computed for display)
	const { totalRain, lastRainHoursAgo } = computeEffectiveRain(
		observed.time,
		observed.precipitation,
		nowMs,
		dryingRate
	);

	// 7. Score + label
	const score = moistureToScore(moistureEstimate);
	const { label, color } = scoreToLabel(score, moistureEstimate);

	// 8. Trail intel
	const trailIntel = buildTrailIntel(
		observed,
		moistureEvents,
		moistureEstimate,
		dryingRate,
		seasonalBaseline
	);

	// 9. Confidence
	let confidence: 'high' | 'medium' | 'low' = 'high';
	if (observed.time.length === 0) {
		confidence = 'low';
	} else if (moistureSource === 'rain-model') {
		confidence = 'medium';
	}

	// 10. Summary
	const summary = buildSummary(
		totalRain,
		lastRainHoursAgo,
		temperature,
		humidity,
		label,
		moistureEvents,
		seasonalBaseline
	);

	return {
		score,
		label,
		color,
		moistureEstimate,
		lastRainHoursAgo,
		totalRecentRain: totalRain,
		dryingRate,
		confidence,
		summary,
		moistureSource,
		seasonalBaseline,
		moistureEvents,
		trailIntel
	};
}

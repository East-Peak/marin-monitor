// src/lib/config/fitness.ts

import type { FitnessType } from '$lib/types/fitness';

/** Blob storage key */
export const FITNESS_BLOB_KEY = 'marin-fitness.json';

/** Max history entries (24 months = 2 years at monthly cadence) */
export const MAX_FITNESS_HISTORY = 24;

/** Accent color (pink) */
export const FITNESS_ACCENT = '#ec4899';

/** Accent color with transparency for area fills */
export const FITNESS_ACCENT_FILL = 'rgba(236, 72, 153, 0.1)';

/** Fitness type display order */
export const TYPE_ORDER: FitnessType[] = ['yoga', 'pilates', 'cycling', 'hiit', 'crossfit'];

/** Human-readable labels for each type */
export const TYPE_LABELS: Record<FitnessType, string> = {
	yoga: 'Yoga',
	pilates: 'Pilates (Reformer)',
	cycling: 'Cycling',
	hiit: 'HIIT',
	crossfit: 'CrossFit'
};

/** Pin colors per fitness type (for map layer) */
export const TYPE_COLORS: Record<FitnessType, string> = {
	yoga: '#a78bfa',    // violet
	pilates: '#f472b6', // pink
	cycling: '#38bdf8', // sky
	hiit: '#fb923c',    // orange
	crossfit: '#4ade80' // green
};

export interface FitnessStudioConfig {
	id: string;
	name: string;
	town: string;
	type: FitnessType;
	/** Drop-in class price in dollars */
	dropInPrice: number;
	lat: number;
	lon: number;
}

/**
 * All tracked Marin fitness studios with current drop-in pricing.
 * Prices are hardcoded for v1 (updated quarterly at most).
 * A future version could use Playwright to scrape booking platforms.
 */
export const FITNESS_STUDIOS: FitnessStudioConfig[] = [
	// --- Yoga ---
	{
		id: 'love-story-yoga',
		name: 'Love Story Yoga',
		town: 'Larkspur',
		type: 'yoga',
		dropInPrice: 27,
		lat: 37.9410,
		lon: -122.5350
	},
	{
		id: 'marin-iyengar-yoga',
		name: 'Marin Iyengar Yoga',
		town: 'Corte Madera',
		type: 'yoga',
		dropInPrice: 29,
		lat: 37.9250,
		lon: -122.5270
	},
	{
		id: 'now-power-yoga',
		name: 'NOW Power Yoga',
		town: 'Corte Madera',
		type: 'yoga',
		dropInPrice: 30,
		lat: 37.9250,
		lon: -122.5240
	},
	{
		id: 'embrace-yoga',
		name: 'Embrace Yoga',
		town: 'San Rafael',
		type: 'yoga',
		dropInPrice: 32,
		lat: 37.9735,
		lon: -122.5150
	},
	{
		id: 'sukha-yoga',
		name: 'Sukha Yoga',
		town: 'Novato',
		type: 'yoga',
		dropInPrice: 34,
		lat: 38.1077,
		lon: -122.5697
	},
	{
		id: 'pilates-tiburon-yoga',
		name: 'Pilates Tiburon (yoga/barre)',
		town: 'Tiburon',
		type: 'yoga',
		dropInPrice: 34,
		lat: 37.8735,
		lon: -122.4567
	},
	{
		id: 'studio-mv-yoga',
		name: 'The Studio MV (yoga)',
		town: 'Mill Valley',
		type: 'yoga',
		dropInPrice: 38,
		lat: 37.9060,
		lon: -122.5480
	},
	{
		id: 'hot-yoga-republic',
		name: 'Hot Yoga Republic',
		town: 'Mill Valley',
		type: 'yoga',
		dropInPrice: 39,
		lat: 37.9060,
		lon: -122.5450
	},

	// --- Pilates (Reformer) ---
	{
		id: 'pilates-tiburon-reformer',
		name: 'Pilates Tiburon (reformer)',
		town: 'Tiburon',
		type: 'pilates',
		dropInPrice: 45,
		lat: 37.8735,
		lon: -122.4567
	},
	{
		id: 'studio-mv-reformer',
		name: 'The Studio MV (reformer)',
		town: 'Mill Valley',
		type: 'pilates',
		dropInPrice: 45,
		lat: 37.9060,
		lon: -122.5480
	},
	{
		id: 'mighty-pilates',
		name: 'Mighty Pilates',
		town: 'Larkspur',
		type: 'pilates',
		dropInPrice: 50,
		lat: 37.9410,
		lon: -122.5360
	},
	{
		id: 'studio-pilates-marin',
		name: 'Studio Pilates Marin',
		town: 'San Rafael',
		type: 'pilates',
		dropInPrice: 50,
		lat: 37.9735,
		lon: -122.5120
	},
	{
		id: 'internal-fire-pilates',
		name: 'Internal Fire Pilates',
		town: 'Mill Valley',
		type: 'pilates',
		dropInPrice: 55,
		lat: 37.9060,
		lon: -122.5490
	},

	// --- Cycling ---
	{
		id: 'soulcycle-larkspur',
		name: 'SoulCycle',
		town: 'Larkspur',
		type: 'cycling',
		dropInPrice: 39,
		lat: 37.9410,
		lon: -122.5340
	},

	// --- HIIT ---
	{
		id: 'orangetheory-greenbrae',
		name: 'Orangetheory',
		town: 'Greenbrae',
		type: 'hiit',
		dropInPrice: 29,
		lat: 37.9460,
		lon: -122.5290
	},

	// --- CrossFit ---
	{
		id: 'tamalpais-crossfit',
		name: 'Tamalpais CrossFit',
		town: 'San Rafael',
		type: 'crossfit',
		dropInPrice: 25,
		lat: 37.9700,
		lon: -122.5100
	}
];

/**
 * Compute median from an array of numbers.
 */
export function computeMedian(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100
		: sorted[mid];
}

/**
 * Compute median drop-in price per fitness type.
 */
export function computeMedianByType(
	studios: FitnessStudioConfig[]
): Partial<Record<FitnessType, number>> {
	const result: Partial<Record<FitnessType, number>> = {};
	for (const type of TYPE_ORDER) {
		const prices = studios.filter((s) => s.type === type).map((s) => s.dropInPrice);
		const median = computeMedian(prices);
		if (median !== null) {
			result[type] = median;
		}
	}
	return result;
}

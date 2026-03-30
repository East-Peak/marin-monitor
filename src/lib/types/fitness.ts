// src/lib/types/fitness.ts

/** Fitness class type for color-coding map pins */
export type FitnessType = 'yoga' | 'pilates' | 'cycling' | 'crossfit' | 'hiit';

/** A single fitness studio with its current drop-in price */
export interface FitnessStudio {
	id: string;
	name: string;
	town: string;
	type: FitnessType;
	/** Drop-in class price in dollars */
	dropInPrice: number;
	lat: number;
	lon: number;
}

/** A point-in-time snapshot of all fitness studios */
export interface FitnessSnapshot {
	timestamp: string;
	lastSuccessfulScrapeAt?: string | null;
	studioCount: number;
	medianPrice: number | null;
	avgPrice: number | null;
	minPrice: number | null;
	maxPrice: number | null;
	/** Median price per type */
	medianByType: Partial<Record<FitnessType, number>>;
	studios: FitnessStudio[];
}

/** Top-level Blob shape (mirrors CoffeeData / SchoolIndexData pattern) */
export interface FitnessData {
	current: FitnessSnapshot | null;
	/** History entries omit studios[] to keep size small */
	history: Array<{
		timestamp: string;
		studioCount: number;
		medianPrice: number | null;
		avgPrice: number | null;
		minPrice: number | null;
		maxPrice: number | null;
		medianByType: Partial<Record<FitnessType, number>>;
	}>;
}

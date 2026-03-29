// src/lib/types/school.ts

/** School level for tuition tier grouping */
export type SchoolLevel = 'preschool' | 'elementary' | 'middle' | 'high';

/** A single private school with its current tuition */
export interface School {
	id: string;
	name: string;
	town: string;
	level: SchoolLevel;
	/** Annual tuition in dollars (sticker/max price) */
	tuition: number;
	/** Boarding tuition if applicable (San Domenico) */
	boardingTuition?: number;
	/** Total cost including fees, if different from tuition */
	totalCost?: number;
	/** School admissions/tuition page URL */
	url: string;
	lat: number;
	lon: number;
}

/** Aggregate tuition data for one school level */
export interface TuitionTier {
	level: SchoolLevel;
	/** Human-readable label, e.g. "Elementary (K-5)" */
	label: string;
	/** Average tuition across schools in this tier */
	avgTuition: number;
	/** Average tuition as percentage of median household income */
	pctOfMedianIncome: number;
}

/** A point-in-time snapshot of the school tuition index */
export interface SchoolSnapshot {
	timestamp: string;
	/** Median Marin County household income used for calculations */
	medianHouseholdIncome: number;
	/** Source citation for income data */
	incomeSource: string;
	/** Year of income data */
	incomeYear: string;
	/** Tier-level averages */
	tiers: TuitionTier[];
	/** All individual schools */
	schools: School[];
	/** Cumulative K-12 cost (13 years at tier averages) */
	cumulativeK12: number;
}

/** Top-level Blob shape (mirrors CoffeeData / WineIndexData pattern) */
export interface SchoolIndexData {
	current: SchoolSnapshot | null;
	/** History entries store tiers only (no individual schools) to keep size small */
	history: Array<{
		timestamp: string;
		medianHouseholdIncome: number;
		tiers: TuitionTier[];
		cumulativeK12: number;
	}>;
}

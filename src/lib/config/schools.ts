// src/lib/config/schools.ts

import type { SchoolLevel, TuitionTier } from '$lib/types/school';

/** Blob storage key */
export const SCHOOL_TUITION_BLOB_KEY = 'marin-school-tuition.json';

/** Max history entries (24 months = 2 years at monthly cadence) */
export const MAX_SCHOOL_HISTORY = 24;

/** Accent color (teal/cyan -- education feel) */
export const SCHOOL_ACCENT = '#0891b2';

/** Accent color with transparency for area fills */
export const SCHOOL_ACCENT_FILL = 'rgba(8, 145, 178, 0.1)';

/** Median Marin County household income (Census ACS 2024 estimate) */
export const MEDIAN_HOUSEHOLD_INCOME = 145_000;

/** Income data source citation */
export const INCOME_SOURCE = 'U.S. Census Bureau, American Community Survey';

/** Income data year */
export const INCOME_YEAR = '2024';

/** School level display order */
export const LEVEL_ORDER: SchoolLevel[] = ['preschool', 'elementary', 'middle', 'high'];

/** Human-readable labels for each level */
export const LEVEL_LABELS: Record<SchoolLevel, string> = {
	preschool: 'Preschool',
	elementary: 'Elementary (K-5)',
	middle: 'Middle School (6-8)',
	high: 'High School (9-12)'
};

/** Number of years at each level for cumulative K-12 calculation */
export const YEARS_PER_LEVEL: Record<SchoolLevel, number> = {
	preschool: 0, // Not included in K-12 cumulative
	elementary: 6, // K through 5
	middle: 3, // 6 through 8
	high: 4 // 9 through 12
};

export interface SchoolConfig {
	id: string;
	name: string;
	town: string;
	level: SchoolLevel;
	/** Annual tuition (sticker/max price) */
	tuition: number;
	/** Boarding tuition if applicable */
	boardingTuition?: number;
	/** Total cost including fees, if different */
	totalCost?: number;
	/** School admissions/tuition page URL */
	url: string;
	lat: number;
	lon: number;
}

/**
 * All tracked Marin private schools with current tuition data.
 * Tuition values are hardcoded for v1 (updated once per year).
 * Ring Mountain Day School omitted (permanently closed 2022).
 */
export const SCHOOLS: SchoolConfig[] = [
	{
		id: 'branson',
		name: 'The Branson School',
		town: 'Ross',
		level: 'high',
		tuition: 61_740,
		totalCost: 71_290,
		url: 'https://www.branson.org/admission/tuition-financial-aid',
		lat: 37.9624,
		lon: -122.5561
	},
	{
		id: 'san-domenico',
		name: 'San Domenico School',
		town: 'San Anselmo',
		level: 'high',
		tuition: 66_950,
		boardingTuition: 83_450,
		url: 'https://www.sandomenico.org/admission/tuition-and-financial-aid',
		lat: 37.983,
		lon: -122.57
	},
	{
		id: 'marin-academy',
		name: 'Marin Academy',
		town: 'San Rafael',
		level: 'high',
		tuition: 64_750,
		url: 'https://www.ma.org/admission/tuition-financial-aid',
		lat: 37.978,
		lon: -122.521
	},
	{
		id: 'marin-country-day',
		name: 'Marin Country Day School',
		town: 'Corte Madera',
		level: 'elementary',
		tuition: 49_535,
		url: 'https://www.mcds.org/admission/tuition-financial-aid',
		lat: 37.926,
		lon: -122.517
	},
	{
		id: 'marin-primary-middle',
		name: 'Marin Primary & Middle School',
		town: 'Larkspur',
		level: 'middle',
		tuition: 49_900,
		url: 'https://www.mpms.org/admission/tuition-financial-aid',
		lat: 37.935,
		lon: -122.535
	},
	{
		id: 'marin-horizon',
		name: 'Marin Horizon School',
		town: 'Mill Valley',
		level: 'elementary',
		tuition: 47_590,
		url: 'https://www.marinhorizon.org/admission/tuition',
		lat: 37.906,
		lon: -122.545
	},
	{
		id: 'marin-montessori',
		name: 'Marin Montessori School',
		town: 'Corte Madera',
		level: 'preschool',
		tuition: 42_690,
		url: 'https://www.marinmontessori.org/admissions/tuition',
		lat: 37.925,
		lon: -122.523
	}
];

/**
 * Compute tier averages from school configs.
 * Groups schools by level and calculates average tuition and % of median income.
 */
export function computeTiers(schools: SchoolConfig[], medianIncome: number): TuitionTier[] {
	return LEVEL_ORDER.map((level) => {
		const levelSchools = schools.filter((s) => s.level === level);
		if (levelSchools.length === 0) return null;

		const avgTuition = Math.round(
			levelSchools.reduce((sum, s) => sum + s.tuition, 0) / levelSchools.length
		);

		const pctOfMedianIncome = Math.round((avgTuition / medianIncome) * 1000) / 10;

		return {
			level,
			label: LEVEL_LABELS[level],
			avgTuition,
			pctOfMedianIncome
		};
	}).filter((t): t is TuitionTier => t !== null);
}

/**
 * Compute cumulative K-12 cost (13 years) using tier averages.
 * Preschool is excluded from this total.
 */
export function computeCumulativeK12(tiers: TuitionTier[]): number {
	return tiers.reduce((total, tier) => {
		const years = YEARS_PER_LEVEL[tier.level];
		return total + tier.avgTuition * years;
	}, 0);
}

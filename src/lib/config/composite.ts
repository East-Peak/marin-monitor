// src/lib/config/composite.ts

import type { CompositeCategory, MarinNumberItem } from '$lib/types/composite';

/** Blob storage key */
export const COMPOSITE_BLOB_KEY = 'marin-composite.json';

/** Max history entries (52 weeks = 1 year at weekly cadence) */
export const MAX_COMPOSITE_HISTORY = 52;

/** Accent color for the composite panel */
export const COMPOSITE_ACCENT = '#dc2626';

/** Tier weight definitions — must sum to 1.0 */
export interface TierConfig {
	category: CompositeCategory;
	label: string;
	weight: number;
	/** Baseline monthly total for base-100 scoring */
	baseline: number;
}

export const TIER_CONFIGS: TierConfig[] = [
	{
		category: 'daily-life',
		label: 'Daily Life',
		weight: 0.4,
		baseline: 1153 // $796 groceries + $116 coffee + $241 gas
	},
	{
		category: 'lifestyle',
		label: 'Lifestyle',
		weight: 0.25,
		baseline: 331 // ~$156 wine (2 bottles Napa Cab) + $175 fitness
	},
	{
		category: 'housing',
		label: 'Housing',
		weight: 0.25,
		baseline: 8566 // PITI on median home
	},
	{
		category: 'structural',
		label: 'Structural',
		weight: 0.1,
		baseline: 5167 // ~$3,917 school + $1,250 country club
	}
];

/**
 * Static/annual Marin Number line items.
 * Items with sourceIndex can be upgraded to 'live' when blob data exists.
 * Items without sourceIndex are always static.
 */
export const STATIC_MARIN_NUMBER_ITEMS: MarinNumberItem[] = [
	{ label: 'Rivian R1S payment', monthly: 1100, source: 'static', sourceIndex: 'rivian-lease' },
	{ label: 'The Dog', monthly: 1500, source: 'static', sourceIndex: 'dog-walker' },
	{ label: 'Therapist (weekly)', monthly: 1400, source: 'static' },
	{
		label: 'Ski season (amortized)',
		monthly: 600,
		source: 'static',
		sourceIndex: 'ikon-pass'
	},
	{
		label: 'Summer camp (2 kids, amortized)',
		monthly: 1200,
		source: 'static',
		sourceIndex: 'camp-prices'
	},
	{ label: 'Country club (amortized)', monthly: 1250, source: 'static' },
	{ label: 'Wine country trips (amortized)', monthly: 750, source: 'static' },
	{ label: 'Farmers market', monthly: 500, source: 'static' },
	{ label: 'Marin Country Mart (2x/mo)', monthly: 1000, source: 'static' },
	{ label: 'Acupuncture (biweekly)', monthly: 300, source: 'static' }
];

/**
 * Default/fallback values for dynamic Marin Number items.
 * Used when live index data is not yet available.
 */
export const DYNAMIC_DEFAULTS = {
	housingPITI: 8566,
	groceryMonthly: 796,
	coffeeMonthly: 116,
	wineMonthly: 156,
	fitnessMonthly: 175,
	gasMonthly: 241,
	schoolMonthly: 3917,
	// New live-capable items (blob scrapers)
	rivianLease: 1100,
	dogMonthly: 1500,
	skiSeason: 600,
	campMonthly: 1200
} as const;

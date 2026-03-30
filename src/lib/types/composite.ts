// src/lib/types/composite.ts

/** Tier categories for the Cost of Being Marin composite index */
export type CompositeCategory = 'daily-life' | 'lifestyle' | 'housing' | 'structural';

/** A single tier's score at a point in time */
export interface TierScore {
	category: CompositeCategory;
	label: string;
	/** Sum of monthly costs in this tier */
	monthlyTotal: number;
	/** Baseline monthly total (first measurement / configured default) */
	baselineTotal: number;
	/** Base-100 index score: 100 × (monthlyTotal / baselineTotal) */
	score: number;
	/** Weight in the composite (0-1, all tiers sum to 1.0) */
	weight: number;
}

/** A single line item in The Marin Number breakdown */
export interface MarinNumberItem {
	label: string;
	/** Monthly cost in dollars */
	monthly: number;
	/** Whether this value is computed from live index data or a static config value */
	source: 'live' | 'static';
	/** Which index this pulls from, if live */
	sourceIndex?: string;
}

/** A complete snapshot of the composite index at a point in time */
export interface CompositeSnapshot {
	timestamp: string;
	lastSuccessfulScrapeAt?: string | null;
	/** Individual tier scores */
	tiers: TierScore[];
	/** Weighted composite score (base 100) */
	compositeScore: number;
	/** The Marin Number breakdown */
	marinNumber: {
		/** Total monthly cost */
		total: number;
		/** Individual line items */
		items: MarinNumberItem[];
		/** Annual cost (total × 12) */
		annualized: number;
	};
}

/** Top-level data structure stored in Vercel Blob */
export interface CompositeData {
	current: CompositeSnapshot | null;
	history: CompositeSnapshot[];
}

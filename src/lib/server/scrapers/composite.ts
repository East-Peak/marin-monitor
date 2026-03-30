// src/lib/server/scrapers/composite.ts

/**
 * Composite index builder — aggregates existing index data into
 * the Cost of Being Marin composite and The Marin Number.
 *
 * This does NOT scrape anything. It reads from already-collected
 * index data (blobs) and computes derived scores.
 */

import { TIER_CONFIGS, STATIC_MARIN_NUMBER_ITEMS, DYNAMIC_DEFAULTS } from '$lib/config/composite';
import { withSuccessfulScrapeMetadata } from '$lib/server/scrape-metadata';
import type { CoffeeData } from '$lib/types/coffee';
import type { GroceryBasketData } from '$lib/types/grocery';
import type { WineIndexData, WineCategory } from '$lib/types/wine';
import type { FitnessData } from '$lib/types/fitness';
import type { SchoolIndexData } from '$lib/types/school';
import type { GasPriceData } from '$lib/types/gas';
import type { HousingMetric } from '$lib/api/marin/housing';
import type { CompositeSnapshot, TierScore, MarinNumberItem } from '$lib/types/composite';

/** Blob data shapes for new scrapers */
export interface CampPriceData {
	current: {
		medianWeekly: number;
		monthlyAmortized2Kids: number;
		sessionCount: number;
		providerCount: number;
		lastSuccessfulScrapeAt?: string | null;
	} | null;
}

export interface IkonPassData {
	current: {
		adultPrice: number;
		childPrice: number;
		familyOf4: number;
		monthlyAmortized: number;
		scraped: boolean;
		lastSuccessfulScrapeAt?: string | null;
		lastLiveScrapeAt?: string | null;
	} | null;
}

export interface DogWalkerData {
	current: {
		medianWalkPrice: number;
		monthlyAt3xWeek: number;
		walkerCount: number;
		scraped: boolean;
		lastSuccessfulScrapeAt?: string | null;
		lastLiveScrapeAt?: string | null;
	} | null;
}

export interface RivianLeaseData {
	current: {
		leaseMonthly: number;
		msrp: number;
		scraped: boolean;
		lastSuccessfulScrapeAt?: string | null;
		lastLiveScrapeAt?: string | null;
	} | null;
}

/** Input data from all index blobs */
export interface CompositeInputs {
	grocery: GroceryBasketData | null;
	cappuccino: CoffeeData | null;
	wine: WineIndexData | null;
	fitness: FitnessData | null;
	school: SchoolIndexData | null;
	housing: HousingMetric[] | null;
	gas: GasPriceData | null;
	campPrices: CampPriceData | null;
	ikonPass: IkonPassData | null;
	dogWalker: DogWalkerData | null;
	rivianLease: RivianLeaseData | null;
}

/**
 * Extract monthly grocery cost from basket data.
 * Basket total is weekly; multiply by 4.3 for monthly.
 */
export function getGroceryMonthly(data: GroceryBasketData | null): number | null {
	const weeklyTotal = data?.current?.totalCheapest ?? null;
	if (weeklyTotal === null) return null;
	return Math.round(weeklyTotal * 4.3);
}

/**
 * Extract monthly coffee cost from cappuccino data.
 * Median cappuccino price × 22 workdays.
 */
export function getCoffeeMonthly(data: CoffeeData | null): number | null {
	const median = data?.current?.medianPrice ?? null;
	if (median === null) return null;
	return Math.round(median * 22);
}

/**
 * Extract monthly wine cost from wine index data.
 * 2 bottles of Napa Cab median per month.
 */
export function getWineMonthly(data: WineIndexData | null): number | null {
	const napaCategory = data?.current?.categories?.find(
		(c) => c.category === ('napa-sonoma' as WineCategory)
	);
	const median = napaCategory?.medianPrice ?? null;
	if (median === null) return null;
	return Math.round(median * 2);
}

/**
 * Extract monthly fitness cost from fitness data.
 * Uses the median yoga price as the monthly unlimited proxy.
 * Falls back to overall median × 5 (rough monthly unlimited estimate).
 */
export function getFitnessMonthly(data: FitnessData | null): number | null {
	const yogaMedian = data?.current?.medianByType?.yoga ?? null;
	if (yogaMedian !== null) {
		// Yoga monthly unlimited is roughly 5-6x a single drop-in
		return Math.round(yogaMedian * 5.5);
	}
	// Fallback: overall median × 5.5
	const overallMedian = data?.current?.medianPrice ?? null;
	if (overallMedian === null) return null;
	return Math.round(overallMedian * 5.5);
}

/**
 * Extract monthly gas cost from gas price data.
 * Average regular price × 40 gallons/month.
 */
export function getGasMonthly(data: GasPriceData | null): number | null {
	const avgRegular = data?.current?.avgRegular ?? null;
	if (avgRegular === null) return null;
	return Math.round(avgRegular * 40);
}

/**
 * Compute estimated monthly PITI on the median home.
 * 20% down, 6.38% 30yr fixed, 1.1% property tax, insurance.
 */
export function getHousingPITI(housing: HousingMetric[] | null): number | null {
	if (!housing || housing.length === 0) return null;
	// Use the most recent month's median price
	const latest = housing[housing.length - 1];
	if (!latest.medianPrice) return null;

	const price = latest.medianPrice;
	const downPayment = price * 0.2;
	const loanAmount = price - downPayment;
	const monthlyRate = 0.0638 / 12;
	const numPayments = 360; // 30 years

	// Monthly P&I
	const pi =
		(loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments))) /
		(Math.pow(1 + monthlyRate, numPayments) - 1);

	// Property tax (1.1% annual / 12)
	const propertyTax = (price * 0.011) / 12;

	// Insurance (rough estimate)
	const insurance = 292;

	return Math.round(pi + propertyTax + insurance);
}

/**
 * Extract monthly school tuition from school index data.
 * K-8 average annual tuition / 12.
 */
export function getSchoolMonthly(data: SchoolIndexData | null): number | null {
	if (!data?.current?.tiers) return null;
	// Find elementary and middle tiers, average them
	const elementary = data.current.tiers.find((t) => t.level === 'elementary');
	const middle = data.current.tiers.find((t) => t.level === 'middle');

	const tuitions: number[] = [];
	if (elementary) tuitions.push(elementary.avgTuition);
	if (middle) tuitions.push(middle.avgTuition);

	if (tuitions.length === 0) return null;
	const avgAnnual = tuitions.reduce((a, b) => a + b, 0) / tuitions.length;
	return Math.round(avgAnnual / 12);
}

/**
 * Extract monthly camp cost from camp price data.
 * Uses the amortized 2-kid monthly cost from the blob.
 */
export function getCampMonthly(data: CampPriceData | null): number | null {
	return data?.current?.monthlyAmortized2Kids ?? null;
}

/**
 * Extract monthly ski season cost from Ikon Pass data.
 * Family-of-4 pass amortized over 12 months.
 */
export function getSkiMonthly(data: IkonPassData | null): number | null {
	return data?.current?.monthlyAmortized ?? null;
}

/**
 * Extract monthly dog cost from dog walker data.
 * Uses dog walker monthly cost as the walker component of total dog costs.
 * The full "The Dog" line item includes walker + grooming + food + vet.
 * Walker is roughly 25-30% of total dog cost, so we scale up.
 */
export function getDogMonthly(data: DogWalkerData | null): number | null {
	const walkerMonthly = data?.current?.monthlyAt3xWeek ?? null;
	if (walkerMonthly === null) return null;
	// Total dog cost: walker + food (~$150) + grooming (~$150) + vet amortized (~$200) + misc (~$100)
	return walkerMonthly + 600;
}

/**
 * Extract monthly Rivian lease payment from scraper data.
 */
export function getRivianMonthly(data: RivianLeaseData | null): number | null {
	return data?.current?.leaseMonthly ?? null;
}

function hasLiveHousingData(housing: HousingMetric[] | null): boolean {
	return getHousingPITI(housing) !== null;
}

function hasLiveIkonData(data: IkonPassData | null): boolean {
	return data?.current?.scraped === true;
}

function hasLiveDogWalkerData(data: DogWalkerData | null): boolean {
	return data?.current?.scraped === true;
}

function hasLiveRivianData(data: RivianLeaseData | null): boolean {
	return data?.current?.scraped === true;
}

/**
 * Build a complete composite snapshot from all available index data.
 */
export function buildCompositeSnapshot(inputs: CompositeInputs): CompositeSnapshot {
	// Extract live values with fallbacks
	const groceryMonthly = getGroceryMonthly(inputs.grocery) ?? DYNAMIC_DEFAULTS.groceryMonthly;
	const coffeeMonthly = getCoffeeMonthly(inputs.cappuccino) ?? DYNAMIC_DEFAULTS.coffeeMonthly;
	const gasMonthly = getGasMonthly(inputs.gas) ?? DYNAMIC_DEFAULTS.gasMonthly;
	const wineMonthly = getWineMonthly(inputs.wine) ?? DYNAMIC_DEFAULTS.wineMonthly;
	const fitnessMonthly = getFitnessMonthly(inputs.fitness) ?? DYNAMIC_DEFAULTS.fitnessMonthly;
	const housingPITI = getHousingPITI(inputs.housing) ?? DYNAMIC_DEFAULTS.housingPITI;
	const schoolMonthly = getSchoolMonthly(inputs.school) ?? DYNAMIC_DEFAULTS.schoolMonthly;

	// New live-capable items
	const rivianLease = getRivianMonthly(inputs.rivianLease) ?? DYNAMIC_DEFAULTS.rivianLease;
	const dogMonthly = getDogMonthly(inputs.dogWalker) ?? DYNAMIC_DEFAULTS.dogMonthly;
	const skiSeason = getSkiMonthly(inputs.ikonPass) ?? DYNAMIC_DEFAULTS.skiSeason;
	const campMonthly = getCampMonthly(inputs.campPrices) ?? DYNAMIC_DEFAULTS.campMonthly;

	// Tier monthly totals
	const tierTotals: Record<string, number> = {
		'daily-life': groceryMonthly + coffeeMonthly + gasMonthly,
		lifestyle: wineMonthly + fitnessMonthly,
		housing: housingPITI,
		structural: schoolMonthly + 1250 // country club
	};

	// Build tier scores
	const tiers: TierScore[] = TIER_CONFIGS.map((config) => {
		const monthlyTotal = tierTotals[config.category];
		const score = Math.round((monthlyTotal / config.baseline) * 100 * 10) / 10;
		return {
			category: config.category,
			label: config.label,
			monthlyTotal,
			baselineTotal: config.baseline,
			score,
			weight: config.weight
		};
	});

	// Composite score = weighted average of tier scores
	const compositeScore =
		Math.round(tiers.reduce((sum, t) => sum + t.score * t.weight, 0) * 10) / 10;

	// Build The Marin Number items — core indices (always dynamic)
	const dynamicItems: MarinNumberItem[] = [
		{
			label: 'Housing (PITI on median home)',
			monthly: housingPITI,
			source: hasLiveHousingData(inputs.housing) ? 'live' : 'static',
			sourceIndex: 'housing'
		},
		{
			label: 'Groceries (Bare Essentials x 4.3)',
			monthly: groceryMonthly,
			source: getGroceryMonthly(inputs.grocery) !== null ? 'live' : 'static',
			sourceIndex: 'grocery-basket'
		},
		{
			label: 'Coffee (daily cappuccino x 22)',
			monthly: coffeeMonthly,
			source: getCoffeeMonthly(inputs.cappuccino) !== null ? 'live' : 'static',
			sourceIndex: 'cappuccino'
		},
		{
			label: 'Wine (2 bottles Napa Cab)',
			monthly: wineMonthly,
			source: getWineMonthly(inputs.wine) !== null ? 'live' : 'static',
			sourceIndex: 'wine-index'
		},
		{
			label: 'Fitness (monthly unlimited yoga)',
			monthly: fitnessMonthly,
			source: getFitnessMonthly(inputs.fitness) !== null ? 'live' : 'static',
			sourceIndex: 'fitness'
		},
		{
			label: 'Gas (~40 gal/mo)',
			monthly: gasMonthly,
			source: getGasMonthly(inputs.gas) !== null ? 'live' : 'static',
			sourceIndex: 'gas-prices'
		},
		{
			label: 'Private school (1 kid, K-8 avg)',
			monthly: schoolMonthly,
			source: getSchoolMonthly(inputs.school) !== null ? 'live' : 'static',
			sourceIndex: 'school-tuition'
		}
	];

	// Build upgraded static items — replace values with live data when available
	const upgradedStaticItems: MarinNumberItem[] = STATIC_MARIN_NUMBER_ITEMS.map((item) => {
		switch (item.sourceIndex) {
				case 'rivian-lease':
					return {
						...item,
						monthly: rivianLease,
						source: hasLiveRivianData(inputs.rivianLease) ? 'live' : 'static'
					};
				case 'dog-walker':
					return {
						...item,
						monthly: dogMonthly,
						source: hasLiveDogWalkerData(inputs.dogWalker) ? 'live' : 'static'
					};
				case 'ikon-pass':
					return {
						...item,
						monthly: skiSeason,
						source: hasLiveIkonData(inputs.ikonPass) ? 'live' : 'static'
					};
			case 'camp-prices':
				return {
					...item,
					monthly: campMonthly,
					source: getCampMonthly(inputs.campPrices) !== null ? 'live' : 'static'
				};
			default:
				return item;
		}
	});

	const allItems = [...dynamicItems, ...upgradedStaticItems];
	const total = allItems.reduce((sum, item) => sum + item.monthly, 0);

	return withSuccessfulScrapeMetadata({
		timestamp: new Date().toISOString(),
		tiers,
		compositeScore,
		marinNumber: {
			total,
			items: allItems,
			annualized: total * 12
		}
	});
}

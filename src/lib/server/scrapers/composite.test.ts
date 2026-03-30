// src/lib/server/scrapers/composite.test.ts

import { describe, it, expect } from 'vitest';
import {
	buildCompositeSnapshot,
	getGroceryMonthly,
	getCoffeeMonthly,
	getWineMonthly,
	getFitnessMonthly,
	getGasMonthly,
	getHousingPITI,
	getSchoolMonthly,
	getCampMonthly,
	getSkiMonthly,
	getDogMonthly,
	getRivianMonthly,
	type CompositeInputs,
	type CampPriceData,
	type IkonPassData,
	type DogWalkerData,
	type RivianLeaseData
} from './composite';
import { TIER_CONFIGS } from '$lib/config/composite';
import type { CoffeeData } from '$lib/types/coffee';
import type { GroceryBasketData } from '$lib/types/grocery';
import type { WineIndexData } from '$lib/types/wine';
import type { FitnessData } from '$lib/types/fitness';
import type { SchoolIndexData } from '$lib/types/school';
import type { GasPriceData } from '$lib/types/gas';
import type { HousingMetric } from '$lib/api/marin/housing';

// --- Helper factories ---

function makeGroceryData(weeklyTotal: number): GroceryBasketData {
	return {
		current: { timestamp: '2026-03-29T00:00:00Z', totalCheapest: weeklyTotal, totalExpensive: weeklyTotal + 50, itemsFound: 12, items: [] },
		history: []
	};
}

function makeCoffeeData(median: number): CoffeeData {
	return {
		current: { timestamp: '2026-03-29T00:00:00Z', shopCount: 10, medianPrice: median, avgPrice: median, minPrice: median - 1, maxPrice: median + 1, shops: [] },
		history: []
	};
}

function makeWineData(napaMedian: number): WineIndexData {
	return {
		current: {
			timestamp: '2026-03-29T00:00:00Z',
			categories: [
				{ category: 'napa-sonoma', label: 'Napa & Sonoma', productCount: 50, medianPrice: napaMedian, minPrice: 20, maxPrice: 200 },
				{ category: 'burgundy', label: 'Burgundy', productCount: 30, medianPrice: 52, minPrice: 25, maxPrice: 150 }
			],
			staffPicks: [],
			allocatedWines: []
		},
		history: []
	};
}

function makeFitnessData(yogaMedian: number): FitnessData {
	return {
		current: { timestamp: '2026-03-29T00:00:00Z', studioCount: 8, medianPrice: yogaMedian, avgPrice: yogaMedian, minPrice: yogaMedian - 5, maxPrice: yogaMedian + 10, medianByType: { yoga: yogaMedian }, studios: [] },
		history: []
	};
}

function makeSchoolData(elemAvg: number, middleAvg: number): SchoolIndexData {
	return {
		current: {
			timestamp: '2026-03-29T00:00:00Z',
			medianHouseholdIncome: 145000,
			incomeSource: 'Census ACS',
			incomeYear: '2024',
			tiers: [
				{ level: 'elementary', label: 'Elementary (K-5)', avgTuition: elemAvg, pctOfMedianIncome: (elemAvg / 145000) * 100 },
				{ level: 'middle', label: 'Middle (6-8)', avgTuition: middleAvg, pctOfMedianIncome: (middleAvg / 145000) * 100 }
			],
			schools: [],
			cumulativeK12: 0
		},
		history: []
	};
}

function makeGasData(avgRegular: number): GasPriceData {
	return {
		current: { timestamp: '2026-03-29T00:00:00Z', stationCount: 20, avgRegular, avgMidgrade: avgRegular + 0.3, avgPremium: avgRegular + 0.6, avgDiesel: avgRegular + 0.5, minRegular: avgRegular - 0.2, maxRegular: avgRegular + 0.4, stations: [] },
		history: []
	};
}

function makeHousingData(medianPrice: number): HousingMetric[] {
	return [
		{ month: '2026-02', medianPrice, medianPpsf: 800, inventory: 300, daysOnMarket: 45, homesSold: 120 }
	];
}

const ALL_NULL_INPUTS: CompositeInputs = {
	grocery: null,
	cappuccino: null,
	wine: null,
	fitness: null,
	school: null,
	housing: null,
	gas: null,
	campPrices: null,
	ikonPass: null,
	dogWalker: null,
	rivianLease: null
};

// --- Extraction function tests ---

describe('getGroceryMonthly', () => {
	it('converts weekly basket total to monthly', () => {
		expect(getGroceryMonthly(makeGroceryData(185))).toBe(Math.round(185 * 4.3));
	});

	it('returns null for null data', () => {
		expect(getGroceryMonthly(null)).toBeNull();
	});

	it('returns null for missing current', () => {
		expect(getGroceryMonthly({ current: null, history: [] })).toBeNull();
	});
});

describe('getCoffeeMonthly', () => {
	it('converts daily median to monthly (22 workdays)', () => {
		expect(getCoffeeMonthly(makeCoffeeData(5.25))).toBe(Math.round(5.25 * 22));
	});

	it('returns null for null data', () => {
		expect(getCoffeeMonthly(null)).toBeNull();
	});
});

describe('getWineMonthly', () => {
	it('computes 2 bottles of Napa Cab per month', () => {
		expect(getWineMonthly(makeWineData(78))).toBe(156);
	});

	it('returns null for null data', () => {
		expect(getWineMonthly(null)).toBeNull();
	});
});

describe('getFitnessMonthly', () => {
	it('estimates monthly unlimited from yoga drop-in median', () => {
		const result = getFitnessMonthly(makeFitnessData(32));
		expect(result).toBe(Math.round(32 * 5.5));
	});

	it('returns null for null data', () => {
		expect(getFitnessMonthly(null)).toBeNull();
	});
});

describe('getGasMonthly', () => {
	it('computes 40 gal/mo at average regular price', () => {
		expect(getGasMonthly(makeGasData(6.02))).toBe(Math.round(6.02 * 40));
	});

	it('returns null for null data', () => {
		expect(getGasMonthly(null)).toBeNull();
	});
});

describe('getHousingPITI', () => {
	it('computes PITI for a given median price', () => {
		const result = getHousingPITI(makeHousingData(1357250));
		expect(result).not.toBeNull();
		// PITI should be in a reasonable range
		expect(result!).toBeGreaterThan(7000);
		expect(result!).toBeLessThan(10000);
	});

	it('returns null for null data', () => {
		expect(getHousingPITI(null)).toBeNull();
	});

	it('returns null for empty array', () => {
		expect(getHousingPITI([])).toBeNull();
	});
});

describe('getSchoolMonthly', () => {
	it('averages elementary and middle tiers, divides by 12', () => {
		const result = getSchoolMonthly(makeSchoolData(42000, 52000));
		expect(result).toBe(Math.round(47000 / 12));
	});

	it('returns null for null data', () => {
		expect(getSchoolMonthly(null)).toBeNull();
	});
});

// --- Composite builder tests ---

describe('buildCompositeSnapshot', () => {
	it('produces a valid snapshot with all-null inputs (uses defaults)', () => {
		const snapshot = buildCompositeSnapshot(ALL_NULL_INPUTS);

		expect(snapshot.timestamp).toBeTruthy();
		expect(snapshot.tiers).toHaveLength(4);
		expect(snapshot.compositeScore).toBeCloseTo(100, 0);
		expect(snapshot.marinNumber.total).toBeGreaterThan(15000);
		expect(snapshot.marinNumber.annualized).toBe(snapshot.marinNumber.total * 12);
		expect(snapshot.marinNumber.items.length).toBeGreaterThanOrEqual(16);
	});

	it('tier weights sum to 1.0', () => {
		const totalWeight = TIER_CONFIGS.reduce((sum, t) => sum + t.weight, 0);
		expect(totalWeight).toBeCloseTo(1.0, 10);
	});

	it('composite score is 100 when all values match baselines', () => {
		const snapshot = buildCompositeSnapshot(ALL_NULL_INPUTS);
		// With all defaults matching baselines, score should be ~100
		expect(snapshot.compositeScore).toBeCloseTo(100, 0);
	});

	it('composite score rises when costs increase', () => {
		const highInputs: CompositeInputs = {
			grocery: makeGroceryData(250), // higher than $185 baseline
			cappuccino: makeCoffeeData(7.0), // higher than $5.25
			wine: makeWineData(100), // higher than $78
			fitness: makeFitnessData(40), // higher than $32
			school: makeSchoolData(55000, 65000), // higher than ~$47k
			housing: makeHousingData(2000000), // higher than $1.357M
			gas: makeGasData(8.0), // higher than $6.02
			campPrices: null,
			ikonPass: null,
			dogWalker: null,
			rivianLease: null
		};
		const snapshot = buildCompositeSnapshot(highInputs);
		expect(snapshot.compositeScore).toBeGreaterThan(100);
	});

	it('marks dynamic items with correct source', () => {
		const inputs: CompositeInputs = {
			grocery: makeGroceryData(185),
			cappuccino: null,
			wine: makeWineData(78),
			fitness: null,
			school: null,
			housing: null,
			gas: makeGasData(6.02),
			campPrices: null,
			ikonPass: null,
			dogWalker: null,
			rivianLease: null
		};
		const snapshot = buildCompositeSnapshot(inputs);

		const groceryItem = snapshot.marinNumber.items.find((i) => i.label.includes('Groceries'));
		expect(groceryItem?.source).toBe('live');

		const coffeeItem = snapshot.marinNumber.items.find((i) => i.label.includes('Coffee'));
		expect(coffeeItem?.source).toBe('static'); // null input = fallback = static

		const gasItem = snapshot.marinNumber.items.find((i) => i.label.includes('Gas'));
		expect(gasItem?.source).toBe('live');
	});

	it('includes all static items', () => {
		const snapshot = buildCompositeSnapshot(ALL_NULL_INPUTS);
		const staticItems = snapshot.marinNumber.items.filter((i) => i.source === 'static');
		// 7 dynamic items at defaults (marked static) + 9 hardcoded static items
		expect(staticItems.length).toBeGreaterThanOrEqual(9);

		const labels = staticItems.map((i) => i.label);
		expect(labels).toContain('The Dog');
		expect(labels).toContain('Therapist (weekly)');
		expect(labels).toContain('Ski season (amortized)');
	});

	it('The Marin Number is roughly $23.5k/mo with baseline values', () => {
		const snapshot = buildCompositeSnapshot(ALL_NULL_INPUTS);
		// Dynamic defaults: $13,967 + static items: $9,600 = $23,567
		expect(snapshot.marinNumber.total).toBeGreaterThan(22000);
		expect(snapshot.marinNumber.total).toBeLessThan(25000);
	});

	it('upgrades static items to live when blob data exists', () => {
		const inputs: CompositeInputs = {
			...ALL_NULL_INPUTS,
			rivianLease: {
				current: { leaseMonthly: 950, msrp: 82000, scraped: true }
			},
			ikonPass: {
				current: {
					adultPrice: 1399,
					childPrice: 399,
					familyOf4: 3596,
					monthlyAmortized: 300,
					scraped: true
				}
			}
		};
		const snapshot = buildCompositeSnapshot(inputs);

		const rivianItem = snapshot.marinNumber.items.find((i) =>
			i.label.includes('Rivian')
		);
		expect(rivianItem?.source).toBe('live');
		expect(rivianItem?.monthly).toBe(950);

		const skiItem = snapshot.marinNumber.items.find((i) =>
			i.label.includes('Ski season')
		);
		expect(skiItem?.source).toBe('live');
		expect(skiItem?.monthly).toBe(300);
	});
});

// --- New extraction function tests ---

describe('getCampMonthly', () => {
	it('returns monthlyAmortized2Kids from blob data', () => {
		const data: CampPriceData = {
			current: {
				medianWeekly: 695,
				monthlyAmortized2Kids: 927,
				sessionCount: 100,
				providerCount: 30
			}
		};
		expect(getCampMonthly(data)).toBe(927);
	});

	it('returns null for null data', () => {
		expect(getCampMonthly(null)).toBeNull();
	});

	it('returns null for missing current', () => {
		expect(getCampMonthly({ current: null })).toBeNull();
	});
});

describe('getSkiMonthly', () => {
	it('returns monthlyAmortized from Ikon Pass data', () => {
		const data: IkonPassData = {
			current: {
				adultPrice: 1399,
				childPrice: 399,
				familyOf4: 3596,
				monthlyAmortized: 300,
				scraped: true
			}
		};
		expect(getSkiMonthly(data)).toBe(300);
	});

	it('returns null for null data', () => {
		expect(getSkiMonthly(null)).toBeNull();
	});
});

describe('getDogMonthly', () => {
	it('adds walker cost plus fixed expenses', () => {
		const data: DogWalkerData = {
			current: {
				medianWalkPrice: 30,
				monthlyAt3xWeek: 387,
				walkerCount: 15,
				scraped: true
			}
		};
		// 387 (walker) + 600 (food/grooming/vet/misc)
		expect(getDogMonthly(data)).toBe(987);
	});

	it('returns null for null data', () => {
		expect(getDogMonthly(null)).toBeNull();
	});
});

describe('getRivianMonthly', () => {
	it('returns leaseMonthly from blob data', () => {
		const data: RivianLeaseData = {
			current: { leaseMonthly: 899, msrp: 79900, scraped: true }
		};
		expect(getRivianMonthly(data)).toBe(899);
	});

	it('returns null for null data', () => {
		expect(getRivianMonthly(null)).toBeNull();
	});
});

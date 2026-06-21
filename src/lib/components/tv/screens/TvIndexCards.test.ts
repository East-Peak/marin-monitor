import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import TvDailyLifeCard from './TvDailyLifeCard.svelte';
import TvDrivewayCard from './TvDrivewayCard.svelte';
import TvStructuralCard from './TvStructuralCard.svelte';
import type { CoffeeData } from '$lib/types/coffee';
import type { GroceryBasketData } from '$lib/types/grocery';
import type { GasPriceData } from '$lib/types/gas';
import type { DrivewayData } from '$lib/types/driveway';
import type { SchoolIndexData } from '$lib/types/school';
import type { HousingMetric } from '$lib/api/marin/housing';

const cappuccinoData: CoffeeData = {
	current: {
		timestamp: '2026-04-03T00:00:00Z',
		shopCount: 2,
		pricedShopCount: 2,
		medianPrice: 5,
		avgPrice: 5,
		minPrice: 4.85,
		maxPrice: 5.15,
		shops: [
			{
				id: 'shop-1',
				name: 'Marin Coffee Roasters',
				address: '1 Main St',
				town: 'San Anselmo',
				lat: 37.97,
				lon: -122.56,
				price: 4.85,
				source: 'toast',
				updateTime: '2026-04-03T00:00:00Z'
			},
			{
				id: 'shop-2',
				name: 'Equator',
				address: '2 Main St',
				town: 'Mill Valley',
				lat: 37.9,
				lon: -122.55,
				price: 5.15,
				source: 'toast',
				updateTime: '2026-04-03T00:00:00Z'
			}
		]
	},
	history: [
		{
			timestamp: '2026-04-03T00:00:00Z',
			shopCount: 2,
			pricedShopCount: 2,
			medianPrice: 5,
			avgPrice: 5,
			minPrice: 4.85,
			maxPrice: 5.15,
			shops: []
		},
		{
			timestamp: '2026-03-27T00:00:00Z',
			shopCount: 2,
			pricedShopCount: 2,
			medianPrice: 4.9,
			avgPrice: 4.9,
			minPrice: 4.75,
			maxPrice: 5.05,
			shops: []
		}
	]
};

const groceryData: GroceryBasketData = {
	current: {
		timestamp: '2026-04-03T00:00:00Z',
		totalCheapest: 212.15,
		totalExpensive: 242.97,
		itemsFound: 1,
		items: [
			{
				itemId: 'eggs',
				itemName: 'Eggs',
				cheapest: 7.99,
				cheapestStore: 'Safeway',
				mostExpensive: 10.99,
				mostExpensiveStore: 'Whole Foods',
				storePrices: []
			}
		]
	},
	history: [
		{
			timestamp: '2026-04-03T00:00:00Z',
			totalCheapest: 212.15,
			totalExpensive: 242.97,
			itemsFound: 1,
			items: [
				{
					itemId: 'eggs',
					itemName: 'Eggs',
					cheapest: 7.99,
					cheapestStore: 'Safeway',
					mostExpensive: 10.99,
					mostExpensiveStore: 'Whole Foods',
					storePrices: []
				}
			]
		},
		{
			timestamp: '2026-03-27T00:00:00Z',
			totalCheapest: 205.15,
			totalExpensive: 235.97,
			itemsFound: 1,
			items: [
				{
					itemId: 'eggs',
					itemName: 'Eggs',
					cheapest: 6.99,
					cheapestStore: 'Safeway',
					mostExpensive: 9.99,
					mostExpensiveStore: 'Whole Foods',
					storePrices: []
				}
			]
		}
	]
};

const gasData: GasPriceData = {
	current: {
		timestamp: '2026-04-03T00:00:00Z',
		stationCount: 2,
		avgRegular: 6.15,
		avgMidgrade: 6.45,
		avgPremium: 6.75,
		avgDiesel: 6.35,
		minRegular: 5.4,
		maxRegular: 6.8,
		stations: [
			{
				placeId: 'arco',
				name: 'ARCO',
				address: '1 Fuel Rd',
				lat: 37.9,
				lon: -122.5,
				fuelPrices: [{ type: 'REGULAR_UNLEADED', price: 5.4 }]
			},
			{
				placeId: 'shell',
				name: 'Shell',
				address: '2 Fuel Rd',
				lat: 37.91,
				lon: -122.51,
				fuelPrices: [{ type: 'REGULAR_UNLEADED', price: 6.8 }]
			}
		]
	},
	history: [
		{
			timestamp: '2026-04-03T00:00:00Z',
			stationCount: 2,
			avgRegular: 6.15,
			avgMidgrade: 6.45,
			avgPremium: 6.75,
			avgDiesel: 6.35,
			minRegular: 5.4,
			maxRegular: 6.8,
			stations: []
		},
		{
			timestamp: '2026-04-02T00:00:00Z',
			stationCount: 2,
			avgRegular: 6.05,
			avgMidgrade: 6.35,
			avgPremium: 6.65,
			avgDiesel: 6.25,
			minRegular: 5.3,
			maxRegular: 6.7,
			stations: []
		}
	]
};

const tuitionData: SchoolIndexData = {
	current: {
		timestamp: '2026-04-03T00:00:00Z',
		medianHouseholdIncome: 150000,
		incomeSource: 'ACS',
		incomeYear: '2024',
		tiers: [
			{
				level: 'elementary',
				label: 'Elementary (K-5)',
				avgTuition: 49535,
				pctOfMedianIncome: 33.0
			},
			{ level: 'high', label: 'High School (9-12)', avgTuition: 64750, pctOfMedianIncome: 43.2 }
		],
		schools: [
			{
				id: 'school-1',
				name: 'Marin Academy',
				town: 'San Rafael',
				level: 'high',
				tuition: 64750,
				url: 'https://example.com/ma',
				lat: 37.97,
				lon: -122.53
			}
		],
		cumulativeK12: 698998
	},
	history: [
		{
			timestamp: '2026-04-03T00:00:00Z',
			medianHouseholdIncome: 150000,
			tiers: [],
			cumulativeK12: 698998
		},
		{
			timestamp: '2026-03-03T00:00:00Z',
			medianHouseholdIncome: 149000,
			tiers: [],
			cumulativeK12: 689000
		}
	]
};

const housingData: HousingMetric[] = [
	{
		month: '2026-01-01',
		medianPrice: 1291000,
		medianPpsf: 700,
		inventory: 300,
		daysOnMarket: 35,
		homesSold: 106
	},
	{
		month: '2026-02-01',
		medianPrice: 1360000,
		medianPpsf: 725,
		inventory: 323,
		daysOnMarket: 31,
		homesSold: 164
	}
];

const drivewayData: DrivewayData = {
	current: {
		timestamp: '2026-04-03T00:00:00Z',
		dataYear: 2024,
		totalVehicles: 210586,
		topMakes: [
			{ make: 'Toyota', count: 26943 },
			{ make: 'Honda', count: 11787 }
		],
		fuelBreakdown: [
			{ fuelType: 'gasoline', count: 159273, pct: 75.6 },
			{ fuelType: 'battery-electric', count: 17429, pct: 8.3 },
			{ fuelType: 'plug-in-hybrid', count: 5709, pct: 2.7 }
		],
		funStats: {
			rivian: 393,
			lucid: 12,
			porsche: 836,
			tesla: 8104,
			hydrogen: 68
		}
	},
	history: [
		{
			timestamp: '2026-04-03T00:00:00Z',
			dataYear: 2024,
			totalVehicles: 210586,
			topMakes: [],
			fuelBreakdown: [
				{ fuelType: 'gasoline', count: 159273, pct: 75.6 },
				{ fuelType: 'battery-electric', count: 17429, pct: 8.3 }
			],
			funStats: {
				rivian: 393,
				lucid: 12,
				porsche: 836,
				tesla: 8104,
				hydrogen: 68
			}
		}
	]
};

describe('tv index cards', () => {
	it('renders all three daily-life sparklines when history is present', () => {
		const { container } = render(TvDailyLifeCard, {
			props: {
				cappuccino: cappuccinoData,
				grocery: groceryData,
				gas: gasData
			}
		});

		expect(container.querySelectorAll('svg')).toHaveLength(3);
	});

	it('renders both structural sparklines', () => {
		const { container } = render(TvStructuralCard, {
			props: {
				tuition: tuitionData,
				housing: housingData
			}
		});

		expect(container.querySelectorAll('svg')).toHaveLength(2);
	});

	it('renders the driveway EV sparkline even with a single history point', () => {
		const { container } = render(TvDrivewayCard, {
			props: {
				data: drivewayData
			}
		});

		const svgs = container.querySelectorAll('svg');
		expect(svgs).toHaveLength(1);
		expect(svgs[0].querySelector('path[d]')).not.toBeNull();
	});
});

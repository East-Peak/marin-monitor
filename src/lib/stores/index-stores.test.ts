/**
 * Tests for index stores — they all follow the same writable + derived pattern:
 * writable<{ current: T | null, history: T[] }> with derived accessors.
 *
 * Tests: cappuccino, gas-prices, ev-charging, composite, wine-index, fitness,
 *        grocery-basket, school-tuition, driveway, coffee
 */

import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';

import { cappuccinoStore, currentCoffeeShops as cappuccinoCoffeeShops } from './cappuccino';
import { gasPriceStore, currentGasStations } from './gas-prices';
import { evChargingStore, currentChargingStations } from './ev-charging';
import { compositeStore, currentCompositeScore, currentMarinNumber } from './composite';
import {
	wineIndexStore,
	currentWineCategories,
	currentStaffPicks,
	currentAllocatedWines
} from './wine-index';
import { fitnessStore, currentFitnessStudios } from './fitness';
import { groceryBasketStore, currentBasketTotal, currentBasketItems } from './grocery-basket';
import { schoolTuitionStore, currentSchoolTiers, currentSchools } from './school-tuition';
import { drivewayStore, currentDrivewaySnapshot, drivewayTopMakes } from './driveway';
import { coffeeIndexStore, currentCoffeeShops as coffeeIndexShops } from './coffee';

describe('cappuccinoStore', () => {
	it('starts with null current and empty history', () => {
		const data = get(cappuccinoStore);
		expect(data.current).toBeNull();
		expect(data.history).toEqual([]);
	});

	it('derived returns empty array when current is null', () => {
		expect(get(cappuccinoCoffeeShops)).toEqual([]);
	});

	it('derived returns shops when data is set', () => {
		const mockShops = [
			{ name: 'Equator', price: 5.5 },
			{ name: 'Peets', price: 5.0 }
		];
		cappuccinoStore.set({ current: { shops: mockShops } as any, history: [] });
		expect(get(cappuccinoCoffeeShops)).toEqual(mockShops);
		// Reset
		cappuccinoStore.set({ current: null, history: [] });
	});
});

describe('gasPriceStore', () => {
	it('starts with null current and empty history', () => {
		const data = get(gasPriceStore);
		expect(data.current).toBeNull();
		expect(data.history).toEqual([]);
	});

	it('derived returns empty array when current is null', () => {
		expect(get(currentGasStations)).toEqual([]);
	});

	it('derived returns stations when data is set', () => {
		const mockStations = [{ name: 'Shell', price: 5.99 }];
		gasPriceStore.set({ current: { stations: mockStations } as any, history: [] });
		expect(get(currentGasStations)).toEqual(mockStations);
		gasPriceStore.set({ current: null, history: [] });
	});
});

describe('evChargingStore', () => {
	it('starts with null current and empty history', () => {
		const data = get(evChargingStore);
		expect(data.current).toBeNull();
		expect(data.history).toEqual([]);
	});

	it('derived returns empty array when current is null', () => {
		expect(get(currentChargingStations)).toEqual([]);
	});

	it('derived returns stations when data is set', () => {
		const mockStations = [{ name: 'ChargePoint', available: 3 }];
		evChargingStore.set({ current: { stations: mockStations } as any, history: [] });
		expect(get(currentChargingStations)).toEqual(mockStations);
		evChargingStore.set({ current: null, history: [] });
	});
});

describe('compositeStore', () => {
	it('starts with null current and empty history', () => {
		const data = get(compositeStore);
		expect(data.current).toBeNull();
		expect(data.history).toEqual([]);
	});

	it('compositeScore derived returns null when current is null', () => {
		expect(get(currentCompositeScore)).toBeNull();
	});

	it('marinNumber derived returns null when current is null', () => {
		expect(get(currentMarinNumber)).toBeNull();
	});

	it('derived values update when data is set', () => {
		compositeStore.set({
			current: { compositeScore: 72.5, marinNumber: 1247 } as any,
			history: []
		});
		expect(get(currentCompositeScore)).toBe(72.5);
		expect(get(currentMarinNumber)).toBe(1247);
		compositeStore.set({ current: null, history: [] });
	});
});

describe('wineIndexStore', () => {
	it('starts with null current and empty history', () => {
		const data = get(wineIndexStore);
		expect(data.current).toBeNull();
		expect(data.history).toEqual([]);
	});

	it('all derived stores return empty arrays when current is null', () => {
		expect(get(currentWineCategories)).toEqual([]);
		expect(get(currentStaffPicks)).toEqual([]);
		expect(get(currentAllocatedWines)).toEqual([]);
	});

	it('derived values update when data is set', () => {
		const mockCategories = [{ name: 'Pinot Noir', avgPrice: 45 }];
		const mockPicks = [{ name: 'Sea Smoke' }];
		const mockAllocated = [{ name: 'Screaming Eagle' }];
		wineIndexStore.set({
			current: {
				categories: mockCategories,
				staffPicks: mockPicks,
				allocatedWines: mockAllocated
			} as any,
			history: []
		});
		expect(get(currentWineCategories)).toEqual(mockCategories);
		expect(get(currentStaffPicks)).toEqual(mockPicks);
		expect(get(currentAllocatedWines)).toEqual(mockAllocated);
		wineIndexStore.set({ current: null, history: [] });
	});
});

describe('fitnessStore', () => {
	it('starts with null current and empty history', () => {
		const data = get(fitnessStore);
		expect(data.current).toBeNull();
		expect(data.history).toEqual([]);
	});

	it('derived returns empty array when current is null', () => {
		expect(get(currentFitnessStudios)).toEqual([]);
	});

	it('derived returns studios when data is set', () => {
		const mockStudios = [{ name: 'YogaWorks', dropIn: 25 }];
		fitnessStore.set({ current: { studios: mockStudios } as any, history: [] });
		expect(get(currentFitnessStudios)).toEqual(mockStudios);
		fitnessStore.set({ current: null, history: [] });
	});
});

describe('groceryBasketStore', () => {
	it('starts with null current and empty history', () => {
		const data = get(groceryBasketStore);
		expect(data.current).toBeNull();
		expect(data.history).toEqual([]);
	});

	it('basketTotal derived returns null when current is null', () => {
		expect(get(currentBasketTotal)).toBeNull();
	});

	it('basketItems derived returns empty array when current is null', () => {
		expect(get(currentBasketItems)).toEqual([]);
	});

	it('derived values update when data is set', () => {
		const mockItems = [{ name: 'Eggs', cheapestPrice: 6.99 }];
		groceryBasketStore.set({
			current: { totalCheapest: 142.5, items: mockItems } as any,
			history: []
		});
		expect(get(currentBasketTotal)).toBe(142.5);
		expect(get(currentBasketItems)).toEqual(mockItems);
		groceryBasketStore.set({ current: null, history: [] });
	});
});

describe('schoolTuitionStore', () => {
	it('starts with null current and empty history', () => {
		const data = get(schoolTuitionStore);
		expect(data.current).toBeNull();
		expect(data.history).toEqual([]);
	});

	it('all derived stores return empty arrays when current is null', () => {
		expect(get(currentSchoolTiers)).toEqual([]);
		expect(get(currentSchools)).toEqual([]);
	});

	it('derived values update when data is set', () => {
		const mockTiers = [{ name: 'Elite', avgTuition: 45000 }];
		const mockSchools = [{ name: 'Marin Academy', tuition: 52000 }];
		schoolTuitionStore.set({
			current: { tiers: mockTiers, schools: mockSchools } as any,
			history: []
		});
		expect(get(currentSchoolTiers)).toEqual(mockTiers);
		expect(get(currentSchools)).toEqual(mockSchools);
		schoolTuitionStore.set({ current: null, history: [] });
	});
});

describe('drivewayStore', () => {
	it('starts with null current and empty history', () => {
		const data = get(drivewayStore);
		expect(data.current).toBeNull();
		expect(data.history).toEqual([]);
	});

	it('snapshot derived returns null when current is null', () => {
		expect(get(currentDrivewaySnapshot)).toBeNull();
	});

	it('topMakes derived returns empty array when current is null', () => {
		expect(get(drivewayTopMakes)).toEqual([]);
	});

	it('derived values update when data is set', () => {
		const mockData = { topMakes: [{ make: 'Tesla', pct: 22 }], avgPrice: 85000 };
		drivewayStore.set({ current: mockData as any, history: [] });
		expect(get(currentDrivewaySnapshot)).toEqual(mockData);
		expect(get(drivewayTopMakes)).toEqual([{ make: 'Tesla', pct: 22 }]);
		drivewayStore.set({ current: null, history: [] });
	});
});

describe('coffeeIndexStore', () => {
	it('starts with null current and empty history', () => {
		const data = get(coffeeIndexStore);
		expect(data.current).toBeNull();
		expect(data.history).toEqual([]);
	});

	it('derived returns empty array when current is null', () => {
		expect(get(coffeeIndexShops)).toEqual([]);
	});

	it('derived returns shops when data is set', () => {
		const mockShops = [{ name: 'Blue Bottle', avgPrice: 6.25 }];
		coffeeIndexStore.set({ current: { shops: mockShops } as any, history: [] });
		expect(get(coffeeIndexShops)).toEqual(mockShops);
		coffeeIndexStore.set({ current: null, history: [] });
	});
});

describe('index store pattern (general)', () => {
	it('all stores support update() for partial mutations', () => {
		const mockHistory = [{ date: '2026-03-01' }];
		gasPriceStore.update((d) => ({ ...d, history: mockHistory as any }));
		const data = get(gasPriceStore);
		expect(data.history).toEqual(mockHistory);
		expect(data.current).toBeNull();
		gasPriceStore.set({ current: null, history: [] });
	});

	it('setting current to null resets derived values', () => {
		compositeStore.set({
			current: { compositeScore: 50, marinNumber: 999 } as any,
			history: []
		});
		expect(get(currentCompositeScore)).toBe(50);
		compositeStore.set({ current: null, history: [] });
		expect(get(currentCompositeScore)).toBeNull();
	});
});

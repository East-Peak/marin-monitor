/**
 * Tests for index stores — they all follow the same writable + derived pattern:
 * writable<{ current: T | null, history: T[] }> with derived accessors.
 *
 * Tests: cappuccino, gas-prices, ev-charging, fitness, coffee
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- partial mock objects for typed stores; full shapes would bloat tests without adding coverage */

import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';

import { cappuccinoStore, currentCoffeeShops as cappuccinoCoffeeShops } from './cappuccino';
import { gasPriceStore, currentGasStations } from './gas-prices';
import { evChargingStore, currentChargingStations } from './ev-charging';
import { fitnessStore, currentFitnessStudios } from './fitness';
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
});

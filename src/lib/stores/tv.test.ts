/* eslint-disable @typescript-eslint/no-explicit-any -- mock store references and partial fixture objects in tests */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildIdxTickerItems } from './tv';
import { get } from 'svelte/store';

// Mock the news stores before importing tv.ts
vi.mock('$lib/stores/news', () => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- require() is necessary inside vi.mock() factories (hoisted before ESM imports)
	const { writable } = require('svelte/store');

	const mockSafetyState = writable({ items: [], loading: false, error: null, lastUpdated: null });
	const mockLocalState = writable({ items: [], loading: false, error: null, lastUpdated: null });
	const mockCivicState = writable({ items: [], loading: false, error: null, lastUpdated: null });
	const mockAlerts = writable([]);
	const mockThreeOneOneState = writable({
		items: [],
		loading: false,
		error: null,
		lastUpdated: null
	});

	return {
		safetyNews: mockSafetyState,
		localNews: mockLocalState,
		civicNews: mockCivicState,
		alerts: mockAlerts,
		threeOneOneNews: mockThreeOneOneState,
		__mockSafetyState: mockSafetyState,
		__mockLocalState: mockLocalState,
		__mockCivicState: mockCivicState,
		__mockAlerts: mockAlerts,
		__mockThreeOneOneState: mockThreeOneOneState
	};
});

// Mock the strava store (5th derived input) with empty default
vi.mock('$lib/stores/strava', () => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports -- require() is necessary inside vi.mock() factories (hoisted before ESM imports)
	const { writable } = require('svelte/store');
	const mockStravaEvents = writable({ events: [], lastUpdated: '' });
	return {
		stravaEvents: mockStravaEvents,
		__mockStravaEvents: mockStravaEvents
	};
});

describe('tvTickerItems', () => {
	let tvTickerItems: typeof import('./tv').tvTickerItems;
	let mocks: {
		__mockSafetyState: any;
		__mockLocalState: any;
		__mockCivicState: any;
		__mockAlerts: any;
	};

	beforeEach(async () => {
		vi.resetModules();
		const tvModule = await import('./tv');
		tvTickerItems = tvModule.tvTickerItems;
		mocks = (await import('$lib/stores/news')) as any;
	});

	it('returns "All clear" fallback when all stores are empty', () => {
		const items = get(tvTickerItems);
		expect(items).toHaveLength(1);
		expect(items[0].badge).toBe('CV');
		expect(items[0].text).toBe('All clear in Marin County');
	});

	it('maps safety items to PD badge', () => {
		mocks.__mockSafetyState.set({
			items: [
				{
					id: 'safety-1',
					title: 'Vehicle theft reported',
					timestamp: Date.now(),
					isAlert: false,
					source: 'Sheriff'
				}
			],
			loading: false,
			error: null,
			lastUpdated: Date.now()
		});

		const items = get(tvTickerItems);
		const pdItems = items.filter((i: any) => i.badge === 'PD');
		expect(pdItems.length).toBeGreaterThan(0);
		expect(pdItems[0].text).toBe('Vehicle theft reported');
	});

	it('maps fire items to FI badge and FI wins dedup over PD', () => {
		const fireItem = {
			id: 'fire-1',
			title: 'Wildfire near Tam',
			timestamp: Date.now(),
			isAlert: false,
			source: 'CalFire',
			alertKeyword: 'wildfire',
			category: 'safety'
		};

		mocks.__mockSafetyState.set({
			items: [fireItem],
			loading: false,
			error: null,
			lastUpdated: Date.now()
		});

		const items = get(tvTickerItems);
		// FI should appear (pushed first), PD duplicate should be deduped
		const fiItems = items.filter((i: any) => i.badge === 'FI');
		const pdWithSameBase = items.filter(
			(i: any) => i.badge === 'PD' && i.id.replace(/^[A-Z]{2}-/, '') === 'fire-1'
		);

		expect(fiItems.length).toBe(1);
		expect(fiItems[0].text).toBe('Wildfire near Tam');
		expect(pdWithSameBase.length).toBe(0); // deduped — FI won
	});

	it('maps local news to LW badge', () => {
		mocks.__mockLocalState.set({
			items: [
				{
					id: 'local-1',
					title: 'New park opens',
					timestamp: Date.now(),
					isAlert: false,
					source: 'Marin IJ'
				}
			],
			loading: false,
			error: null,
			lastUpdated: Date.now()
		});

		const items = get(tvTickerItems);
		const lwItems = items.filter((i: any) => i.badge === 'LW');
		expect(lwItems.length).toBe(1);
		expect(lwItems[0].text).toBe('New park opens');
	});

	it('deduplicates by base item ID across categories', () => {
		const sharedItem = {
			id: 'shared-1',
			title: 'Bridge closure',
			timestamp: Date.now(),
			isAlert: false,
			source: '511',
			category: 'safety'
		};

		mocks.__mockSafetyState.set({
			items: [sharedItem],
			loading: false,
			error: null,
			lastUpdated: Date.now()
		});

		const items = get(tvTickerItems);
		const matchingItems = items.filter((i: any) => i.id.replace(/^[A-Z]{2}-/, '') === 'shared-1');

		// Should appear only once (either GG or PD, not both)
		expect(matchingItems.length).toBe(1);
	});
});

describe('buildIdxTickerItems', () => {
	it('returns empty array when all data is null', () => {
		const items = buildIdxTickerItems({});
		expect(items).toEqual([]);
	});

	it('builds composite ticker item with Marin Number', () => {
		const items = buildIdxTickerItems({
			composite: {
				current: {
					timestamp: '2026-04-01',
					tiers: [],
					compositeScore: 100,
					marinNumber: { total: 21110, items: [], annualized: 253320 }
				},
				history: []
			}
		});
		const marinItem = items.find((i) => i.text.includes('Marin Number'));
		expect(marinItem).toBeDefined();
		expect(marinItem!.badge).toBe('IDX');
		expect(marinItem!.text).toContain('21,110');
	});

	it('builds cappuccino ticker item with median price', () => {
		const items = buildIdxTickerItems({
			cappuccino: {
				current: {
					timestamp: '2026-04-01',
					shopCount: 12,
					medianPrice: 5.75,
					avgPrice: 5.8,
					minPrice: 4.5,
					maxPrice: 7.0,
					shops: []
				},
				history: []
			}
		});
		const coffeeItem = items.find((i) => i.text.includes('Cappuccino'));
		expect(coffeeItem).toBeDefined();
		expect(coffeeItem!.text).toContain('$5.75');
	});

	it('caps at 5 IDX items', () => {
		const items = buildIdxTickerItems({
			cappuccino: {
				current: {
					timestamp: '2026-04-01',
					shopCount: 12,
					medianPrice: 5.75,
					avgPrice: 5.8,
					minPrice: 4.5,
					maxPrice: 7.0,
					shops: []
				},
				history: []
			},
			grocery: {
				current: {
					timestamp: '2026-04-01',
					totalCheapest: 187,
					totalExpensive: 245,
					itemsFound: 12,
					items: []
				},
				history: []
			},
			composite: {
				current: {
					timestamp: '2026-04-01',
					tiers: [],
					compositeScore: 100,
					marinNumber: { total: 21110, items: [], annualized: 253320 }
				},
				history: []
			},
			gas: {
				current: {
					timestamp: '2026-04-01',
					stationCount: 30,
					avgRegular: 5.89,
					avgMidgrade: 6.19,
					avgPremium: 6.49,
					avgDiesel: 5.99,
					minRegular: 5.39,
					maxRegular: 6.29,
					stations: []
				},
				history: []
			},
			tuition: {
				current: {
					timestamp: '2026-04-01',
					medianHouseholdIncome: 150000,
					incomeSource: 'ACS',
					incomeYear: '2024',
					tiers: [],
					schools: [],
					cumulativeK12: 698998
				},
				history: []
			},
			driveway: {
				current: {
					timestamp: '2026-04-01',
					dataYear: 2025,
					totalVehicles: 200000,
					topMakes: [],
					fuelBreakdown: [{ fuelType: 'battery-electric', count: 16600, pct: 8.3 }],
					funStats: { rivian: 200, lucid: 12, porsche: 5000, tesla: 15000, hydrogen: 68 }
				},
				history: []
			}
		});
		expect(items.length).toBeLessThanOrEqual(5);
	});
});

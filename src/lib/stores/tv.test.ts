import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Mock the news stores before importing tv.ts
vi.mock('$lib/stores/news', () => {
	const { writable, derived } = require('svelte/store');

	const mockSafetyState = writable({ items: [], loading: false, error: null, lastUpdated: null });
	const mockLocalState = writable({ items: [], loading: false, error: null, lastUpdated: null });
	const mockCivicState = writable({ items: [], loading: false, error: null, lastUpdated: null });
	const mockAlerts = writable([]);

	return {
		safetyNews: mockSafetyState,
		localNews: mockLocalState,
		civicNews: mockCivicState,
		alerts: mockAlerts,
		__mockSafetyState: mockSafetyState,
		__mockLocalState: mockLocalState,
		__mockCivicState: mockCivicState,
		__mockAlerts: mockAlerts
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
				{ id: 'safety-1', title: 'Vehicle theft reported', timestamp: Date.now(), isAlert: false, source: 'Sheriff' }
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
				{ id: 'local-1', title: 'New park opens', timestamp: Date.now(), isAlert: false, source: 'Marin IJ' }
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
		const matchingItems = items.filter(
			(i: any) => i.id.replace(/^[A-Z]{2}-/, '') === 'shared-1'
		);

		// Should appear only once (either GG or PD, not both)
		expect(matchingItems.length).toBe(1);
	});
});

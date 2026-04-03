/**
 * Tests for town-filter store
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Mock localStorage
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: vi.fn((key: string) => store[key] || null),
		setItem: vi.fn((key: string, value: string) => {
			store[key] = value;
		}),
		removeItem: vi.fn((key: string) => {
			delete store[key];
		}),
		clear: vi.fn(() => {
			store = {};
		})
	};
})();

Object.defineProperty(globalThis, 'localStorage', {
	value: localStorageMock,
	writable: true
});

describe('Town Filter Store', () => {
	beforeEach(async () => {
		localStorageMock.clear();
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('starts with null (no town selected)', async () => {
		const { townFilter } = await import('./town-filter');
		expect(get(townFilter)).toBeNull();
	});

	it('selects a town', async () => {
		const { townFilter } = await import('./town-filter');
		townFilter.select('mill-valley');
		expect(get(townFilter)).toBe('mill-valley');
	});

	it('persists town to localStorage', async () => {
		const { townFilter } = await import('./town-filter');
		townFilter.select('sausalito');
		expect(localStorageMock.setItem).toHaveBeenCalledWith('mm_town', 'sausalito');
	});

	it('clears town and removes from localStorage', async () => {
		const { townFilter } = await import('./town-filter');
		townFilter.select('novato');
		townFilter.clear();
		expect(get(townFilter)).toBeNull();
		expect(localStorageMock.removeItem).toHaveBeenCalledWith('mm_town');
	});

	it('select(null) clears the filter', async () => {
		const { townFilter } = await import('./town-filter');
		townFilter.select('tiburon');
		townFilter.select(null);
		expect(get(townFilter)).toBeNull();
		expect(localStorageMock.removeItem).toHaveBeenCalledWith('mm_town');
	});

	it('selectedTownObj returns Town object for valid slug', async () => {
		const { townFilter, selectedTownObj } = await import('./town-filter');
		townFilter.select('sausalito');
		const town = get(selectedTownObj);
		expect(town).not.toBeNull();
		expect(town!.name).toBe('Sausalito');
		expect(town!.slug).toBe('sausalito');
		expect(town!.lat).toBeDefined();
		expect(town!.lon).toBeDefined();
	});

	it('selectedTownObj returns null when no town selected', async () => {
		const { selectedTownObj } = await import('./town-filter');
		expect(get(selectedTownObj)).toBeNull();
	});

	it('townLocation returns town-specific location for selected town', async () => {
		const { townFilter, townLocation } = await import('./town-filter');
		townFilter.select('sausalito');
		const loc = get(townLocation);
		expect(loc.name).toBe('Sausalito');
		expect(loc.lat).toBe(37.8591);
	});

	it('townLocation returns default location when no town selected', async () => {
		const { townLocation } = await import('./town-filter');
		const loc = get(townLocation);
		// Should be the user's settings default (central-marin)
		expect(loc).toBeDefined();
		expect(loc.tideStation).toBeTruthy();
	});

	it('loads saved town from localStorage on init', async () => {
		localStorageMock.getItem.mockReturnValue('novato');
		const { townFilter } = await import('./town-filter');
		expect(get(townFilter)).toBe('novato');
	});

	it('ignores invalid saved town from localStorage', async () => {
		localStorageMock.getItem.mockReturnValue('fake-town-not-real');
		const { townFilter } = await import('./town-filter');
		expect(get(townFilter)).toBeNull();
	});
});

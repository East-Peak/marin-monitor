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

describe('transient scope (TV)', () => {
	beforeEach(() => {
		// Earlier tests leave getItem.mockReturnValue(...) behind; clearAllMocks does not reset it.
		localStorageMock.getItem.mockReset();
		localStorageMock.setItem.mockReset();
		localStorageMock.removeItem.mockReset();
		localStorageMock.clear();
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('shows the transient scope without touching mm_town, then restores the saved town', async () => {
		localStorageMock.setItem('mm_town', 'mill-valley');
		vi.clearAllMocks();
		const { townFilter } = await import('./town-filter');
		expect(get(townFilter)).toBe('mill-valley');

		const end = townFilter.beginTransientScope(null);
		expect(get(townFilter)).toBeNull();
		expect(localStorageMock.setItem).not.toHaveBeenCalled();
		expect(localStorageMock.removeItem).not.toHaveBeenCalled();

		end();
		expect(get(townFilter)).toBe('mill-valley');
		expect(localStorageMock.getItem('mm_town')).toBe('mill-valley');
	});

	it('does not persist selections made while the scope is active', async () => {
		localStorageMock.setItem('mm_town', 'mill-valley');
		vi.clearAllMocks();
		const { townFilter } = await import('./town-filter');
		const end = townFilter.beginTransientScope(null);
		townFilter.select('novato');
		townFilter.clear();
		expect(localStorageMock.setItem).not.toHaveBeenCalled();
		expect(localStorageMock.removeItem).not.toHaveBeenCalled();
		end();
		expect(get(townFilter)).toBe('mill-valley');
	});

	it('end() is idempotent and persistence resumes after it', async () => {
		const { townFilter } = await import('./town-filter');
		const end = townFilter.beginTransientScope(null);
		end();
		townFilter.select('novato');
		end();
		expect(get(townFilter)).toBe('novato');
		expect(localStorageMock.getItem('mm_town')).toBe('novato');
	});

	it('townLocation follows the transient scope', async () => {
		localStorageMock.setItem('mm_town', 'novato');
		const [{ townFilter, townLocation }, { DEFAULT_LOCATION_ID }] = await Promise.all([
			import('./town-filter'),
			import('$lib/config/locations')
		]);
		const end = townFilter.beginTransientScope(null);
		expect(get(townLocation).id).toBe(DEFAULT_LOCATION_ID);
		end();
	});

	/** Temporarily replace storage methods; restores them afterwards. */
	async function withStorage(
		overrides: Partial<Record<'getItem' | 'setItem' | 'removeItem', (...a: string[]) => unknown>>,
		run: () => Promise<void>
	) {
		const real = { ...localStorageMock };
		Object.assign(
			localStorageMock,
			Object.fromEntries(Object.entries(overrides).map(([k, f]) => [k, vi.fn(f)]))
		);
		try {
			await run();
		} finally {
			Object.assign(localStorageMock, real);
		}
	}
	const deny = (name: string) => () => {
		throw new DOMException('denied', name);
	};

	it('read denied: the town chosen in this page view survives a TV round-trip', async () => {
		await withStorage(
			{ getItem: deny('SecurityError'), setItem: deny('SecurityError') },
			async () => {
				const { townFilter } = await import('./town-filter');
				expect(get(townFilter)).toBeNull();
				expect(() => townFilter.select('novato')).not.toThrow();
				const end = townFilter.beginTransientScope(null);
				expect(get(townFilter)).toBeNull();
				expect(() => end()).not.toThrow();
				expect(get(townFilter)).toBe('novato');
			}
		);
	});

	it('write denied with an older stored town: the round-trip returns the new choice, not the stale copy', async () => {
		localStorageMock.setItem('mm_town', 'mill-valley');
		await withStorage(
			{ setItem: deny('SecurityError'), removeItem: deny('SecurityError') },
			async () => {
				const { townFilter } = await import('./town-filter');
				expect(get(townFilter)).toBe('mill-valley');
				townFilter.select('novato');
				const end = townFilter.beginTransientScope(null);
				end();
				expect(get(townFilter)).toBe('novato');
			}
		);
	});

	it('quota exceeded: same guarantee', async () => {
		localStorageMock.setItem('mm_town', 'mill-valley');
		await withStorage({ setItem: deny('QuotaExceededError') }, async () => {
			const { townFilter } = await import('./town-filter');
			townFilter.select('novato');
			townFilter.beginTransientScope(null)();
			expect(get(townFilter)).toBe('novato');
		});
	});

	it('clearing to "All of Marin" with storage denied also survives the round-trip', async () => {
		localStorageMock.setItem('mm_town', 'mill-valley');
		await withStorage({ removeItem: deny('SecurityError') }, async () => {
			const { townFilter } = await import('./town-filter');
			townFilter.clear();
			townFilter.beginTransientScope(null)();
			expect(get(townFilter)).toBeNull();
		});
	});
});

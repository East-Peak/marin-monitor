/**
 * Tests for settings store
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

// Mock $app/environment before importing the store
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
	value: localStorageMock
});

describe('Settings Store', () => {
	beforeEach(async () => {
		localStorageMock.clear();
		vi.clearAllMocks();

		// Re-import the store to reset state
		vi.resetModules();
	});

	it('should have default state with all panels enabled', async () => {
		const [{ settings }, { DEFAULT_PANEL_ORDER }] = await Promise.all([
			import('./settings'),
			import('../config')
		]);

		const state = get(settings);
		expect(state.initialized).toBe(false);
		expect(state.order).toEqual(DEFAULT_PANEL_ORDER);

		for (const panelId of DEFAULT_PANEL_ORDER) {
			expect(state.enabled[panelId]).toBe(true);
		}
	});

	it('loads a persisted blob written by the retired panel, preset and onboarding controls', async () => {
		localStorage.setItem(
			'mm_panels',
			JSON.stringify({ outdoors: false, satire: false, gone: true })
		);
		localStorage.setItem('mm_panelOrder', JSON.stringify(['satire', 'map', 'gone']));
		localStorage.setItem('mm_panelSizes', JSON.stringify({ map: { width: 800 } }));
		localStorage.setItem('mm_onboardingComplete', 'true');
		localStorage.setItem('mm_selectedPreset', 'essentials');
		localStorage.setItem(
			'refreshSettings',
			JSON.stringify({ autoRefreshEnabled: false, autoRefreshInterval: 1000 })
		);

		const [{ settings, enabledPanels }, { DEFAULT_PANEL_ORDER }] = await Promise.all([
			import('./settings'),
			import('../config')
		]);

		const state = get(settings);
		expect(state.enabled['outdoors']).toBe(false);
		expect(state.enabled['map']).toBe(true);
		expect(state.sizes['map']).toEqual({ width: 800 });
		expect(state.order.slice(0, 2)).toEqual(['satire', 'map']);
		expect([...state.order].sort()).toEqual([...DEFAULT_PANEL_ORDER].sort());
		expect(get(enabledPanels)).not.toContain('outdoors');
	});

	it('should update panel order', async () => {
		const { settings } = await import('./settings');

		const newOrder = ['outdoors', 'housing', 'civic', 'map'] as const;
		settings.updateOrder([...newOrder]);

		const state = get(settings);
		expect(state.order.slice(0, 4)).toEqual([...newOrder]);
	});

	it('should update panel size', async () => {
		const { settings } = await import('./settings');

		settings.updateSize('map', { width: 800, height: 600 });

		const state = get(settings);
		expect(state.sizes['map']).toEqual({ width: 800, height: 600 });
	});

	it('should initialize store', async () => {
		const { settings } = await import('./settings');

		expect(get(settings).initialized).toBe(false);
		settings.init();
		expect(get(settings).initialized).toBe(true);
	});

	it('should default to dark theme and toggle to light', async () => {
		const { settings } = await import('./settings');

		expect(get(settings).theme).toBe('dark');
		settings.toggleTheme();
		expect(get(settings).theme).toBe('light');
	});

	it('should persist theme changes', async () => {
		const { settings } = await import('./settings');

		settings.setTheme('light');
		expect(get(settings).theme).toBe('light');
		expect(localStorageMock.setItem).toHaveBeenCalledWith('mm_theme', JSON.stringify('light'));
	});

	it('should reset to defaults', async () => {
		const [{ settings }, { DEFAULT_PANEL_ORDER }] = await Promise.all([
			import('./settings'),
			import('../config')
		]);

		// Make some changes
		settings.disablePanel('outdoors');
		settings.updateSize('map', { width: 1000 });

		// Reset
		settings.reset();

		const state = get(settings);
		expect(state.enabled['outdoors']).toBe(true);
		expect(state.sizes['map']).toBeUndefined();
		expect(state.order).toEqual(DEFAULT_PANEL_ORDER);
	});

	it('should restore missing panels into saved order', async () => {
		const { DEFAULT_PANEL_ORDER } = await import('../config');
		localStorage.setItem('mm_panelOrder', JSON.stringify(DEFAULT_PANEL_ORDER.slice(0, 4)));

		const { settings } = await import('./settings');

		expect(get(settings).order).toEqual(DEFAULT_PANEL_ORDER);
	});

	it('should derive enabled panels correctly', async () => {
		const { settings, enabledPanels } = await import('./settings');

		// Disable some panels
		settings.disablePanel('satire');
		settings.disablePanel('correlation');

		const enabled = get(enabledPanels);
		expect(enabled).not.toContain('satire');
		expect(enabled).not.toContain('correlation');
		expect(enabled).toContain('map');
		expect(enabled).toContain('local-wire');
	});
});

describe('settings storage hardening (v2 retained controls)', () => {
	beforeEach(() => {
		localStorageMock.clear();
		vi.clearAllMocks();
		vi.resetModules();
	});

	it('keeps valid presentation prefs when panel JSON is malformed', async () => {
		localStorageMock.setItem('mm_panels', '{not json');
		localStorageMock.setItem('mm_panelOrder', '"not-an-array"');
		localStorageMock.setItem('mm_uiScale', '120');
		localStorageMock.setItem('mm_location', 'mill-valley');
		localStorageMock.setItem('mm_camerasHidden', 'true');
		const { settings } = await import('./settings');
		const state = get(settings);
		expect(state.uiScale).toBe(120);
		expect(state.locationId).toBe('mill-valley');
		expect(state.camerasHidden).toBe(true);
		expect(state.enabled['outdoors']).toBe(true);
	});

	it('restores a saved light theme after reload', async () => {
		const first = await import('./settings');
		first.settings.setTheme('light');
		vi.resetModules();
		const { settings } = await import('./settings');
		expect(get(settings).theme).toBe('light');
	});

	it('falls back to the default location when the saved one is unknown', async () => {
		localStorageMock.setItem('mm_location', 'atlantis');
		const [{ settings }, { DEFAULT_LOCATION_ID }] = await Promise.all([
			import('./settings'),
			import('../config/locations')
		]);
		expect(get(settings).locationId).toBe(DEFAULT_LOCATION_ID);
	});

	it('uses defaults and never throws when storage is denied', async () => {
		const realGet = localStorageMock.getItem;
		const realSet = localStorageMock.setItem;
		const realRemove = localStorageMock.removeItem;
		const denied = () => {
			throw new DOMException('denied', 'SecurityError');
		};
		localStorageMock.getItem = vi.fn(denied);
		localStorageMock.setItem = vi.fn(denied);
		localStorageMock.removeItem = vi.fn(denied);
		try {
			const { settings } = await import('./settings');
			expect(get(settings).uiScale).toBe(100);
			expect(() => settings.setUiScale(120)).not.toThrow();
			expect(get(settings).uiScale).toBe(120);
			expect(() => settings.toggleCamerasHidden()).not.toThrow();
			expect(get(settings).camerasHidden).toBe(true);
			expect(() => settings.toggleCamerasExpanded()).not.toThrow();
			expect(get(settings).camerasExpanded).toBe(true);
			expect(get(settings).camerasHidden).toBe(false);
			expect(() => settings.setLocation('novato')).not.toThrow();
			expect(get(settings).locationId).toBe('novato');
			expect(() => settings.setTheme('light')).not.toThrow();
			expect(get(settings).theme).toBe('light');
			const dashboardBefore = get(settings).dashboardExpanded;
			expect(() => settings.toggleDashboard()).not.toThrow();
			expect(get(settings).dashboardExpanded).toBe(!dashboardBefore);
			expect(() => settings.reset()).not.toThrow();
			expect(get(settings).uiScale).toBe(100);
		} finally {
			localStorageMock.getItem = realGet;
			localStorageMock.setItem = realSet;
			localStorageMock.removeItem = realRemove;
		}
	});
	it('keeps the selection for the page view when storage is full (QuotaExceededError)', async () => {
		const realSet = localStorageMock.setItem;
		localStorageMock.setItem = vi.fn(() => {
			throw new DOMException('full', 'QuotaExceededError');
		});
		try {
			const { settings } = await import('./settings');
			expect(() => settings.setUiScale(120)).not.toThrow();
			expect(get(settings).uiScale).toBe(120);
			expect(() => settings.setLocation('novato')).not.toThrow();
			expect(get(settings).locationId).toBe('novato');
			expect(() => settings.setTheme('light')).not.toThrow();
			expect(get(settings).theme).toBe('light');
		} finally {
			localStorageMock.setItem = realSet;
		}
	});

	it('applies a restored light theme to the document on load', async () => {
		localStorageMock.setItem('mm_theme', '"light"');
		const setAttribute = vi.fn();
		vi.stubGlobal('document', { documentElement: { setAttribute, style: {} } });
		try {
			await import('./settings');
			expect(setAttribute).toHaveBeenCalledWith('data-theme', 'light');
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe('transient theme (TV never persists its forced theme)', () => {
	beforeEach(() => {
		localStorageMock.clear();
		vi.clearAllMocks();
		vi.resetModules();
	});

	function stubDocument() {
		const attrs: Record<string, string> = {};
		const setAttribute = vi.fn((name: string, value: string) => {
			attrs[name] = value;
		});
		vi.stubGlobal('document', { documentElement: { setAttribute, style: {} } });
		return attrs;
	}

	it('shows the transient theme without saving it, so a reload without end() keeps the saved theme', async () => {
		localStorageMock.setItem('mm_theme', '"light"');
		const attrs = stubDocument();
		try {
			const { settings } = await import('./settings');
			settings.beginTransientTheme('dark');
			expect(get(settings).theme).toBe('dark');
			expect(attrs['data-theme']).toBe('dark');
			expect(localStorageMock.getItem('mm_theme')).toBe('"light"');

			// Tab close, reload or TV's 6-hour location.reload(): onDestroy never runs.
			vi.resetModules();
			const reloaded = await import('./settings');
			expect(get(reloaded.settings).theme).toBe('light');
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('end() restores the saved theme to the store and the document, and is idempotent', async () => {
		localStorageMock.setItem('mm_theme', '"light"');
		const attrs = stubDocument();
		try {
			const { settings } = await import('./settings');
			const end = settings.beginTransientTheme('dark');
			end();
			expect(get(settings).theme).toBe('light');
			expect(attrs['data-theme']).toBe('light');
			settings.setTheme('dark');
			end();
			expect(get(settings).theme).toBe('dark');
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('a theme change during the transient scope is shown but neither saved nor kept after end()', async () => {
		localStorageMock.setItem('mm_theme', '"light"');
		stubDocument();
		try {
			const { settings } = await import('./settings');
			const end = settings.beginTransientTheme('dark');
			settings.toggleTheme();
			expect(get(settings).theme).toBe('light');
			settings.setTheme('dark');
			expect(localStorageMock.getItem('mm_theme')).toBe('"light"');
			end();
			expect(get(settings).theme).toBe('light');
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

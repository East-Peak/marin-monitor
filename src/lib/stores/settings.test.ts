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
		const [{ settings }, { PANELS, DEFAULT_PANEL_ORDER }] = await Promise.all([
			import('./settings'),
			import('../config')
		]);

		const state = get(settings);
		expect(state.initialized).toBe(false);
		expect(state.order).toEqual(DEFAULT_PANEL_ORDER);

		for (const panelId of Object.keys(PANELS) as Array<keyof typeof PANELS>) {
			expect(state.enabled[panelId]).toBe(true);
		}
	});

	it('should toggle panel visibility', async () => {
		const { settings } = await import('./settings');

		// Initially enabled
		expect(get(settings).enabled['outdoors']).toBe(true);

		// Toggle off
		settings.togglePanel('outdoors');
		expect(get(settings).enabled['outdoors']).toBe(false);

		// Toggle on
		settings.togglePanel('outdoors');
		expect(get(settings).enabled['outdoors']).toBe(true);
	});

	it('should persist panel settings to localStorage', async () => {
		const { settings } = await import('./settings');

		settings.togglePanel('housing');

		expect(localStorageMock.setItem).toHaveBeenCalledWith('mm_panels', expect.any(String));

		const savedData = JSON.parse(
			localStorageMock.setItem.mock.calls[localStorageMock.setItem.mock.calls.length - 1][1]
		);
		expect(savedData['housing']).toBe(false);
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
		settings.togglePanel('outdoors');
		settings.updateSize('map', { width: 1000 });

		// Reset
		settings.reset();

		const state = get(settings);
		expect(state.enabled['outdoors']).toBe(true);
		expect(state.sizes['map']).toBeUndefined();
		expect(state.order).toEqual(DEFAULT_PANEL_ORDER);
	});

	it('should enable every registered panel for the everything preset', async () => {
		const [{ settings }, { PANELS, PRESETS, DEFAULT_PANEL_ORDER }] = await Promise.all([
			import('./settings'),
			import('../config')
		]);

		expect(PRESETS.everything.panels).toEqual(DEFAULT_PANEL_ORDER);

		settings.applyPreset('everything');

		const state = get(settings);
		expect(state.order).toEqual(DEFAULT_PANEL_ORDER);

		for (const panelId of Object.keys(PANELS) as Array<keyof typeof PANELS>) {
			expect(state.enabled[panelId]).toBe(true);
		}
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
		settings.togglePanel('satire');
		settings.togglePanel('correlation');

		const enabled = get(enabledPanels);
		expect(enabled).not.toContain('satire');
		expect(enabled).not.toContain('correlation');
		expect(enabled).toContain('map');
		expect(enabled).toContain('local-wire');
	});
});

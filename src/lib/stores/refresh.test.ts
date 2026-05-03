/**
 * Tests for refresh store
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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
	value: localStorageMock
});

describe('Refresh Store', () => {
	beforeEach(async () => {
		localStorageMock.clear();
		vi.clearAllMocks();
		vi.resetModules();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should start with default state', async () => {
		const { isRefreshing, lastRefresh } = await import('./refresh');

		expect(get(isRefreshing)).toBe(false);
		expect(get(lastRefresh)).toBeNull();
	});

	it('should start and end refresh cycle', async () => {
		const { refresh, isRefreshing, currentStage, lastRefresh } = await import('./refresh');

		refresh.startRefresh();
		expect(get(isRefreshing)).toBe(true);
		expect(get(currentStage)).toBe('critical');

		refresh.endRefresh();
		expect(get(isRefreshing)).toBe(false);
		expect(get(currentStage)).toBeNull();
		expect(get(lastRefresh)).not.toBeNull();
	});

	it('should progress through stages', async () => {
		const { refresh, currentStage } = await import('./refresh');

		refresh.startRefresh();
		expect(get(currentStage)).toBe('critical');

		refresh.nextStage();
		expect(get(currentStage)).toBe('secondary');

		refresh.nextStage();
		expect(get(currentStage)).toBe('tertiary');

		refresh.nextStage();
		expect(get(currentStage)).toBeNull();
	});

	it('should track category loading states', async () => {
		const { refresh } = await import('./refresh');

		refresh.setCategoryLoading('news', true);

		const state = get(refresh);
		expect(state.categoryStates['news'].loading).toBe(true);

		refresh.setCategoryUpdated('news');
		const updated = get(refresh);
		expect(updated.categoryStates['news'].loading).toBe(false);
		expect(updated.categoryStates['news'].lastUpdated).not.toBeNull();
	});

	it('should track category errors', async () => {
		const { refresh, categoriesWithErrors } = await import('./refresh');

		refresh.setCategoryError('markets', 'API timeout');

		const errors = get(categoriesWithErrors);
		expect(errors.length).toBe(1);
		expect(errors[0].category).toBe('markets');
		expect(errors[0].error).toBe('API timeout');
	});

	it('should toggle auto-refresh', async () => {
		const { refresh, autoRefreshEnabled } = await import('./refresh');

		expect(get(autoRefreshEnabled)).toBe(true);

		refresh.toggleAutoRefresh();
		expect(get(autoRefreshEnabled)).toBe(false);

		refresh.toggleAutoRefresh();
		expect(get(autoRefreshEnabled)).toBe(true);
	});

	it('should persist auto-refresh settings', async () => {
		const { refresh } = await import('./refresh');

		refresh.setAutoRefreshInterval(120000);

		expect(localStorageMock.setItem).toHaveBeenCalledWith('refreshSettings', expect.any(String));

		const savedData = JSON.parse(
			localStorageMock.setItem.mock.calls[localStorageMock.setItem.mock.calls.length - 1][1]
		);
		expect(savedData.autoRefreshInterval).toBe(120000);
	});

	it('should record refresh history', async () => {
		const { refresh } = await import('./refresh');

		refresh.startRefresh();
		vi.advanceTimersByTime(1000);
		refresh.endRefresh();

		const state = get(refresh);
		expect(state.refreshHistory.length).toBe(1);
		expect(state.refreshHistory[0].success).toBe(true);
		expect(state.refreshHistory[0].duration).toBeGreaterThanOrEqual(1000);
	});

	it('should record errors in refresh history', async () => {
		const { refresh } = await import('./refresh');

		refresh.startRefresh();
		refresh.endRefresh(['API error', 'Timeout']);

		const state = get(refresh);
		expect(state.refreshHistory[0].success).toBe(false);
		expect(state.refreshHistory[0].errors).toEqual(['API error', 'Timeout']);
	});

	it('should check if category needs refresh', async () => {
		const { refresh } = await import('./refresh');

		// Never updated - needs refresh
		expect(refresh.categoryNeedsRefresh('news', 60000)).toBe(true);

		// Just updated - doesn't need refresh
		refresh.setCategoryUpdated('news');
		expect(refresh.categoryNeedsRefresh('news', 60000)).toBe(false);

		// After time passes - needs refresh
		vi.advanceTimersByTime(70000);
		expect(refresh.categoryNeedsRefresh('news', 60000)).toBe(true);
	});

	it('should limit refresh history to 10 entries', async () => {
		const { refresh } = await import('./refresh');

		// Create 15 refresh cycles
		for (let i = 0; i < 15; i++) {
			refresh.startRefresh();
			refresh.endRefresh();
		}

		const state = get(refresh);
		expect(state.refreshHistory.length).toBe(10);
	});

	// FIX-5 — auto-refresh rescheduling must read the post-update state, not the
	// pre-update state. Previously setupAutoRefresh() was called inside the
	// update() closure, which means it observed the OLD state via get() and
	// produced the wrong timer. These tests pin the corrected behavior.

	it('toggleAutoRefresh(callback) from enabled→disabled stops the timer', async () => {
		const { refresh } = await import('./refresh');
		const callback = vi.fn();

		refresh.setupAutoRefresh(callback);

		// Default is enabled; timer fires at the default interval.
		vi.advanceTimersByTime(5 * 60 * 1000);
		expect(callback).toHaveBeenCalledTimes(1);
		callback.mockClear();

		// Toggle off and re-supply the callback. With the bug, setupAutoRefresh()
		// reads autoRefreshEnabled=true (pre-update) and keeps the timer running.
		refresh.toggleAutoRefresh(callback);

		vi.advanceTimersByTime(15 * 60 * 1000);
		expect(callback).not.toHaveBeenCalled();
	});

	it('toggleAutoRefresh(callback) from disabled→enabled starts the timer', async () => {
		const { refresh } = await import('./refresh');
		const callback = vi.fn();

		refresh.toggleAutoRefresh(); // → disabled, no callback yet

		// Now toggle back on with a callback.
		refresh.toggleAutoRefresh(callback);

		vi.advanceTimersByTime(5 * 60 * 1000);
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('setAutoRefreshInterval(newInterval, callback) reschedules with the new cadence', async () => {
		const { refresh } = await import('./refresh');
		const callback = vi.fn();

		refresh.setupAutoRefresh(callback);

		// New interval is 1 minute (was the 5-minute default).
		refresh.setAutoRefreshInterval(60 * 1000, callback);

		vi.advanceTimersByTime(60 * 1000);
		expect(callback).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(60 * 1000);
		expect(callback).toHaveBeenCalledTimes(2);
	});
});

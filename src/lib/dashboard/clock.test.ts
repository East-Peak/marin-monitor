import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClock } from './clock';

afterEach(() => vi.useRealTimers());

describe('createClock', () => {
	it('starts at now and ticks on its interval while subscribed', () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000_000);
		const seen: number[] = [];
		const stop = createClock(30_000).subscribe((t) => seen.push(t));
		vi.advanceTimersByTime(60_000);
		stop();
		vi.advanceTimersByTime(60_000);
		// The catch-up at 0 ms re-reads the same instant; a store skips an equal value.
		expect(seen).toEqual([1_000_000, 1_030_000, 1_060_000]);
	});
});

describe('createClock from a render time (DASH-FLIP1: one clock through hydration)', () => {
	it('starts at the given time, not the browser clock, and moves to real time right after hydration', () => {
		vi.useFakeTimers();
		vi.setSystemTime(1_000_000 + 180_000); // the browser is three minutes past the render
		const seen: number[] = [];
		const stop = createClock(30_000, Date.now, 1_000_000).subscribe((t) => seen.push(t));
		// Synchronously (hydration) the page reads the render time...
		expect(seen).toEqual([1_000_000]);
		// ...then catches up at once, not a full tick later: edge-cached HTML can be minutes old
		// (DASH-FLIP2), and an expired advisory must not linger for a tick.
		vi.advanceTimersByTime(0);
		expect(seen).toEqual([1_000_000, 1_180_000]);
		vi.advanceTimersByTime(30_000);
		stop();
		expect(seen).toEqual([1_000_000, 1_180_000, 1_210_000]);
	});
});

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
		expect(seen).toEqual([1_000_000, 1_030_000, 1_060_000]);
	});
});

/**
 * The wall clock the v2 page re-renders against, for clock-driven expiry and
 * freshness (advisories, observations, "today"). Ticks only in the browser.
 */
import { readable, type Readable } from 'svelte/store';

export const CLOCK_TICK_MS = 30_000;

export function createClock(
	intervalMs = CLOCK_TICK_MS,
	now: () => number = Date.now
): Readable<number> {
	return readable(now(), (set) => {
		if (typeof window === 'undefined') return;
		const timer = setInterval(() => set(now()), intervalMs);
		return () => clearInterval(timer);
	});
}

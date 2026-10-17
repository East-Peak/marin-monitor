/**
 * The wall clock the v2 page re-renders against, for clock-driven expiry and
 * freshness (advisories, observations, "today"). Ticks only in the browser.
 *
 * `startAt` is the server's render time: SSR and hydration then read the same
 * instant (ages, Lately's 30-day edge), and the first tick after mount moves
 * the page to real time (DASH-FLIP1).
 */
import { readable, type Readable } from 'svelte/store';

export const CLOCK_TICK_MS = 30_000;

export function createClock(
	intervalMs = CLOCK_TICK_MS,
	now: () => number = Date.now,
	startAt: number = now()
): Readable<number> {
	return readable(startAt, (set) => {
		if (typeof window === 'undefined') return;
		const timer = setInterval(() => set(now()), intervalMs);
		return () => clearInterval(timer);
	});
}

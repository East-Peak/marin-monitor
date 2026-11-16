import { OBSERVATION_MAX_AGE_MS, type ObservedNow } from '$lib/weather/brief';

/**
 * The TV's "Now" temperature: the station's observed reading, the one the dashboard shows,
 * and only while it is recent. Never a forecast; null means "say it is unavailable".
 */
export function observedNowTemp(observed: ObservedNow | null, now: number): number | null {
	if (!observed || observed.tempF === null) return null;
	return now - observed.observedAt <= OBSERVATION_MAX_AGE_MS ? observed.tempF : null;
}

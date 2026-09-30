/**
 * Marin advisories from NWS, status-aware (spec §13.1). Unlike nws.ts
 * fetchAlerts (legacy; returns [] on failure), this throws so the row can
 * say so, and uses plain fetch so no cached copy is mistaken for a fresh
 * read. Bounded end to end and owner-aware (boundedOp).
 */
import { MARIN_ALERT_ZONES, parseNwsAlerts, type ParsedAlerts } from '$lib/weather/advisories';
import { boundedOp } from './bounded-op';

export const NWS_ALERTS_URL = `https://api.weather.gov/alerts/active?zone=${MARIN_ALERT_ZONES.join(',')}`;
const TIMEOUT_MS = 10_000;

export function fetchMarinAdvisories(
	options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<ParsedAlerts> {
	return boundedOp(
		'nws alerts',
		async (signal) => {
			const res = await fetch(NWS_ALERTS_URL, {
				headers: { Accept: 'application/geo+json' },
				signal
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const parsed = parseNwsAlerts(await res.json());
			if (parsed === null) throw new Error('not an NWS alert collection');
			return parsed;
		},
		{ owner: options.signal, timeoutMs: options.timeoutMs ?? TIMEOUT_MS }
	);
}

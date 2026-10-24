/**
 * Marin's NWS advisories for the dashboard's first paint (MOBILE1). Read on the client alone,
 * the row arrived after load at the top of the page and pushed everything under it down: most
 * of the phone's layout shift, and the reason an early tap landed on the wrong thing.
 *
 * Bounded like the news snapshot's read: a timeout or any failure is null, and the client
 * then reads them as before. e2e servers point NWS_ALERTS_FIXTURE at an NWS alert collection
 * (or /dev/null, for none); production never reads it.
 */
import { readFile } from 'node:fs/promises';
import { fetchMarinAdvisories } from '$lib/api/marin/nws-advisories';
import { parseNwsAlerts, type AdvisoryFeedState, type ParsedAlerts } from '$lib/weather/advisories';

/** The first paint never waits longer than this for advisories, as for news. */
const DEADLINE_MS = 1_200;

export async function readAdvisoriesForFirstPaint(
	env: Record<string, string | undefined>,
	deps: { fetch?: (timeoutMs: number) => Promise<ParsedAlerts>; now?: () => number } = {}
): Promise<AdvisoryFeedState | null> {
	const now = deps.now ?? Date.now;
	const fixture = env.NWS_ALERTS_FIXTURE;
	const read =
		fixture && env.VERCEL_ENV !== 'production'
			? () => fromFile(fixture)
			: () => (deps.fetch ?? ((timeoutMs) => fetchMarinAdvisories({ timeoutMs })))(DEADLINE_MS);
	const attemptAt = now();
	try {
		const { advisories, unreadable } = await read();
		return {
			advisories,
			unreadable,
			lastAttemptAt: attemptAt,
			lastSuccessAt: now(),
			lastError: null
		};
	} catch {
		return null;
	}
}

async function fromFile(path: string): Promise<ParsedAlerts> {
	const parsed = parseNwsAlerts(JSON.parse(await readFile(path, 'utf8')));
	if (parsed === null) throw new Error('not an NWS alert collection');
	return parsed;
}

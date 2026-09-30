import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true, version: 'test' }));

/** Every news adapter v2 wires, captured with the options it was called with. */
const calls = vi.hoisted(() => [] as { part: string; signal: AbortSignal | undefined }[]);
const held = (part: string) =>
	vi.fn((...args: unknown[]) => {
		const options = args.find((a) => typeof a === 'object' && a !== null && 'signal' in a) as
			| { signal?: AbortSignal }
			| undefined;
		calls.push({ part, signal: options?.signal });
		return new Promise<never>(() => {});
	});
vi.mock('$lib/api/marin/nps', async (orig) => ({
	...(await orig<object>()),
	fetchNpsAlerts: held('nps')
}));
vi.mock('$lib/api/marin/usgs', async (orig) => ({
	...(await orig<object>()),
	fetchEarthquakesOrThrow: held('earthquakes')
}));
vi.mock('$lib/api/marin/transit', async (orig) => ({
	...(await orig<object>()),
	fetchTransitAlerts: held('transit')
}));
vi.mock('$lib/api/marin/blotter', async (orig) => ({
	...(await orig<object>()),
	fetchSheriffCrimeBlotter: held('sheriff-blotter')
}));
vi.mock('$lib/api/marin/police-logs', async (orig) => ({
	...(await orig<object>()),
	fetchSupplementalPoliceLogs: held('police-logs')
}));
vi.mock('$lib/api/marin/activity', async (orig) => ({
	...(await orig<object>()),
	fetchSupplementalActivityFeeds: held('supplemental-activity')
}));
vi.mock('$lib/api/marin/seeclickfix', async (orig) => ({
	...(await orig<object>()),
	fetchSeeClickFixIssues: held('seeclickfix')
}));

const { v2NewsSources } = await import('./v2-controller');
const ADAPTERS = [
	'nps',
	'earthquakes',
	'transit',
	'sheriff-blotter',
	'police-logs',
	'supplemental-activity',
	'seeclickfix'
] as const;

afterEach(() => {
	calls.length = 0;
	vi.useRealTimers();
});

describe('v2NewsSources: every adapter request is owned and deadline-bounded (Codex PR 6 #1)', () => {
	it.each(ADAPTERS)(
		"%s: the owner's disposal aborts the actual request and settles the part",
		async (part) => {
			const owner = new AbortController();
			const pending = v2NewsSources(owner.signal)[part]();
			const settled = expect(pending).rejects.toThrow('aborted');
			await vi.waitFor(() => expect(calls.find((c) => c.part === part)).toBeDefined());
			const { signal } = calls.find((c) => c.part === part)!;
			expect(signal).toBeInstanceOf(AbortSignal);
			owner.abort();
			await settled;
			expect(signal!.aborted).toBe(true);
		}
	);

	it.each(ADAPTERS)('%s: the deadline aborts the actual request', async (part) => {
		vi.useFakeTimers();
		const pending = v2NewsSources(new AbortController().signal, { deadlineMs: 1_000 })[part]();
		const settled = expect(pending).rejects.toThrow('timed out after 1000 ms');
		await vi.advanceTimersByTimeAsync(1_000);
		await settled;
		expect(calls.find((c) => c.part === part)!.signal!.aborted).toBe(true);
	});
});

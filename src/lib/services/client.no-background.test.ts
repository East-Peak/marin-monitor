// The real ServiceClient: stale cache, a failing upstream, a held backoff, disposal (Codex r2 #3).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceClient } from './client';

// Node's own global localStorage has no methods without a backing file: an in-memory one,
// as cache.test.ts does, so the client's storage tier behaves like a browser's.
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
	configurable: true,
	writable: true,
	value: {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, String(v)),
		removeItem: (k: string) => void store.delete(k),
		clear: () => store.clear(),
		key: (i: number) => [...store.keys()][i] ?? null,
		get length() {
			return store.size;
		}
	}
});

const ENDPOINT = '/stations/KDVO/observations/latest';
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	localStorage.clear();
});

async function staleClient() {
	vi.useFakeTimers();
	vi.setSystemTime(Date.parse('2026-09-29T15:00:00Z'));
	let calls = 0;
	const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
		calls += 1;
		return calls === 1
			? new Response('{"v":1}', { headers: { 'content-type': 'application/json' } })
			: new Response('down', { status: 500, statusText: 'Server Error' });
	});
	vi.stubGlobal('fetch', fetchSpy);
	const client = new ServiceClient();
	await client.request('NWS', ENDPOINT); // seeds the cache
	vi.setSystemTime(Date.parse('2026-09-29T15:20:00Z')); // past NWS's 15-minute TTL: stale
	return { client, fetchSpy };
}

describe('ServiceClient revalidateInBackground: false', () => {
	it('stale cache + failing upstream + held backoff + disposal → zero further attempts, foreground or background', async () => {
		const { client, fetchSpy } = await staleClient();
		const owner = new AbortController();
		const pending = client.request('NWS', ENDPOINT, {
			signal: owner.signal,
			revalidateInBackground: false
		});
		await vi.advanceTimersByTimeAsync(0); // attempt 1 fails; the client is now waiting out its backoff
		expect(fetchSpy).toHaveBeenCalledTimes(2);
		owner.abort(); // the view is destroyed during the backoff
		await pending.catch(() => {});
		await vi.advanceTimersByTimeAsync(120_000);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});
	it('preservation guard: without the flag a stale hit still refreshes in the background (legacy unchanged)', async () => {
		const { client, fetchSpy } = await staleClient();
		const result = await client.request('NWS', ENDPOINT);
		expect(result).toMatchObject({ stale: true });
		await vi.advanceTimersByTimeAsync(0);
		expect(fetchSpy).toHaveBeenCalledTimes(2);
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { FetchResult } from '$lib/api/marin/data-fetcher';
import { createDatasetRegistry, dataset, type DatasetTier } from './datasets';

afterEach(() => vi.useRealTimers());

interface Payload {
	current: { lastSuccessfulScrapeAt: string | null } | null;
}
const payload = (at: string | null): Payload => ({ current: { lastSuccessfulScrapeAt: at } });
const T1 = '2026-09-29T12:00:00.000Z';
const T2 = '2026-09-29T16:00:00.000Z';

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

function def(id: string, tier: DatasetTier = 'essential') {
	const load = vi.fn<(signal: AbortSignal) => Promise<FetchResult<Payload>>>(async () => ({
		ok: true,
		data: payload(T1),
		dataSource: 'live'
	}));
	const commit = vi.fn<(data: Payload) => void>();
	return {
		d: dataset<Payload>({
			id,
			name: id,
			tier,
			load,
			commit,
			observedAtOf: (p) => p.current?.lastSuccessfulScrapeAt,
			maxAgeMs: 86_400_000
		}),
		load,
		commit
	};
}

describe('createDatasetRegistry', () => {
	it('concurrent ensure calls share one request and commit once, with the value’s own observation time', async () => {
		const gas = def('gas');
		const held = deferred<FetchResult<Payload>>();
		gas.load.mockReturnValueOnce(held.promise);
		const r = createDatasetRegistry([gas.d], new AbortController().signal);
		const a = r.ensure('gas');
		const b = r.ensure('gas');
		held.resolve({ ok: true, data: payload(T2), dataSource: 'live' });
		await Promise.all([a, b]);
		expect(gas.load).toHaveBeenCalledTimes(1);
		expect(gas.commit).toHaveBeenCalledExactlyOnceWith(payload(T2));
		expect(get(r.outcomes).gas).toEqual({ kind: 'live', observedAt: Date.parse(T2) });
	});

	it('a value without a usable scrape time records observedAt null, never NaN', async () => {
		const gas = def('gas');
		gas.load.mockResolvedValueOnce({ ok: true, data: payload('garbage'), dataSource: 'live' });
		const r = createDatasetRegistry([gas.d], new AbortController().signal);
		await r.refresh('essential');
		expect(get(r.outcomes).gas).toEqual({ kind: 'live', observedAt: null });
	});

	it('ensure never reloads a settled dataset; refresh does', async () => {
		const gas = def('gas');
		const r = createDatasetRegistry([gas.d], new AbortController().signal);
		await r.ensure('gas');
		await r.ensure('gas');
		expect(gas.load).toHaveBeenCalledTimes(1);
		await r.refresh('essential');
		expect(gas.load).toHaveBeenCalledTimes(2);
	});

	it('a failure after a success keeps the store and the retained value’s own time (Codex r1 #3)', async () => {
		const gas = def('gas');
		const r = createDatasetRegistry([gas.d], new AbortController().signal);
		await r.refresh('essential');
		gas.load.mockResolvedValueOnce({ ok: false, error: 'HTTP 503', fallback: payload(null) });
		await r.refresh('essential');
		expect(gas.commit).toHaveBeenCalledTimes(1);
		expect(get(r.outcomes).gas).toEqual({
			kind: 'failed',
			error: 'HTTP 503',
			retained: true,
			observedAt: Date.parse(T1)
		});
	});

	it('a first failure, or a thrown load, is not retained', async () => {
		const gas = def('gas');
		gas.load.mockRejectedValueOnce(new Error('offline'));
		const r = createDatasetRegistry([gas.d], new AbortController().signal);
		await r.refresh('essential');
		expect(get(r.outcomes).gas).toEqual({
			kind: 'failed',
			error: 'offline',
			retained: false,
			observedAt: null
		});
	});

	it('a server fallback is recorded as fallback with its own time, not live', async () => {
		const gas = def('gas');
		gas.load.mockResolvedValueOnce({ ok: true, data: payload(T1), dataSource: 'static-fallback' });
		const r = createDatasetRegistry([gas.d], new AbortController().signal);
		await r.refresh('essential');
		expect(get(r.outcomes).gas).toEqual({
			kind: 'fallback',
			dataSource: 'static-fallback',
			observedAt: Date.parse(T1)
		});
	});

	it('a stalled body fails by the deadline and the next refresh recovers (Codex r1 #4)', async () => {
		vi.useFakeTimers();
		const gas = def('gas');
		gas.load.mockReturnValueOnce(new Promise<never>(() => {}));
		const r = createDatasetRegistry([gas.d], new AbortController().signal, { deadlineMs: 1_000 });
		const stuck = r.refresh('essential');
		await vi.advanceTimersByTimeAsync(1_000);
		await stuck;
		expect(get(r.outcomes).gas).toEqual({
			kind: 'failed',
			error: 'dataset gas: timed out after 1000 ms',
			retained: false,
			observedAt: null
		});
		await r.refresh('essential');
		expect(get(r.outcomes).gas).toEqual({ kind: 'live', observedAt: Date.parse(T1) });
	});

	it('inventories load only when ensured, then refresh with their tier', async () => {
		const gas = def('gas');
		const strava = def('strava', 'inventory');
		const r = createDatasetRegistry([gas.d, strava.d], new AbortController().signal);
		await r.refresh('essential');
		await r.refresh('inventory');
		expect(strava.load).not.toHaveBeenCalled();
		await r.ensure('strava');
		await r.refresh('inventory');
		expect(strava.load).toHaveBeenCalledTimes(2);
	});

	it('after the owner aborts: no commit, no outcome, no new load, and the load saw the abort', async () => {
		const gas = def('gas');
		const held = deferred<FetchResult<Payload>>();
		gas.load.mockReturnValueOnce(held.promise);
		const owner = new AbortController();
		const r = createDatasetRegistry([gas.d], owner.signal);
		const pending = r.refresh('essential');
		owner.abort();
		expect(gas.load.mock.calls[0][0].aborted).toBe(true);
		held.resolve({ ok: true, data: payload(T2), dataSource: 'live' });
		await pending;
		await r.refresh('essential');
		await r.ensure('gas');
		expect(gas.commit).not.toHaveBeenCalled();
		expect(get(r.outcomes)).toEqual({});
		expect(gas.load).toHaveBeenCalledTimes(1);
	});

	it('an unknown id is a programming error', async () => {
		const r = createDatasetRegistry([], new AbortController().signal);
		await expect(r.ensure('nope')).rejects.toThrow('unknown dataset: nope');
	});
});

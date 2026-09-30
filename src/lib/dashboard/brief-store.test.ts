import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { getLocationById } from '$lib/config/locations';
import type { HourlyForecast, ObservedNow, TideEvent } from '$lib/weather/brief';
import { createBriefStore, type BriefFetchers } from './brief-store';

const CENTRAL = getLocationById('central-marin');
const MILL_VALLEY = getLocationById('mill-valley');
const forecast = (updatedAt: number): HourlyForecast => ({ updatedAt, periods: [] });
const TIDES: TideEvent[] = [{ atMs: 1, heightFt: 6.3, type: 'H' }];
const obs = (observedAt: number): ObservedNow => ({
	stationName: 'Gnoss Field (Novato)',
	observedAt,
	tempF: 60,
	text: null
});

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: unknown) => void;
	const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
	return { promise, resolve, reject };
}

function fetchers(over: Partial<BriefFetchers> = {}): BriefFetchers {
	return {
		hourly: vi.fn(async (lat: number) => forecast(lat)),
		observation: vi.fn(async () => obs(100)),
		tides: vi.fn(async () => TIDES),
		...over
	};
}

describe('createBriefStore', () => {
	it('labels each value with the scope it was fetched for', async () => {
		const s = createBriefStore(fetchers(), new AbortController().signal);
		await s.load(CENTRAL);
		const b = get(s);
		expect(b.forecast).toMatchObject({
			scope: 'Central Marin forecast',
			state: 'ok',
			observedAt: CENTRAL.lat,
			updatingFor: null
		});
		expect(b.tides).toMatchObject({ scope: 'Point Reyes', state: 'ok', value: TIDES });
		expect(b.observed).toMatchObject({ scope: 'Gnoss Field (Novato)', observedAt: 100 });
	});

	it('a slower earlier response never overwrites a later one', async () => {
		const slow = deferred<HourlyForecast>();
		const hourly = vi.fn((lat: number) =>
			lat === CENTRAL.lat ? slow.promise : Promise.resolve(forecast(lat))
		);
		const s = createBriefStore(fetchers({ hourly }), new AbortController().signal);
		const first = s.load(CENTRAL);
		await s.load(MILL_VALLEY);
		slow.resolve(forecast(CENTRAL.lat));
		await first;
		expect(get(s).forecast).toMatchObject({
			scope: 'Mill Valley forecast',
			observedAt: MILL_VALLEY.lat
		});
	});

	it('while the new town loads, the old value keeps its old label and says what is updating', async () => {
		const pending = deferred<HourlyForecast>();
		let call = 0;
		const s = createBriefStore(
			fetchers({
				hourly: vi.fn(() => (++call === 1 ? Promise.resolve(forecast(1)) : pending.promise))
			}),
			new AbortController().signal
		);
		await s.load(CENTRAL);
		const loading = s.load(MILL_VALLEY);
		expect(get(s).forecast).toMatchObject({
			scope: 'Central Marin forecast',
			updatingFor: 'Mill Valley',
			value: forecast(1)
		});
		expect(get(s).tides).toMatchObject({ scope: 'Point Reyes', updatingFor: 'Mill Valley' });
		pending.resolve(forecast(2));
		await loading;
		expect(get(s).forecast).toMatchObject({ scope: 'Mill Valley forecast', updatingFor: null });
	});

	it('a failed new-town request keeps the old value and label and names the town that failed (MM-04)', async () => {
		const hourly = vi.fn(async (lat: number) => {
			if (lat === MILL_VALLEY.lat) throw new Error('HTTP 500');
			return forecast(lat);
		});
		const s = createBriefStore(fetchers({ hourly }), new AbortController().signal);
		await s.load(CENTRAL);
		await s.load(MILL_VALLEY);
		expect(get(s).forecast).toMatchObject({
			value: forecast(CENTRAL.lat),
			scope: 'Central Marin forecast',
			state: 'stale',
			detail: "Couldn't load the Mill Valley forecast",
			updatingFor: null
		});
	});

	it('a first failure has nothing to retain: unavailable', async () => {
		const s = createBriefStore(
			fetchers({ tides: vi.fn(async () => Promise.reject(new Error('x'))) }),
			new AbortController().signal
		);
		await s.load(CENTRAL);
		expect(get(s).tides).toMatchObject({
			value: null,
			state: 'unavailable',
			detail: "Couldn't load Point Reyes tides"
		});
	});

	it('an older observation never replaces a newer one', async () => {
		let n = 0;
		const s = createBriefStore(
			fetchers({ observation: vi.fn(async () => obs(++n === 1 ? 200 : 150)) }),
			new AbortController().signal
		);
		await s.load(CENTRAL);
		await s.load(CENTRAL);
		expect(get(s).observed.observedAt).toBe(200);
	});

	it('overlapping loads share one observation request, so an old failure cannot follow a new success (Codex r1 #14)', async () => {
		const held = deferred<ObservedNow>();
		const observation = vi.fn(() => held.promise);
		const s = createBriefStore(fetchers({ observation }), new AbortController().signal);
		const a = s.load(CENTRAL);
		const b = s.load(MILL_VALLEY);
		held.reject(new Error('HTTP 500'));
		await Promise.all([a, b]);
		expect(observation).toHaveBeenCalledTimes(1);
		observation.mockResolvedValueOnce(obs(300));
		await s.load(MILL_VALLEY);
		expect(get(s).observed).toMatchObject({ state: 'ok', observedAt: 300 });
	});

	it('each fetch gets an owner-linked signal; a stalled forecast fails by the deadline', async () => {
		vi.useFakeTimers();
		const signals: AbortSignal[] = [];
		const hourly = vi.fn((_lat: number, _lon: number, signal: AbortSignal) => {
			signals.push(signal);
			return new Promise<HourlyForecast>(() => {});
		});
		const s = createBriefStore(fetchers({ hourly }), new AbortController().signal, {
			deadlineMs: 1_000
		});
		const pending = s.load(CENTRAL);
		await vi.advanceTimersByTimeAsync(1_000);
		await pending;
		expect(signals[0].aborted).toBe(true);
		expect(get(s).forecast).toMatchObject({
			state: 'unavailable',
			detail: "Couldn't load the Central Marin forecast"
		});
		vi.useRealTimers();
	});

	it('writes nothing after the owner aborts', async () => {
		const owner = new AbortController();
		const held = deferred<HourlyForecast>();
		const s = createBriefStore(fetchers({ hourly: vi.fn(() => held.promise) }), owner.signal);
		const pending = s.load(CENTRAL);
		owner.abort();
		held.resolve(forecast(9));
		await pending;
		expect(get(s).forecast.value).toBeNull();
	});
});

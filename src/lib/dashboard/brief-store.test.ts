import { describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { getLocationById } from '$lib/config/locations';
import type { HourlyForecast, ObservedNow, TideEvent } from '$lib/weather/brief';
import { createBriefStore, initialBriefState, type BriefFetchers } from './brief-store';

const CENTRAL = getLocationById('central-marin');
const MILL_VALLEY = getLocationById('mill-valley');
const forecast = (updatedAt: number): HourlyForecast => ({ updatedAt, periods: [] });
const TIDES: TideEvent[] = [{ atMs: 1, heightFt: 6.3, type: 'H' }];
const obs = (observedAt: number, over: Partial<ObservedNow> = {}): ObservedNow => ({
	stationName: 'Gnoss Field (Novato)',
	observedAt,
	listNewestAt: observedAt,
	tempF: 60,
	text: null,
	...over
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
	it('starts from initialBriefState: every card loading, which the first paint renders too (MOBILE1)', () => {
		const s = createBriefStore(fetchers(), new AbortController().signal);
		expect(get(s)).toEqual(initialBriefState());
		for (const card of Object.values(initialBriefState())) {
			expect(card.state).toBe('loading');
			expect(card.value).toBeNull();
		}
	});

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

	it('recovery: a later list whose older report gained a temperature replaces a newer "unknown" (Codex r1 #2)', async () => {
		let n = 0;
		const s = createBriefStore(
			fetchers({
				observation: vi.fn(async () =>
					++n === 1 ? obs(200, { tempF: null }) : obs(150, { listNewestAt: 200 })
				)
			}),
			new AbortController().signal
		);
		await s.load(CENTRAL);
		expect(get(s).observed.value).toMatchObject({ observedAt: 200, tempF: null });
		await s.load(CENTRAL);
		expect(get(s).observed).toMatchObject({
			observedAt: 150,
			value: { observedAt: 150, tempF: 60 },
			state: 'ok'
		});
	});

	it('QC reversal: a later list that rejected the shown report replaces it with its older valid one (Codex r2 #1)', async () => {
		let n = 0;
		const s = createBriefStore(
			fetchers({
				observation: vi.fn(async () =>
					++n === 1 ? obs(200, { tempF: 104 }) : obs(150, { listNewestAt: 200 })
				)
			}),
			new AbortController().signal
		);
		await s.load(CENTRAL);
		await s.load(CENTRAL);
		expect(get(s).observed.value).toMatchObject({ observedAt: 150, tempF: 60 });
	});

	it('a stale list never resurrects a value the newer list rejected (Codex r3 #1)', async () => {
		let n = 0;
		const s = createBriefStore(
			fetchers({
				observation: vi.fn(async () =>
					++n === 1 ? obs(150, { listNewestAt: 200 }) : obs(180, { tempF: 104 })
				)
			}),
			new AbortController().signal
		);
		await s.load(CENTRAL);
		await s.load(CENTRAL);
		expect(get(s).observed.value).toMatchObject({ observedAt: 150, tempF: 60 });
	});

	it('a stale copy (its list predates the shown list) never replaces it, unknown or not', async () => {
		let n = 0;
		const s = createBriefStore(
			fetchers({
				observation: vi.fn(async () => (++n === 1 ? obs(200, { tempF: null }) : obs(150)))
			}),
			new AbortController().signal
		);
		await s.load(CENTRAL);
		await s.load(CENTRAL);
		expect(get(s).observed.value).toMatchObject({ observedAt: 200, tempF: null });
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

describe('createBriefStore — desktop detail (MAPX1)', () => {
	const HISTORY = [
		{ atMs: 10, tempF: 50 },
		{ atMs: 20, tempF: 52 }
	];
	const HEIGHTS = [{ atMs: 1, heightFt: 3.1 }];
	const withDetail = (over: Partial<BriefFetchers> = {}) =>
		fetchers({
			history: vi.fn(async () => HISTORY),
			tideHourly: vi.fn(async () => HEIGHTS),
			...over
		});

	it('loads nothing extra until the desktop asks: the phone issues no new requests', async () => {
		const f = withDetail();
		const s = createBriefStore(f, new AbortController().signal);
		await s.load(CENTRAL);
		expect(f.history).not.toHaveBeenCalled();
		expect(f.tideHourly).not.toHaveBeenCalled();
		expect(get(s).history.state).toBe('loading');
	});
	it('enableDetail loads the 12-hour trace and the hourly tide now, then on every load', async () => {
		const f = withDetail();
		const s = createBriefStore(f, new AbortController().signal);
		await s.load(CENTRAL);
		await s.enableDetail();
		expect(get(s).history).toMatchObject({
			value: HISTORY,
			scope: 'Gnoss Field (Novato)',
			observedAt: 20,
			state: 'ok'
		});
		expect(get(s).tideHourly).toMatchObject({ value: HEIGHTS, scope: 'Point Reyes', state: 'ok' });
		expect(f.tideHourly).toHaveBeenCalledWith(CENTRAL.tideStation, expect.any(AbortSignal));
		await s.load(MILL_VALLEY);
		expect(f.history).toHaveBeenCalledTimes(2);
		expect(f.tideHourly).toHaveBeenCalledTimes(2);
	});
	it('enabled before the first load, it waits for a location and then loads with it', async () => {
		const f = withDetail();
		const s = createBriefStore(f, new AbortController().signal);
		await s.enableDetail();
		expect(f.tideHourly).not.toHaveBeenCalled();
		await s.load(CENTRAL);
		expect(f.tideHourly).toHaveBeenCalledTimes(1);
	});
	it('a failed trace is unavailable, never an empty trace; a later failure keeps the old one as stale', async () => {
		const history = vi.fn().mockRejectedValueOnce(new Error('503'));
		const s = createBriefStore(withDetail({ history }), new AbortController().signal);
		await s.load(CENTRAL);
		await s.enableDetail();
		expect(get(s).history).toMatchObject({ value: null, state: 'unavailable' });
		history.mockResolvedValueOnce(HISTORY).mockRejectedValueOnce(new Error('503'));
		await s.load(CENTRAL);
		expect(get(s).history.state).toBe('ok');
		await s.load(CENTRAL);
		expect(get(s).history).toMatchObject({ value: HISTORY, state: 'stale' });
	});
});

describe('createBriefStore — disableDetail (MAPX1, Codex #4)', () => {
	it('a page resized to phone stops asking for the desktop detail', async () => {
		const history = vi.fn(async () => []);
		const tideHourly = vi.fn(async () => []);
		const s = createBriefStore(fetchers({ history, tideHourly }), new AbortController().signal);
		await s.load(CENTRAL);
		await s.enableDetail();
		s.disableDetail();
		await s.load(MILL_VALLEY);
		expect(history).toHaveBeenCalledTimes(1);
		expect(tideHourly).toHaveBeenCalledTimes(1);
		await s.enableDetail();
		expect(history).toHaveBeenCalledTimes(2);
	});
});

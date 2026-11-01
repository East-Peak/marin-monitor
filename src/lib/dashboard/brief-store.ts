/**
 * The v2 brief's data (spec §2.3, §4, §13.9). Values are stored raw with the
 * scope they were fetched for; the card derives today's answer from the
 * clock. A town switch never relabels a retained value (fixes MM-04), and a
 * slower earlier response never overwrites a later one.
 */
import { writable, type Readable } from 'svelte/store';
import { boundedOp, DEFAULT_OP_DEADLINE_MS } from '$lib/api/marin/bounded-op';
import type { LocationPreset } from '$lib/config/locations';
import {
	FORECAST_MAX_AGE_MS,
	OBSERVATION_MAX_AGE_MS,
	OBSERVATION_STATION,
	forecastScope,
	type HourlyForecast,
	type ObservedNow,
	type TideEvent
} from '$lib/weather/brief';
import type { TempReport } from '$lib/api/marin/nws-observation';
import type { TideHeight } from '$lib/api/marin/tides';
import type { SourceEntryState } from './source-status';

export interface BriefFetchers {
	hourly(lat: number, lon: number, signal: AbortSignal): Promise<HourlyForecast>;
	observation(station: { id: string; name: string }, signal: AbortSignal): Promise<ObservedNow>;
	tides(stationId: string, signal: AbortSignal): Promise<TideEvent[]>;
	/** Desktop detail (MAPX1): read only after enableDetail(). */
	history?(station: { id: string; name: string }, signal: AbortSignal): Promise<TempReport[]>;
	tideHourly?(stationId: string, signal: AbortSignal): Promise<TideHeight[]>;
}

export interface BriefCard<T> {
	value: T | null;
	/** The scope `value` was fetched for; it travels with the value. */
	scope: string | null;
	observedAt: number | null;
	maxAgeMs: number | null;
	state: SourceEntryState;
	detail: string | null;
	/** The place a newer request is loading for, while `value` is still the old one. */
	updatingFor: string | null;
}

export interface BriefState {
	forecast: BriefCard<HourlyForecast>;
	observed: BriefCard<ObservedNow>;
	tides: BriefCard<TideEvent[]>;
	/** The station's last 12 hours (loading until enabled: the desktop tile, or Outdoors opened). */
	history: BriefCard<TempReport[]>;
	/** The forecast at the station's own grid point, whatever town is picked (weather tile C). */
	stationForecast: BriefCard<HourlyForecast>;
	/** NOAA's hourly heights for the tide curve (desktop only; loading until enabled). */
	tideHourly: BriefCard<TideHeight[]>;
}

function emptyCard<T>(maxAgeMs: number | null): BriefCard<T> {
	return {
		value: null,
		scope: null,
		observedAt: null,
		maxAgeMs,
		state: 'loading',
		detail: null,
		updatingFor: null
	};
}

/** Nothing read yet. The first paint renders this too, so the cards hold their place (MOBILE1). */
export function initialBriefState(): BriefState {
	return {
		forecast: emptyCard(FORECAST_MAX_AGE_MS),
		observed: emptyCard(OBSERVATION_MAX_AGE_MS),
		tides: emptyCard(null),
		history: emptyCard(OBSERVATION_MAX_AGE_MS),
		stationForecast: emptyCard(FORECAST_MAX_AGE_MS),
		tideHourly: emptyCard(null)
	};
}

export function createBriefStore(
	fetchers: BriefFetchers,
	signal: AbortSignal,
	options: { deadlineMs?: number } = {}
): Readable<BriefState> & {
	load(preset: LocationPreset): Promise<void>;
	/** The desktop brief's station reads and tide curve: loaded now and on every load. */
	enableDetail(): Promise<void>;
	/** The station's reports and forecast alone (Outdoors opened): loaded now and on every load. */
	enableStation(): Promise<void>;
	/** Below desktop again: later loads skip the detail (values are kept). */
	disableDetail(): void;
} {
	const deadlineMs = options.deadlineMs ?? DEFAULT_OP_DEADLINE_MS;
	/** Every brief request: owner-linked, bounded end to end (Task 6's rule). */
	const bounded = <T>(label: string, run: (s: AbortSignal) => Promise<T>) =>
		boundedOp(label, run, { owner: signal, timeoutMs: deadlineMs });
	const state = writable<BriefState>(initialBriefState());
	let latest = 0;
	let detail = false;
	let stationAsked = false;
	let current: LocationPreset | null = null;

	function patch<T>(key: keyof BriefState, next: (card: BriefCard<T>) => BriefCard<T>) {
		if (signal.aborted) return;
		state.update((s) => ({ ...s, [key]: next(s[key] as unknown as BriefCard<T>) }));
	}

	/** One location-scoped card: latest request wins; failure keeps value and label. */
	async function loadScoped<T>(
		key: 'forecast' | 'tides' | 'tideHourly',
		requestId: number,
		place: string,
		scope: string,
		failure: string,
		run: () => Promise<T>,
		observedAtOf: (value: T) => number | null
	) {
		patch<T>(key, (c) => ({
			...c,
			updatingFor: c.value !== null && c.scope !== scope ? place : null
		}));
		try {
			const value = await run();
			if (requestId !== latest) return;
			patch<T>(key, (c) => ({
				...c,
				value,
				scope,
				observedAt: observedAtOf(value),
				state: 'ok',
				detail: null,
				updatingFor: null
			}));
		} catch {
			if (requestId !== latest) return;
			patch<T>(key, (c) => ({
				...c,
				state: c.value === null ? 'unavailable' : 'stale',
				detail: failure,
				updatingFor: null
			}));
		}
	}

	let observedRun: Promise<void> | null = null;
	/** One fixed station: overlapping loads share one request, so outcomes can't arrive out of order. */
	function loadObserved(): Promise<void> {
		observedRun ??= fetchObserved().finally(() => {
			observedRun = null;
		});
		return observedRun;
	}

	async function fetchObserved() {
		try {
			const value = await bounded('brief observation', (s) =>
				fetchers.observation(OBSERVATION_STATION, s)
			);
			// List against list: only a copy of the list older than the one already judged is
			// refused. An equal or newer list is authoritative, even when it picks an older report.
			patch<ObservedNow>('observed', (c) =>
				c.value !== null && c.value.listNewestAt > value.listNewestAt
					? c
					: {
							...c,
							value,
							scope: OBSERVATION_STATION.name,
							observedAt: value.observedAt,
							state: 'ok',
							detail: null
						}
			);
		} catch {
			patch<ObservedNow>('observed', (c) => ({
				...c,
				state: c.value === null ? 'unavailable' : 'stale',
				detail: 'Observation unavailable'
			}));
		}
	}

	/** One fixed station: overlapping loads share a request, as the observation does. */
	const stationRuns = new Map<string, Promise<void>>();
	function loadStationRead<T>(
		key: 'history' | 'stationForecast',
		failure: string,
		run: (signal: AbortSignal) => Promise<T>,
		observedAtOf: (value: T) => number | null
	): Promise<void> {
		let running = stationRuns.get(key);
		if (running) return running;
		running = (async () => {
			try {
				const value = await bounded(`brief ${key}`, run);
				patch<T>(key, (c) => ({
					...c,
					value,
					scope: OBSERVATION_STATION.name,
					observedAt: observedAtOf(value),
					state: 'ok',
					detail: null
				}));
			} catch {
				patch<T>(key, (c) => ({
					...c,
					state: c.value === null ? 'unavailable' : 'stale',
					detail: failure
				}));
			}
		})().finally(() => stationRuns.delete(key));
		stationRuns.set(key, running);
		return running;
	}

	function loadStation(): Promise<unknown> {
		const { lat, lon } = OBSERVATION_STATION;
		const history = fetchers.history;
		return Promise.all([
			history
				? loadStationRead(
						'history',
						'Temperature history unavailable',
						(s) => history(OBSERVATION_STATION, s),
						(v) => (v.length ? v[v.length - 1].atMs : null)
					)
				: undefined,
			loadStationRead(
				'stationForecast',
				"Couldn't load the Gnoss Field forecast",
				(s) => fetchers.hourly(lat, lon, s),
				(v) => v.updatedAt
			)
		]);
	}

	/** The tide curve for one location, under the same latest-request-wins rule. */
	function loadDetail(preset: LocationPreset, requestId: number): Promise<unknown> {
		const read = fetchers.tideHourly;
		return read
			? loadScoped(
					'tideHourly',
					requestId,
					preset.name,
					preset.tideStationName,
					`Couldn't load ${preset.tideStationName} hourly tides`,
					() => bounded('brief tide curve', (s) => read(preset.tideStation, s)),
					() => null
				)
			: Promise.resolve();
	}

	return {
		subscribe: state.subscribe,
		disableDetail() {
			detail = false;
		},
		async enableDetail() {
			if (detail || signal.aborted) return;
			detail = true;
			await Promise.all([current ? loadDetail(current, latest) : undefined, loadStation()]);
		},
		async enableStation() {
			if (stationAsked || signal.aborted) return;
			stationAsked = true;
			if (!detail) await loadStation();
		},
		async load(preset) {
			if (signal.aborted) return;
			const requestId = ++latest;
			current = preset;
			const forecastLabel = forecastScope(preset);
			await Promise.all([
				loadScoped(
					'forecast',
					requestId,
					preset.name,
					forecastLabel,
					`Couldn't load the ${forecastLabel}`,
					() => bounded('brief hourly', (s) => fetchers.hourly(preset.lat, preset.lon, s)),
					(v) => v.updatedAt
				),
				loadScoped(
					'tides',
					requestId,
					preset.name,
					preset.tideStationName,
					`Couldn't load ${preset.tideStationName} tides`,
					() => bounded('brief tides', (s) => fetchers.tides(preset.tideStation, s)),
					() => null
				),
				loadObserved(),
				detail ? loadDetail(preset, requestId) : undefined,
				detail || stationAsked ? loadStation() : undefined
			]);
		}
	};
}

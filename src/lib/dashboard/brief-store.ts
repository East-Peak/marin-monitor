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
import type { SourceEntryState } from './source-status';

export interface BriefFetchers {
	hourly(lat: number, lon: number, signal: AbortSignal): Promise<HourlyForecast>;
	observation(station: { id: string; name: string }, signal: AbortSignal): Promise<ObservedNow>;
	tides(stationId: string, signal: AbortSignal): Promise<TideEvent[]>;
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

export function createBriefStore(
	fetchers: BriefFetchers,
	signal: AbortSignal,
	options: { deadlineMs?: number } = {}
): Readable<BriefState> & { load(preset: LocationPreset): Promise<void> } {
	const deadlineMs = options.deadlineMs ?? DEFAULT_OP_DEADLINE_MS;
	/** Every brief request: owner-linked, bounded end to end (Task 6's rule). */
	const bounded = <T>(label: string, run: (s: AbortSignal) => Promise<T>) =>
		boundedOp(label, run, { owner: signal, timeoutMs: deadlineMs });
	const state = writable<BriefState>({
		forecast: emptyCard(FORECAST_MAX_AGE_MS),
		observed: emptyCard(OBSERVATION_MAX_AGE_MS),
		tides: emptyCard(null)
	});
	let latest = 0;

	function patch<T>(key: keyof BriefState, next: (card: BriefCard<T>) => BriefCard<T>) {
		if (signal.aborted) return;
		state.update((s) => ({ ...s, [key]: next(s[key] as unknown as BriefCard<T>) }));
	}

	/** One location-scoped card: latest request wins; failure keeps value and label. */
	async function loadScoped<T>(
		key: 'forecast' | 'tides',
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
			patch<ObservedNow>('observed', (c) =>
				c.value !== null && c.value.observedAt > value.observedAt
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

	return {
		subscribe: state.subscribe,
		async load(preset) {
			if (signal.aborted) return;
			const requestId = ++latest;
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
				loadObserved()
			]);
		}
	};
}

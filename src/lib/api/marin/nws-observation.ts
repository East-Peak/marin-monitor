/**
 * Observed "now" from one NWS station (spec §13.9: kept separate from the
 * forecast, with its station and time). Reads the station's observation list,
 * not `/observations/latest`: on 2026-10-14 KDVO's `/latest` served an
 * unprocessed copy (null, QC 'Z') in 6 of 16 polls while the list held the
 * same report QC'd. `chooseObservation` picks the report the card shows.
 */
import { liveData, serviceClient } from '$lib/services/client';
import { parseFeedDate } from '$lib/news/feed-date';
import {
	celsiusToFahrenheit,
	chooseObservation,
	type ObservedNow,
	type StationReading
} from '$lib/weather/brief';
import type { OwnerOptions } from './fetch-helpers';

/** KDVO reports every 20 min, so the 90-min bound spans ≤ 5 reports; 8 leaves room for SPECIs. */
const OBSERVATION_LIST_LIMIT = 8;
/** MADIS QC flags that disqualify a value: rejected, questioned, subjectively bad. */
const REJECTED_QC = new Set(['X', 'Q', 'B']);

interface NwsObservationList {
	features?: unknown;
}

interface NwsObservationFeature {
	properties?: {
		timestamp?: unknown;
		textDescription?: unknown;
		temperature?: { value?: unknown; qualityControl?: unknown };
	};
}

function toReading(feature: unknown): StationReading | null {
	const p = (feature as NwsObservationFeature | null)?.properties;
	const observedAt = typeof p?.timestamp === 'string' ? parseFeedDate(p.timestamp) : null;
	if (!p || observedAt === null) return null;
	const c = p.temperature?.value;
	const usable =
		typeof c === 'number' &&
		Number.isFinite(c) &&
		!REJECTED_QC.has(String(p.temperature?.qualityControl));
	return {
		observedAt,
		tempF: usable ? celsiusToFahrenheit(c) : null,
		text: typeof p.textDescription === 'string' && p.textDescription ? p.textDescription : null
	};
}

export async function fetchLatestObservation(
	station: { id: string; name: string },
	{ signal, now }: OwnerOptions & { now?: number } = {}
): Promise<ObservedNow> {
	const result = await serviceClient.request<NwsObservationList>(
		'NWS',
		`/stations/${station.id}/observations`,
		{
			accept: 'application/geo+json',
			params: { limit: OBSERVATION_LIST_LIMIT },
			signal,
			revalidateInBackground: false
		}
	);
	const features = liveData(result)?.features;
	const readings = (Array.isArray(features) ? features : [])
		.map(toReading)
		.filter((r): r is StationReading => r !== null);
	// Judge the age bound when the list arrives, not when the request left (Codex code r1 #1).
	const picked = chooseObservation(readings, now ?? Date.now());
	if (!picked) throw new Error('NWS observations missing a timestamp');
	return { stationName: station.name, ...picked.reading, listNewestAt: picked.listNewestAt };
}

/** One usable temperature report in the 12-hour trace. */
export interface TempReport {
	atMs: number;
	tempF: number;
}

/** The brief's trace window (MAPX1). KDVO's list for 12 h is ~35 reports (measured 2026-10-17). */
export const OBSERVATION_HISTORY_MS = 12 * 3_600_000;

/**
 * The station's last 12 hours, usable temperatures only, oldest first. A report
 * without one is left out, never filled: the trace shows its gap. Throws on failure.
 */
export async function fetchObservationHistoryOrThrow(
	station: { id: string; name: string },
	{ signal, now }: OwnerOptions & { now?: number } = {}
): Promise<TempReport[]> {
	const startMs = Math.floor(((now ?? Date.now()) - OBSERVATION_HISTORY_MS) / 60_000) * 60_000;
	const result = await serviceClient.request<NwsObservationList>(
		'NWS',
		`/stations/${station.id}/observations`,
		{
			accept: 'application/geo+json',
			params: { start: new Date(startMs).toISOString().replace('.000Z', 'Z') },
			signal,
			revalidateInBackground: false
		}
	);
	const features = liveData(result)?.features;
	if (!Array.isArray(features)) throw new Error('NWS observations missing a feature list');
	return features
		.map(toReading)
		.flatMap((r) => (r && r.tempF !== null ? [{ atMs: r.observedAt, tempF: r.tempF }] : []))
		.sort((a, b) => a.atMs - b.atMs);
}

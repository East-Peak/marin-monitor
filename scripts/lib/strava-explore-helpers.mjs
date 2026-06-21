/**
 * Pure, side-effect-free helpers extracted from strava-explore.mjs.
 * No fetch, no fs, no global mutation — safe to unit-test without network or disk.
 *
 * Constants needed by multiple helpers are exported so callers (including the
 * main script) can import them from a single source of truth.
 */

import path from 'node:path';

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────

export const ACTIVITY_TYPES = ['ride', 'run'];

export const TRANSIENT_RETRY_LIMIT = 6;
export const TRANSIENT_RETRY_BASE_MS = 15_000;
export const TRANSIENT_RETRY_MAX_MS = 180_000;

// ──────────────────────────────────────────────────────────────────────────────
// Argument / mode helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Validates and returns the run mode.
 * Throws for any unrecognised value.
 *
 * @param {string} value
 * @returns {'discover' | 'hybrid' | 'enrich'}
 */
export function normalizeMode(value) {
	if (value === 'discover' || value === 'hybrid' || value === 'enrich') {
		return value;
	}
	throw new Error(`Unsupported mode: ${value}`);
}

/**
 * Derives the default progress-file path from an output-file path.
 * Pure path computation — no I/O.
 *
 * @param {string} outputFile
 * @returns {string}
 */
export function defaultProgressFile(outputFile) {
	const parsed = path.parse(outputFile);
	return path.join(parsed.dir, `${parsed.name}.progress.json`);
}

/**
 * Derives the default tranche-directory path from an output-file path.
 * Pure path computation — no I/O.
 *
 * @param {string} outputFile
 * @returns {string}
 */
export function defaultTrancheDir(outputFile) {
	const parsed = path.parse(outputFile);
	return path.join(parsed.dir, `${parsed.name}.tranches`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Retry / transient-error helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Computes the delay in milliseconds before the next transient retry attempt.
 * Uses exponential backoff capped at `TRANSIENT_RETRY_MAX_MS` plus up to
 * 2 500 ms of random jitter.
 *
 * @param {number} attempt  1-based retry attempt number
 * @returns {number}
 */
export function computeTransientRetryDelayMs(attempt) {
	const backoff = Math.min(
		TRANSIENT_RETRY_MAX_MS,
		TRANSIENT_RETRY_BASE_MS * 2 ** Math.max(attempt - 1, 0)
	);
	const jitter = Math.floor(Math.random() * 2_500);
	return backoff + jitter;
}

/**
 * Returns `true` when an HTTP status code indicates a transient server-side
 * or timeout condition that is safe to retry.
 *
 * @param {number} status
 * @returns {boolean}
 */
export function isTransientHttpStatus(status) {
	return status === 408 || status === 425 || status >= 500;
}

/**
 * Returns `true` when a fetch error is network-transient and safe to retry.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
export function isTransientFetchError(error) {
	const message = `${error?.name ?? ''} ${error?.message ?? String(error ?? '')}`.toLowerCase();
	return (
		error?.name === 'AbortError' ||
		/fetch failed|econnreset|etimedout|eai_again|enotfound|socket hang up|und_err_|timeout/.test(
			message
		)
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Text / response helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Collapses whitespace in `text` and truncates it to `maxLength` characters,
 * appending `...` when truncated.  Safe for log messages.
 *
 * @param {unknown} text
 * @param {number} [maxLength=180]
 * @returns {string}
 */
export function summarizeText(text, maxLength = 180) {
	const collapsed = String(text ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	if (collapsed.length <= maxLength) return collapsed;
	return `${collapsed.slice(0, maxLength - 3)}...`;
}

/**
 * Returns `true` when the response appears to be an HTML page rather than
 * the expected JSON — based on Content-Type header and/or body preview.
 *
 * @param {unknown} contentType
 * @param {unknown} bodyText
 * @returns {boolean}
 */
export function looksLikeHtmlResponse(contentType, bodyText) {
	const normalizedType = String(contentType ?? '').toLowerCase();
	if (normalizedType.includes('text/html')) return true;

	const preview = String(bodyText ?? '').slice(0, 600);
	return /<!doctype html|<html[\s>]|<body[\s>]|<\/html>/i.test(preview);
}

// ──────────────────────────────────────────────────────────────────────────────
// Bounding-box helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Splits a `[south, west, north, east]` bounding box into four equal quadrants.
 *
 * @param {[number, number, number, number]} box
 * @returns {[number, number, number, number][]}
 */
export function splitBoundingBox([south, west, north, east]) {
	const midLat = (south + north) / 2;
	const midLng = (west + east) / 2;

	return [
		[south, west, midLat, midLng],
		[south, midLng, midLat, east],
		[midLat, west, north, midLng],
		[midLat, midLng, north, east]
	];
}

/**
 * Formats a bounding box as a comma-separated string of 5-decimal values
 * suitable for Strava API `bounds` parameters.
 *
 * @param {number[]} box
 * @returns {string}
 */
export function formatBox(box) {
	return box.map((value) => value.toFixed(5)).join(',');
}

// ──────────────────────────────────────────────────────────────────────────────
// Quality / scoring helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns the list of quality criteria that a fully-enriched segment satisfies.
 *
 * @param {{ distance: number; elevationGain: number; totalAttempts: number; totalAthletes: number }} segment
 * @param {{ minDistance: number; minElevationGain: number; minAttempts: number; minAthletes: number }} rules
 * @returns {string[]}
 */
export function qualityReasons(segment, rules) {
	const reasons = [];
	if (segment.distance >= rules.minDistance) reasons.push('distance');
	if (segment.elevationGain >= rules.minElevationGain) reasons.push('elevation');
	if (segment.totalAttempts >= rules.minAttempts) reasons.push('attempts');
	if (segment.totalAthletes >= rules.minAthletes) reasons.push('athletes');
	return reasons;
}

/**
 * Computes a quality score for a fully-enriched segment.
 * Higher scores indicate more popular or challenging segments.
 *
 * @param {{ distance: number; elevationGain: number; totalAttempts: number; totalAthletes: number; climbCategory: number }} segment
 * @returns {number}
 */
export function qualityScore(segment) {
	const distanceKm = segment.distance / 1000;
	return Math.round(
		distanceKm * 14 +
			segment.elevationGain * 0.18 +
			segment.totalAttempts * 0.03 +
			segment.totalAthletes * 0.75 +
			segment.climbCategory * 10
	);
}

/**
 * Returns the list of preview-quality indicators for a discovery candidate
 * (before full enrichment).
 *
 * @param {{ distance: number; elevDifference: number; discoveryHits: number; climbCategory: number }} candidate
 * @returns {string[]}
 */
export function previewReasons(candidate) {
	const reasons = [];
	if (candidate.distance >= 1200) reasons.push('distance');
	if (candidate.elevDifference >= 40) reasons.push('elevation');
	if (candidate.discoveryHits >= 2) reasons.push('repeat-discovery');
	if (candidate.climbCategory >= 1) reasons.push('climb');
	return reasons;
}

/**
 * Computes a preview score for a discovery candidate.
 *
 * @param {{ distance: number; elevDifference: number; avgGrade: number; climbCategory: number; discoveryHits: number }} candidate
 * @returns {number}
 */
export function previewScore(candidate) {
	const distanceKm = candidate.distance / 1000;
	return Math.round(
		distanceKm * 12 +
			candidate.elevDifference * 0.2 +
			Math.abs(candidate.avgGrade) * 2.5 +
			candidate.climbCategory * 12 +
			candidate.discoveryHits * 6
	);
}

// ──────────────────────────────────────────────────────────────────────────────
// Serialization helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Converts `Infinity` to `null` for JSON serialisation; passes finite numbers
 * through unchanged.
 *
 * @param {number} value
 * @returns {number | null}
 */
export function serializeLimit(value) {
	return Number.isFinite(value) ? value : null;
}

/**
 * Returns a JSON-safe representation of the run options, replacing any
 * `Infinity` limits with `null`.
 *
 * @param {{ mode: string; maxDepth: number; minRequestGapMs: number; tileLimit: number; segmentLimit: number; maxRequests: number; dailyHeadroom: number; tileCheckpointEvery: number; segmentCheckpointEvery: number }} options
 * @returns {object}
 */
export function serializeOptions(options) {
	return {
		mode: options.mode,
		maxDepth: options.maxDepth,
		minRequestGapMs: options.minRequestGapMs,
		tileLimit: serializeLimit(options.tileLimit),
		segmentLimit: serializeLimit(options.segmentLimit),
		maxRequests: serializeLimit(options.maxRequests),
		dailyHeadroom: options.dailyHeadroom,
		tileCheckpointEvery: options.tileCheckpointEvery,
		segmentCheckpointEvery: options.segmentCheckpointEvery
	};
}

// ──────────────────────────────────────────────────────────────────────────────
// Lat/lng + bounding-box normalisation
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Normalises a `[lat, lng]` pair from an API response to `[number, number]`.
 * Returns `[0, 0]` for any non-array or wrong-length input.
 *
 * @param {unknown} value
 * @returns {[number, number]}
 */
export function normalizeLatlng(value) {
	if (!Array.isArray(value) || value.length !== 2) return [0, 0];
	return value.map((part) => Number(part ?? 0));
}

/**
 * Normalises a `[south, west, north, east]` bounding box, coercing each
 * element to a number.  Returns `[0, 0, 0, 0]` for invalid input.
 *
 * @param {unknown} box
 * @returns {[number, number, number, number]}
 */
export function normalizeBox(box) {
	return Array.isArray(box) && box.length === 4 ? box.map((value) => Number(value)) : [0, 0, 0, 0];
}

// ──────────────────────────────────────────────────────────────────────────────
// Candidate record helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Fills in / normalises all derived fields on a candidate record (preview
 * score, preview reasons, latlng arrays, etc.).  Safe to call on partially-
 * hydrated records loaded from disk.
 *
 * @param {object} candidate
 * @returns {object}
 */
export function applyCandidateDerivedFields(candidate) {
	const normalized = {
		id: Number(candidate.id),
		name: candidate.name ?? 'Unnamed segment',
		activityType: candidate.activityType === 'run' ? 'run' : 'ride',
		startLatlng: normalizeLatlng(candidate.startLatlng ?? candidate.start_latlng),
		endLatlng: normalizeLatlng(candidate.endLatlng ?? candidate.end_latlng),
		distance: Number(candidate.distance ?? 0),
		elevDifference: Number(candidate.elevDifference ?? candidate.elev_difference ?? 0),
		avgGrade: Number(candidate.avgGrade ?? candidate.avg_grade ?? 0),
		climbCategory: Number(candidate.climbCategory ?? candidate.climb_category ?? 0),
		polyline: candidate.polyline ?? candidate.points ?? null,
		discoveryHits: Number(candidate.discoveryHits ?? 1),
		discoveredFrom: Array.isArray(candidate.discoveredFrom)
			? candidate.discoveredFrom.map((entry) => ({
					activityType: entry.activityType === 'run' ? 'run' : 'ride',
					bounds: normalizeBox(entry.bounds),
					depth: Number.parseInt(entry.depth ?? 0, 10) || 0
				}))
			: []
	};

	return {
		...normalized,
		previewReasons: previewReasons(normalized),
		previewScore: previewScore(normalized)
	};
}

/**
 * Sorts candidates by preview score (desc), discovery hits (desc), then
 * distance (desc).  Returns a new array; does not mutate the input.
 *
 * @param {object[]} candidates
 * @returns {object[]}
 */
export function sortCandidates(candidates) {
	return [...candidates]
		.map((candidate) => applyCandidateDerivedFields(candidate))
		.sort(
			(a, b) =>
				b.previewScore - a.previewScore ||
				b.discoveryHits - a.discoveryHits ||
				b.distance - a.distance
		);
}

/**
 * Builds a fresh candidate record from a raw Strava explore-API segment
 * response.
 *
 * @param {object} segment  Raw segment from the Strava explore endpoint
 * @param {string} activityType  'ride' | 'run'
 * @param {number[]} box  Bounding box the segment was found in
 * @param {number} depth  Tile-split depth at which the segment was found
 * @returns {object}
 */
export function buildCandidateRecord(segment, activityType, box, depth) {
	return applyCandidateDerivedFields({
		id: segment.id,
		name: segment.name,
		activityType,
		startLatlng: normalizeLatlng(segment.start_latlng),
		endLatlng: normalizeLatlng(segment.end_latlng),
		distance: Number(segment.distance ?? 0),
		elevDifference: Number(segment.elev_difference ?? 0),
		avgGrade: Number(segment.avg_grade ?? 0),
		climbCategory: Number(segment.climb_category ?? 0),
		polyline: segment.points ?? null,
		discoveryHits: 1,
		discoveredFrom: [
			{
				activityType,
				bounds: normalizeBox(box),
				depth
			}
		]
	});
}

// ──────────────────────────────────────────────────────────────────────────────
// Discovery-state helpers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns a deep clone of the pending-discovery queues, normalising each
 * entry's `box` and `depth` fields.
 *
 * @param {Record<string, Array<{ box: unknown; depth: unknown }>>} pendingQueues
 * @returns {Record<string, Array<{ box: number[]; depth: number }>>}
 */
export function clonePendingQueues(pendingQueues) {
	return Object.fromEntries(
		ACTIVITY_TYPES.map((activityType) => [
			activityType,
			Array.isArray(pendingQueues?.[activityType])
				? pendingQueues[activityType].map((entry) => ({
						box: normalizeBox(entry.box),
						depth: Number.parseInt(entry.depth ?? 0, 10) || 0
					}))
				: []
		])
	);
}

/**
 * Returns `true` when every activity-type queue has been drained.
 *
 * @param {Record<string, unknown[]>} pendingQueues
 * @returns {boolean}
 */
export function discoveryComplete(pendingQueues) {
	return ACTIVITY_TYPES.every((activityType) => (pendingQueues[activityType] ?? []).length === 0);
}

/**
 * Returns the total number of tiles still waiting to be explored across all
 * activity types.
 *
 * @param {Record<string, unknown[]>} pendingQueues
 * @returns {number}
 */
export function pendingDiscoveryTileCount(pendingQueues) {
	return ACTIVITY_TYPES.reduce(
		(total, activityType) => total + (pendingQueues[activityType] ?? []).length,
		0
	);
}

/**
 * Builds the `discoveryState` object that is embedded in every output/progress
 * file.
 *
 * @param {Record<string, Array<{ box: unknown; depth: unknown }>>} pendingQueues
 * @returns {{ complete: boolean; pendingTileCount: number; pendingQueues: object }}
 */
export function buildDiscoveryState(pendingQueues) {
	return {
		complete: discoveryComplete(pendingQueues),
		pendingTileCount: pendingDiscoveryTileCount(pendingQueues),
		pendingQueues: clonePendingQueues(pendingQueues)
	};
}

/**
 * Builds the `summary` object that is embedded in every output/progress file.
 *
 * @param {object[]} candidates
 * @param {object[]} segments
 * @param {number} exploredTiles
 * @param {Record<string, unknown[]>} pendingQueues
 * @param {{ newTilesThisRun: number; newSegmentsThisRun: number }} runStats
 * @returns {object}
 */
export function buildSummary(candidates, segments, exploredTiles, pendingQueues, runStats) {
	return {
		discoveredIds: candidates.length,
		exploredTiles,
		enrichedSegments: segments.length,
		remainingCandidates: Math.max(candidates.length - segments.length, 0),
		pendingDiscoveryTiles: pendingDiscoveryTileCount(pendingQueues),
		newTilesThisRun: runStats.newTilesThisRun,
		newSegmentsThisRun: runStats.newSegmentsThisRun,
		qualifiedRideSegments: segments.filter(
			(segment) => segment.activityType === 'ride' && segment.passesThresholds
		).length,
		qualifiedRunSegments: segments.filter(
			(segment) => segment.activityType === 'run' && segment.passesThresholds
		).length
	};
}

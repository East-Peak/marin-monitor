/**
 * Unit tests for scripts/lib/strava-explore-helpers.mjs.
 *
 * These helpers are pure/synchronous — no network, no fs, no mocks needed.
 */

import { describe, expect, it } from 'vitest';
import {
	ACTIVITY_TYPES,
	TRANSIENT_RETRY_BASE_MS,
	TRANSIENT_RETRY_MAX_MS,
	applyCandidateDerivedFields,
	buildCandidateRecord,
	buildDiscoveryState,
	buildSummary,
	clonePendingQueues,
	computeTransientRetryDelayMs,
	defaultProgressFile,
	defaultTrancheDir,
	discoveryComplete,
	formatBox,
	isTransientFetchError,
	isTransientHttpStatus,
	looksLikeHtmlResponse,
	normalizeBox,
	normalizeLatlng,
	normalizeMode,
	pendingDiscoveryTileCount,
	previewReasons,
	previewScore,
	qualityReasons,
	qualityScore,
	serializeLimit,
	serializeOptions,
	sortCandidates,
	splitBoundingBox,
	summarizeText
} from '../../../scripts/lib/strava-explore-helpers.mjs';

// ──────────────────────────────────────────────────────────────────────────────
// ACTIVITY_TYPES constant
// ──────────────────────────────────────────────────────────────────────────────
describe('ACTIVITY_TYPES', () => {
	it('contains ride and run', () => {
		expect(ACTIVITY_TYPES).toContain('ride');
		expect(ACTIVITY_TYPES).toContain('run');
		expect(ACTIVITY_TYPES).toHaveLength(2);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// normalizeMode
// ──────────────────────────────────────────────────────────────────────────────
describe('normalizeMode', () => {
	it('accepts "discover"', () => {
		expect(normalizeMode('discover')).toBe('discover');
	});

	it('accepts "hybrid"', () => {
		expect(normalizeMode('hybrid')).toBe('hybrid');
	});

	it('accepts "enrich"', () => {
		expect(normalizeMode('enrich')).toBe('enrich');
	});

	it('throws for unknown mode', () => {
		expect(() => normalizeMode('invalid')).toThrow('Unsupported mode: invalid');
	});

	it('throws for empty string', () => {
		expect(() => normalizeMode('')).toThrow('Unsupported mode:');
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// defaultProgressFile
// ──────────────────────────────────────────────────────────────────────────────
describe('defaultProgressFile', () => {
	it('adds .progress.json suffix to a path', () => {
		const result = defaultProgressFile('/data/strava-explore.generated.json');
		expect(result).toBe('/data/strava-explore.generated.progress.json');
	});

	it('preserves the directory part of the path', () => {
		const result = defaultProgressFile('/some/dir/output.json');
		expect(result).toMatch(/^\/some\/dir\//);
	});

	it('works with a simple filename', () => {
		const result = defaultProgressFile('output.json');
		expect(result).toBe('output.progress.json');
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// defaultTrancheDir
// ──────────────────────────────────────────────────────────────────────────────
describe('defaultTrancheDir', () => {
	it('adds .tranches suffix to the stem', () => {
		const result = defaultTrancheDir('/data/strava-explore.generated.json');
		expect(result).toBe('/data/strava-explore.generated.tranches');
	});

	it('preserves the directory part of the path', () => {
		const result = defaultTrancheDir('/some/dir/output.json');
		expect(result).toMatch(/^\/some\/dir\//);
	});

	it('strips .json extension when building directory name', () => {
		const result = defaultTrancheDir('output.json');
		expect(result).toBe('output.tranches');
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// computeTransientRetryDelayMs
// ──────────────────────────────────────────────────────────────────────────────
describe('computeTransientRetryDelayMs', () => {
	it('returns at least TRANSIENT_RETRY_BASE_MS for attempt 1', () => {
		const delay = computeTransientRetryDelayMs(1);
		// base + jitter (0–2499)
		expect(delay).toBeGreaterThanOrEqual(TRANSIENT_RETRY_BASE_MS);
		expect(delay).toBeLessThanOrEqual(TRANSIENT_RETRY_BASE_MS + 2_500);
	});

	it('doubles for attempt 2', () => {
		const delay = computeTransientRetryDelayMs(2);
		const expected = TRANSIENT_RETRY_BASE_MS * 2;
		expect(delay).toBeGreaterThanOrEqual(expected);
		expect(delay).toBeLessThanOrEqual(expected + 2_500);
	});

	it('caps at TRANSIENT_RETRY_MAX_MS plus jitter', () => {
		// attempt 10 → base * 2^9 which is well above max
		const delay = computeTransientRetryDelayMs(10);
		expect(delay).toBeLessThanOrEqual(TRANSIENT_RETRY_MAX_MS + 2_500);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// isTransientHttpStatus
// ──────────────────────────────────────────────────────────────────────────────
describe('isTransientHttpStatus', () => {
	it('returns true for 408 (request timeout)', () => {
		expect(isTransientHttpStatus(408)).toBe(true);
	});

	it('returns true for 425 (too early)', () => {
		expect(isTransientHttpStatus(425)).toBe(true);
	});

	it('returns true for 500 and above', () => {
		expect(isTransientHttpStatus(500)).toBe(true);
		expect(isTransientHttpStatus(503)).toBe(true);
		expect(isTransientHttpStatus(599)).toBe(true);
	});

	it('returns false for 200, 400, 401, 403, 404, 429', () => {
		for (const status of [200, 400, 401, 403, 404, 429]) {
			expect(isTransientHttpStatus(status)).toBe(false);
		}
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// isTransientFetchError
// ──────────────────────────────────────────────────────────────────────────────
describe('isTransientFetchError', () => {
	it('returns true for AbortError', () => {
		const err = new Error('aborted');
		err.name = 'AbortError';
		expect(isTransientFetchError(err)).toBe(true);
	});

	it('returns true for "fetch failed" message', () => {
		expect(isTransientFetchError(new Error('fetch failed'))).toBe(true);
	});

	it('returns true for ECONNRESET', () => {
		expect(isTransientFetchError(new Error('ECONNRESET'))).toBe(true);
	});

	it('returns true for ETIMEDOUT', () => {
		expect(isTransientFetchError(new Error('ETIMEDOUT'))).toBe(true);
	});

	it('returns true for socket hang up', () => {
		expect(isTransientFetchError(new Error('socket hang up'))).toBe(true);
	});

	it('returns false for a regular TypeError', () => {
		expect(isTransientFetchError(new TypeError('invalid json'))).toBe(false);
	});

	it('returns false for null/undefined', () => {
		expect(isTransientFetchError(null)).toBe(false);
		expect(isTransientFetchError(undefined)).toBe(false);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// summarizeText
// ──────────────────────────────────────────────────────────────────────────────
describe('summarizeText', () => {
	it('returns text unchanged when under maxLength', () => {
		expect(summarizeText('hello world')).toBe('hello world');
	});

	it('collapses whitespace', () => {
		expect(summarizeText('  a   b  ')).toBe('a b');
	});

	it('truncates long text with ellipsis', () => {
		const long = 'x'.repeat(200);
		const result = summarizeText(long, 180);
		expect(result.endsWith('...')).toBe(true);
		expect(result.length).toBe(180);
	});

	it('handles null and undefined gracefully', () => {
		expect(summarizeText(null)).toBe('');
		expect(summarizeText(undefined)).toBe('');
	});

	it('uses default maxLength of 180', () => {
		const long = 'y'.repeat(200);
		const result = summarizeText(long);
		expect(result.length).toBe(180);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// looksLikeHtmlResponse
// ──────────────────────────────────────────────────────────────────────────────
describe('looksLikeHtmlResponse', () => {
	it('returns true when content-type is text/html', () => {
		expect(looksLikeHtmlResponse('text/html; charset=utf-8', '')).toBe(true);
	});

	it('returns true when body starts with <!doctype html>', () => {
		expect(looksLikeHtmlResponse('application/json', '<!doctype html><html>')).toBe(true);
	});

	it('returns true when body contains <html>', () => {
		expect(looksLikeHtmlResponse(null, '<html lang="en"><body>')).toBe(true);
	});

	it('returns false for a JSON content-type and JSON body', () => {
		expect(looksLikeHtmlResponse('application/json', '{"foo":1}')).toBe(false);
	});

	it('handles null/undefined gracefully', () => {
		expect(looksLikeHtmlResponse(null, null)).toBe(false);
		expect(looksLikeHtmlResponse(undefined, undefined)).toBe(false);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// splitBoundingBox
// ──────────────────────────────────────────────────────────────────────────────
describe('splitBoundingBox', () => {
	it('returns four quadrants', () => {
		const box: [number, number, number, number] = [0, 0, 2, 2];
		const result = splitBoundingBox(box);
		expect(result).toHaveLength(4);
	});

	it('quadrants have correct midpoints', () => {
		const box: [number, number, number, number] = [0, 0, 2, 2];
		const [sw, se, nw, ne] = splitBoundingBox(box);
		// SW quadrant: [0,0,1,1]
		expect(sw).toEqual([0, 0, 1, 1]);
		// SE quadrant: [0,1,1,2]
		expect(se).toEqual([0, 1, 1, 2]);
		// NW quadrant: [1,0,2,1]
		expect(nw).toEqual([1, 0, 2, 1]);
		// NE quadrant: [1,1,2,2]
		expect(ne).toEqual([1, 1, 2, 2]);
	});

	it('quadrant areas sum to original area', () => {
		const box: [number, number, number, number] = [37.83, -122.75, 37.94, -122.48];
		const result = splitBoundingBox(box);
		const totalHeight = result.reduce((sum, q) => sum + (q[2] - q[0]), 0);
		// Each quadrant covers half the lat range; two quadrants per row
		// Effectively, split into 4 equal quads — combined lat span = full span
		expect(totalHeight).toBeCloseTo((37.94 - 37.83) * 2, 5);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// formatBox
// ──────────────────────────────────────────────────────────────────────────────
describe('formatBox', () => {
	it('formats a box as comma-separated 5-decimal values', () => {
		expect(formatBox([37.83, -122.75, 37.94, -122.48])).toBe('37.83000,-122.75000,37.94000,-122.48000');
	});

	it('rounds to 5 decimal places', () => {
		const result = formatBox([1.123456789, 2.000001]);
		expect(result).toBe('1.12346,2.00000');
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// qualityReasons
// ──────────────────────────────────────────────────────────────────────────────
describe('qualityReasons', () => {
	const rules = { minDistance: 1200, minElevationGain: 40, minAttempts: 150, minAthletes: 40 };

	it('returns all reasons when segment exceeds all thresholds', () => {
		const segment = {
			distance: 2000,
			elevationGain: 100,
			totalAttempts: 200,
			totalAthletes: 60,
			climbCategory: 0
		};
		const reasons = qualityReasons(segment, rules);
		expect(reasons).toContain('distance');
		expect(reasons).toContain('elevation');
		expect(reasons).toContain('attempts');
		expect(reasons).toContain('athletes');
		expect(reasons).toHaveLength(4);
	});

	it('returns empty array when segment meets no thresholds', () => {
		const segment = {
			distance: 100,
			elevationGain: 5,
			totalAttempts: 10,
			totalAthletes: 2,
			climbCategory: 0
		};
		expect(qualityReasons(segment, rules)).toEqual([]);
	});

	it('returns only matching reasons for partial pass', () => {
		const segment = {
			distance: 1500,
			elevationGain: 5,
			totalAttempts: 10,
			totalAthletes: 2,
			climbCategory: 0
		};
		const reasons = qualityReasons(segment, rules);
		expect(reasons).toEqual(['distance']);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// qualityScore
// ──────────────────────────────────────────────────────────────────────────────
describe('qualityScore', () => {
	it('returns a non-negative integer', () => {
		const segment = {
			distance: 5000,
			elevationGain: 200,
			totalAttempts: 500,
			totalAthletes: 100,
			climbCategory: 2
		};
		const score = qualityScore(segment);
		expect(score).toBeGreaterThan(0);
		expect(Number.isInteger(score)).toBe(true);
	});

	it('returns 0 for a zero-everything segment', () => {
		const segment = {
			distance: 0,
			elevationGain: 0,
			totalAttempts: 0,
			totalAthletes: 0,
			climbCategory: 0
		};
		expect(qualityScore(segment)).toBe(0);
	});

	it('scores higher for longer segments', () => {
		const base = { distance: 1000, elevationGain: 50, totalAttempts: 100, totalAthletes: 30, climbCategory: 0 };
		const longer = { ...base, distance: 5000 };
		expect(qualityScore(longer)).toBeGreaterThan(qualityScore(base));
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// previewReasons
// ──────────────────────────────────────────────────────────────────────────────
describe('previewReasons', () => {
	it('returns all preview reasons when candidate exceeds all thresholds', () => {
		const candidate = { distance: 2000, elevDifference: 50, discoveryHits: 3, climbCategory: 2, avgGrade: 5 };
		const reasons = previewReasons(candidate);
		expect(reasons).toContain('distance');
		expect(reasons).toContain('elevation');
		expect(reasons).toContain('repeat-discovery');
		expect(reasons).toContain('climb');
		expect(reasons).toHaveLength(4);
	});

	it('returns empty array for a minimal candidate', () => {
		const candidate = { distance: 100, elevDifference: 5, discoveryHits: 1, climbCategory: 0, avgGrade: 0 };
		expect(previewReasons(candidate)).toEqual([]);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// previewScore
// ──────────────────────────────────────────────────────────────────────────────
describe('previewScore', () => {
	it('returns a non-negative integer', () => {
		const candidate = {
			distance: 5000,
			elevDifference: 200,
			avgGrade: 8.5,
			climbCategory: 2,
			discoveryHits: 3
		};
		const score = previewScore(candidate);
		expect(score).toBeGreaterThan(0);
		expect(Number.isInteger(score)).toBe(true);
	});

	it('returns 0 for a zero-everything candidate', () => {
		const candidate = { distance: 0, elevDifference: 0, avgGrade: 0, climbCategory: 0, discoveryHits: 0 };
		expect(previewScore(candidate)).toBe(0);
	});

	it('accounts for negative avgGrade via Math.abs', () => {
		const up = { distance: 1000, elevDifference: 100, avgGrade: 10, climbCategory: 1, discoveryHits: 1 };
		const down = { ...up, avgGrade: -10 };
		expect(previewScore(up)).toBe(previewScore(down));
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// serializeLimit
// ──────────────────────────────────────────────────────────────────────────────
describe('serializeLimit', () => {
	it('returns finite numbers unchanged', () => {
		expect(serializeLimit(10)).toBe(10);
		expect(serializeLimit(0)).toBe(0);
	});

	it('converts Infinity to null', () => {
		expect(serializeLimit(Infinity)).toBeNull();
	});

	it('converts -Infinity to null', () => {
		expect(serializeLimit(-Infinity)).toBeNull();
	});

	it('converts NaN to null', () => {
		expect(serializeLimit(NaN)).toBeNull();
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// serializeOptions
// ──────────────────────────────────────────────────────────────────────────────
describe('serializeOptions', () => {
	const opts = {
		mode: 'hybrid',
		maxDepth: 3,
		minRequestGapMs: 10_000,
		tileLimit: Infinity,
		segmentLimit: 50,
		maxRequests: Infinity,
		dailyHeadroom: 25,
		tileCheckpointEvery: 5,
		segmentCheckpointEvery: 10
	};

	it('converts Infinity limits to null', () => {
		const result = serializeOptions(opts) as Record<string, unknown>;
		expect(result.tileLimit).toBeNull();
		expect(result.maxRequests).toBeNull();
	});

	it('preserves finite limits', () => {
		const result = serializeOptions(opts) as Record<string, unknown>;
		expect(result.segmentLimit).toBe(50);
	});

	it('includes all expected keys', () => {
		const result = serializeOptions(opts) as Record<string, unknown>;
		for (const key of ['mode', 'maxDepth', 'minRequestGapMs', 'tileLimit', 'segmentLimit', 'maxRequests', 'dailyHeadroom', 'tileCheckpointEvery', 'segmentCheckpointEvery']) {
			expect(key in result).toBe(true);
		}
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// normalizeLatlng
// ──────────────────────────────────────────────────────────────────────────────
describe('normalizeLatlng', () => {
	it('returns [lat, lng] for a valid pair', () => {
		expect(normalizeLatlng([37.9, -122.5])).toEqual([37.9, -122.5]);
	});

	it('coerces string values to numbers', () => {
		expect(normalizeLatlng(['37.9', '-122.5'])).toEqual([37.9, -122.5]);
	});

	it('returns [0, 0] for null', () => {
		expect(normalizeLatlng(null)).toEqual([0, 0]);
	});

	it('returns [0, 0] for an empty array', () => {
		expect(normalizeLatlng([])).toEqual([0, 0]);
	});

	it('returns [0, 0] for an array with wrong length', () => {
		expect(normalizeLatlng([1])).toEqual([0, 0]);
		expect(normalizeLatlng([1, 2, 3])).toEqual([0, 0]);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// normalizeBox
// ──────────────────────────────────────────────────────────────────────────────
describe('normalizeBox', () => {
	it('returns numeric values for a valid box', () => {
		expect(normalizeBox([37.83, -122.75, 37.94, -122.48])).toEqual([37.83, -122.75, 37.94, -122.48]);
	});

	it('coerces string values to numbers', () => {
		expect(normalizeBox(['37.83', '-122.75', '37.94', '-122.48'])).toEqual([37.83, -122.75, 37.94, -122.48]);
	});

	it('returns [0,0,0,0] for null', () => {
		expect(normalizeBox(null)).toEqual([0, 0, 0, 0]);
	});

	it('returns [0,0,0,0] for wrong-length array', () => {
		expect(normalizeBox([1, 2, 3])).toEqual([0, 0, 0, 0]);
		expect(normalizeBox([1, 2, 3, 4, 5])).toEqual([0, 0, 0, 0]);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// applyCandidateDerivedFields
// ──────────────────────────────────────────────────────────────────────────────
describe('applyCandidateDerivedFields', () => {
	const base = {
		id: 12345,
		name: 'Pantoll to Rock Spring',
		activityType: 'ride',
		startLatlng: [37.9, -122.5],
		endLatlng: [37.92, -122.52],
		distance: 5000,
		elevDifference: 200,
		avgGrade: 4.5,
		climbCategory: 1,
		polyline: 'encodedpoly',
		discoveryHits: 2,
		discoveredFrom: [{ activityType: 'ride', bounds: [37.83, -122.75, 37.94, -122.48], depth: 0 }]
	};

	it('returns a record with previewScore and previewReasons', () => {
		const result = applyCandidateDerivedFields(base) as Record<string, unknown>;
		expect(typeof result.previewScore).toBe('number');
		expect(Array.isArray(result.previewReasons)).toBe(true);
	});

	it('normalises id to a number', () => {
		const result = applyCandidateDerivedFields({ ...base, id: '99' }) as Record<string, unknown>;
		expect(result.id).toBe(99);
	});

	it('defaults name to "Unnamed segment" when missing', () => {
		const result = applyCandidateDerivedFields({ ...base, name: undefined }) as Record<string, unknown>;
		expect(result.name).toBe('Unnamed segment');
	});

	it('defaults activityType to "ride" for unknown values', () => {
		const result = applyCandidateDerivedFields({ ...base, activityType: 'swim' }) as Record<string, unknown>;
		expect(result.activityType).toBe('ride');
	});

	it('sets activityType to "run" when provided', () => {
		const result = applyCandidateDerivedFields({ ...base, activityType: 'run' }) as Record<string, unknown>;
		expect(result.activityType).toBe('run');
	});

	it('defaults discoveredFrom to [] when missing', () => {
		const result = applyCandidateDerivedFields({ ...base, discoveredFrom: undefined }) as Record<string, unknown>;
		expect(result.discoveredFrom).toEqual([]);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// sortCandidates
// ──────────────────────────────────────────────────────────────────────────────
describe('sortCandidates', () => {
	it('returns a new array (does not mutate input)', () => {
		const input = [
			{ id: 1, name: 'A', activityType: 'ride', distance: 1000, elevDifference: 50, avgGrade: 2, climbCategory: 0, discoveryHits: 1, discoveredFrom: [] },
			{ id: 2, name: 'B', activityType: 'ride', distance: 5000, elevDifference: 200, avgGrade: 5, climbCategory: 1, discoveryHits: 3, discoveredFrom: [] }
		];
		const result = sortCandidates(input);
		expect(result).not.toBe(input);
	});

	it('sorts by previewScore descending', () => {
		const low = { id: 1, name: 'Low', activityType: 'ride', distance: 500, elevDifference: 10, avgGrade: 1, climbCategory: 0, discoveryHits: 1, discoveredFrom: [] };
		const high = { id: 2, name: 'High', activityType: 'ride', distance: 10000, elevDifference: 500, avgGrade: 10, climbCategory: 3, discoveryHits: 5, discoveredFrom: [] };
		const result = sortCandidates([low, high]) as Array<Record<string, unknown>>;
		expect((result[0] as Record<string, unknown>).id).toBe(2);
	});

	it('returns empty array for empty input', () => {
		expect(sortCandidates([])).toEqual([]);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// buildCandidateRecord
// ──────────────────────────────────────────────────────────────────────────────
describe('buildCandidateRecord', () => {
	const rawSegment = {
		id: 999,
		name: 'Marin Ave Climb',
		start_latlng: [37.88, -122.25],
		end_latlng: [37.9, -122.24],
		distance: 3000,
		elev_difference: 150,
		avg_grade: 6.5,
		climb_category: 2,
		points: 'polylinestring'
	};

	it('builds a candidate with correct shape', () => {
		const record = buildCandidateRecord(rawSegment, 'ride', [37.83, -122.75, 37.94, -122.48], 0) as Record<string, unknown>;
		expect(record.id).toBe(999);
		expect(record.name).toBe('Marin Ave Climb');
		expect(record.activityType).toBe('ride');
		expect(record.discoveryHits).toBe(1);
	});

	it('sets discoveredFrom with the provided box and depth', () => {
		const box = [37.83, -122.75, 37.94, -122.48];
		const record = buildCandidateRecord(rawSegment, 'run', box, 2) as Record<string, unknown>;
		const from = record.discoveredFrom as Array<Record<string, unknown>>;
		expect(from).toHaveLength(1);
		expect(from[0].activityType).toBe('run');
		expect(from[0].depth).toBe(2);
	});

	it('includes previewScore and previewReasons', () => {
		const record = buildCandidateRecord(rawSegment, 'ride', [37.83, -122.75, 37.94, -122.48], 0) as Record<string, unknown>;
		expect(typeof record.previewScore).toBe('number');
		expect(Array.isArray(record.previewReasons)).toBe(true);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// discoveryComplete
// ──────────────────────────────────────────────────────────────────────────────
describe('discoveryComplete', () => {
	it('returns true when all queues are empty', () => {
		expect(discoveryComplete({ ride: [], run: [] })).toBe(true);
	});

	it('returns false when any queue has entries', () => {
		expect(discoveryComplete({ ride: [{ box: [0,0,1,1], depth: 0 }], run: [] })).toBe(false);
	});

	it('returns false when both queues have entries', () => {
		const q = { box: [0,0,1,1], depth: 0 };
		expect(discoveryComplete({ ride: [q], run: [q] })).toBe(false);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// pendingDiscoveryTileCount
// ──────────────────────────────────────────────────────────────────────────────
describe('pendingDiscoveryTileCount', () => {
	it('returns 0 for empty queues', () => {
		expect(pendingDiscoveryTileCount({ ride: [], run: [] })).toBe(0);
	});

	it('sums tiles across all activity types', () => {
		const q = { box: [0,0,1,1], depth: 0 };
		expect(pendingDiscoveryTileCount({ ride: [q, q], run: [q] })).toBe(3);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// clonePendingQueues
// ──────────────────────────────────────────────────────────────────────────────
describe('clonePendingQueues', () => {
	it('returns a deep clone (not the same reference)', () => {
		const original = { ride: [{ box: [0,0,1,1], depth: 0 }], run: [] };
		const clone = clonePendingQueues(original);
		expect(clone).not.toBe(original);
		expect(clone.ride).not.toBe(original.ride);
	});

	it('normalises box values to numbers', () => {
		const input = { ride: [{ box: ['37.83', '-122.75', '37.94', '-122.48'], depth: '1' }], run: [] };
		const clone = clonePendingQueues(input);
		expect(clone.ride[0].box).toEqual([37.83, -122.75, 37.94, -122.48]);
		expect(clone.ride[0].depth).toBe(1);
	});

	it('returns empty arrays for missing or null activity type entries', () => {
		// Cast as any to simulate corrupt/missing runtime data
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const clone = clonePendingQueues({ ride: null as any, run: undefined as any });
		expect(clone.ride).toEqual([]);
		expect(clone.run).toEqual([]);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// buildDiscoveryState
// ──────────────────────────────────────────────────────────────────────────────
describe('buildDiscoveryState', () => {
	it('returns complete=true and pendingTileCount=0 for empty queues', () => {
		const state = buildDiscoveryState({ ride: [], run: [] });
		expect(state.complete).toBe(true);
		expect(state.pendingTileCount).toBe(0);
	});

	it('returns complete=false when queues have entries', () => {
		const queues = { ride: [{ box: [0,0,1,1], depth: 0 }], run: [] };
		const state = buildDiscoveryState(queues);
		expect(state.complete).toBe(false);
		expect(state.pendingTileCount).toBe(1);
	});

	it('includes a cloned pendingQueues object', () => {
		const queues = { ride: [], run: [] };
		const state = buildDiscoveryState(queues);
		expect(state.pendingQueues).toBeDefined();
		expect(state.pendingQueues).not.toBe(queues);
	});
});

// ──────────────────────────────────────────────────────────────────────────────
// buildSummary
// ──────────────────────────────────────────────────────────────────────────────
describe('buildSummary', () => {
	const runStats = { newTilesThisRun: 10, newSegmentsThisRun: 5 };
	const queues = { ride: [], run: [] };

	it('returns correct counts', () => {
		const candidates = [{ id: 1 }, { id: 2 }];
		const segments = [{ id: 1, activityType: 'ride', passesThresholds: true }];
		const summary = buildSummary(candidates, segments, 20, queues, runStats) as Record<string, unknown>;

		expect(summary.discoveredIds).toBe(2);
		expect(summary.exploredTiles).toBe(20);
		expect(summary.enrichedSegments).toBe(1);
		expect(summary.remainingCandidates).toBe(1);
		expect(summary.newTilesThisRun).toBe(10);
		expect(summary.newSegmentsThisRun).toBe(5);
	});

	it('counts qualified ride and run segments separately', () => {
		const segments = [
			{ id: 1, activityType: 'ride', passesThresholds: true },
			{ id: 2, activityType: 'ride', passesThresholds: false },
			{ id: 3, activityType: 'run', passesThresholds: true }
		];
		const summary = buildSummary([], segments, 0, queues, { newTilesThisRun: 0, newSegmentsThisRun: 0 }) as Record<string, unknown>;
		expect(summary.qualifiedRideSegments).toBe(1);
		expect(summary.qualifiedRunSegments).toBe(1);
	});

	it('returns remainingCandidates=0 when more enriched than candidates', () => {
		const summary = buildSummary([], [{ id: 1 }], 0, queues, runStats) as Record<string, unknown>;
		expect(summary.remainingCandidates).toBe(0);
	});
});

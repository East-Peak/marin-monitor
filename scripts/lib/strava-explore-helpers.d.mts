/**
 * Type declarations for scripts/lib/strava-explore-helpers.mjs.
 * Used by the TypeScript test file and svelte-check.
 */

export declare const ACTIVITY_TYPES: string[];

export declare const TRANSIENT_RETRY_LIMIT: number;
export declare const TRANSIENT_RETRY_BASE_MS: number;
export declare const TRANSIENT_RETRY_MAX_MS: number;

export declare function normalizeMode(value: string): 'discover' | 'hybrid' | 'enrich';
export declare function defaultProgressFile(outputFile: string): string;
export declare function defaultTrancheDir(outputFile: string): string;

export declare function computeTransientRetryDelayMs(attempt: number): number;
export declare function isTransientHttpStatus(status: number): boolean;
export declare function isTransientFetchError(error: unknown): boolean;

export declare function summarizeText(text?: unknown, maxLength?: number): string;
export declare function looksLikeHtmlResponse(contentType: unknown, bodyText: unknown): boolean;

export declare function splitBoundingBox(
	box: [number, number, number, number]
): [number, number, number, number][];
export declare function formatBox(box: number[]): string;

export interface QualityRules {
	minDistance: number;
	minElevationGain: number;
	minAttempts: number;
	minAthletes: number;
}

export interface EnrichedSegment {
	distance: number;
	elevationGain: number;
	totalAttempts: number;
	totalAthletes: number;
	climbCategory: number;
}

export interface DiscoveryCandidate {
	distance: number;
	elevDifference: number;
	avgGrade: number;
	climbCategory: number;
	discoveryHits: number;
}

export declare function qualityReasons(segment: EnrichedSegment, rules: QualityRules): string[];
export declare function qualityScore(segment: EnrichedSegment): number;
export declare function previewReasons(candidate: DiscoveryCandidate): string[];
export declare function previewScore(candidate: DiscoveryCandidate): number;

export declare function serializeLimit(value: number): number | null;
export declare function serializeOptions(options: {
	mode: string;
	maxDepth: number;
	minRequestGapMs: number;
	tileLimit: number;
	segmentLimit: number;
	maxRequests: number;
	dailyHeadroom: number;
	tileCheckpointEvery: number;
	segmentCheckpointEvery: number;
}): object;

export declare function normalizeLatlng(value: unknown): [number, number];
export declare function normalizeBox(box: unknown): [number, number, number, number];

export declare function applyCandidateDerivedFields(candidate: object): object;
export declare function sortCandidates(candidates: object[]): object[];
export declare function buildCandidateRecord(
	segment: object,
	activityType: string,
	box: number[],
	depth: number
): object;

export declare function clonePendingQueues(
	pendingQueues: Record<string, Array<{ box: unknown; depth: unknown }>>
): Record<string, Array<{ box: number[]; depth: number }>>;
export declare function discoveryComplete(pendingQueues: Record<string, unknown[]>): boolean;
export declare function pendingDiscoveryTileCount(pendingQueues: Record<string, unknown[]>): number;

export declare function buildDiscoveryState(
	pendingQueues: Record<string, Array<{ box: unknown; depth: unknown }>>
): { complete: boolean; pendingTileCount: number; pendingQueues: object };

export declare function buildSummary(
	candidates: object[],
	segments: object[],
	exploredTiles: number,
	pendingQueues: Record<string, unknown[]>,
	runStats: { newTilesThisRun: number; newSegmentsThisRun: number }
): object;

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.strava-explore.local');
const OUTPUT_FILE = path.join(ROOT, 'data', 'strava-explore.generated.json');
const PROGRESS_FILE = path.join(ROOT, 'data', 'strava-explore.progress.json');
const TRANCHE_DIR = path.join(ROOT, 'data', 'strava-explore.tranches');
const ACTIVITY_TYPES = ['ride', 'run'];

// Keep in sync with src/lib/config/strava.ts.
const MARIN_BOUNDING_BOXES = [
	[37.83, -122.75, 37.94, -122.48],
	[37.92, -122.68, 38.02, -122.45],
	[38.0, -122.7, 38.08, -122.45],
	[37.88, -122.8, 37.98, -122.62],
	[37.96, -122.8, 38.08, -122.62]
];

const QUALITY_RULES = {
	ride: {
		minDistance: 1200,
		minElevationGain: 40,
		minAttempts: 150,
		minAthletes: 40
	},
	run: {
		minDistance: 800,
		minElevationGain: 30,
		minAttempts: 60,
		minAthletes: 15
	}
};

const DEFAULTS = {
	mode: 'hybrid',
	maxDepth: 3,
	minRequestGapMs: 10_000,
	tileLimit: Infinity,
	segmentLimit: Infinity,
	maxRequests: Infinity,
	dailyHeadroom: 25,
	tileCheckpointEvery: 5,
	segmentCheckpointEvery: 10,
	outputFile: OUTPUT_FILE,
	progressFile: PROGRESS_FILE,
	trancheDir: TRANCHE_DIR,
	inputFile: null
};

const TRANSIENT_RETRY_LIMIT = 6;
const TRANSIENT_RETRY_BASE_MS = 15_000;
const TRANSIENT_RETRY_MAX_MS = 180_000;

function printUsage() {
	console.log(`Usage: npm run strava:explore -- [options]

Options:
  --mode=discover|hybrid|enrich
                            Run discovery only, discovery then enrichment, or enrichment only (default: ${DEFAULTS.mode})
  --max-depth=N             Recursive split depth for dense Marin tiles (default: ${DEFAULTS.maxDepth})
  --min-gap-ms=N            Minimum gap between Strava API requests (default: ${DEFAULTS.minRequestGapMs})
  --tile-limit=N            Stop after exploring N new tiles in this run (default: unlimited)
  --segment-limit=N         Stop after enriching N new segments in this run (default: unlimited)
  --max-requests=N          Stop after spending N Strava read requests in this run (default: unlimited)
  --daily-headroom=N        Stop when Strava daily read quota falls to N remaining requests (default: ${DEFAULTS.dailyHeadroom})
  --tile-checkpoint-every=N Write discovery progress after every N explored tiles (default: ${DEFAULTS.tileCheckpointEvery})
  --segment-checkpoint-every=N
                            Write enrichment progress and a tranche file after every N segments (default: ${DEFAULTS.segmentCheckpointEvery})
  --input=PATH              Resume from this prior output file (default: output file path)
  --output=PATH             Write generated catalog to this file
  --progress=PATH           Write live progress snapshots to this file
  --tranche-dir=PATH        Write tranche snapshots to this directory
  --help                    Show this help

Environment:
  This script reads STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN
  from ${path.basename(ENV_FILE)}.

Output:
  ${path.relative(ROOT, OUTPUT_FILE)}
`);
}

function parseArgs(argv) {
	const options = { ...DEFAULTS };
	let inputExplicit = false;
	let progressExplicit = false;
	let trancheDirExplicit = false;

	for (const arg of argv) {
		if (arg === '--help') {
			options.help = true;
			continue;
		}
		if (arg.startsWith('--mode=')) {
			options.mode = normalizeMode(arg.split('=')[1]);
			continue;
		}
		if (arg.startsWith('--max-depth=')) {
			options.maxDepth = Number.parseInt(arg.split('=')[1], 10);
			continue;
		}
		if (arg.startsWith('--min-gap-ms=')) {
			options.minRequestGapMs = Number.parseInt(arg.split('=')[1], 10);
			continue;
		}
		if (arg.startsWith('--tile-limit=')) {
			options.tileLimit = Number.parseInt(arg.split('=')[1], 10);
			continue;
		}
		if (arg.startsWith('--segment-limit=')) {
			options.segmentLimit = Number.parseInt(arg.split('=')[1], 10);
			continue;
		}
		if (arg.startsWith('--max-requests=')) {
			options.maxRequests = Number.parseInt(arg.split('=')[1], 10);
			continue;
		}
		if (arg.startsWith('--daily-headroom=')) {
			options.dailyHeadroom = Number.parseInt(arg.split('=')[1], 10);
			continue;
		}
		if (arg.startsWith('--tile-checkpoint-every=')) {
			options.tileCheckpointEvery = Number.parseInt(arg.split('=')[1], 10);
			continue;
		}
		if (arg.startsWith('--segment-checkpoint-every=')) {
			options.segmentCheckpointEvery = Number.parseInt(arg.split('=')[1], 10);
			continue;
		}
		if (arg.startsWith('--input=')) {
			options.inputFile = path.resolve(ROOT, arg.split('=')[1]);
			inputExplicit = true;
			continue;
		}
		if (arg.startsWith('--output=')) {
			options.outputFile = path.resolve(ROOT, arg.split('=')[1]);
			continue;
		}
		if (arg.startsWith('--progress=')) {
			options.progressFile = path.resolve(ROOT, arg.split('=')[1]);
			progressExplicit = true;
			continue;
		}
		if (arg.startsWith('--tranche-dir=')) {
			options.trancheDir = path.resolve(ROOT, arg.split('=')[1]);
			trancheDirExplicit = true;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	if (!inputExplicit) {
		options.inputFile = options.outputFile;
	}

	if (!progressExplicit) {
		options.progressFile = defaultProgressFile(options.outputFile);
	}

	if (!trancheDirExplicit) {
		options.trancheDir = defaultTrancheDir(options.outputFile);
	}

	return options;
}

function normalizeMode(value) {
	if (value === 'discover' || value === 'hybrid' || value === 'enrich') {
		return value;
	}
	throw new Error(`Unsupported mode: ${value}`);
}

function defaultProgressFile(outputFile) {
	const parsed = path.parse(outputFile);
	return path.join(parsed.dir, `${parsed.name}.progress.json`);
}

function defaultTrancheDir(outputFile) {
	const parsed = path.parse(outputFile);
	return path.join(parsed.dir, `${parsed.name}.tranches`);
}

function parseEnvFile(filename) {
	const env = {};
	const raw = fs.readFileSync(filename, 'utf8');

	for (const line of raw.split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const eq = trimmed.indexOf('=');
		if (eq <= 0) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		env[key] = value;
	}

	return env;
}

function ensureCredentials() {
	if (!fs.existsSync(ENV_FILE)) {
		throw new Error(
			`Missing ${path.basename(ENV_FILE)}. Pull it once with: vercel env pull ${path.basename(ENV_FILE)} --environment=production -y`
		);
	}

	const env = parseEnvFile(ENV_FILE);
	const required = ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'STRAVA_REFRESH_TOKEN'];

	for (const key of required) {
		if (!env[key]) {
			throw new Error(`Missing ${key} in ${path.basename(ENV_FILE)}`);
		}
	}

	return env;
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeTransientRetryDelayMs(attempt) {
	const backoff = Math.min(
		TRANSIENT_RETRY_MAX_MS,
		TRANSIENT_RETRY_BASE_MS * 2 ** Math.max(attempt - 1, 0)
	);
	const jitter = Math.floor(Math.random() * 2_500);
	return backoff + jitter;
}

function isTransientHttpStatus(status) {
	return status === 408 || status === 425 || status >= 500;
}

function isTransientFetchError(error) {
	const message = `${error?.name ?? ''} ${error?.message ?? String(error ?? '')}`.toLowerCase();
	return (
		error?.name === 'AbortError' ||
		/fetch failed|econnreset|etimedout|eai_again|enotfound|socket hang up|und_err_|timeout/.test(
			message
		)
	);
}

function summarizeText(text, maxLength = 180) {
	const collapsed = String(text ?? '')
		.replace(/\s+/g, ' ')
		.trim();
	if (collapsed.length <= maxLength) return collapsed;
	return `${collapsed.slice(0, maxLength - 3)}...`;
}

function looksLikeHtmlResponse(contentType, bodyText) {
	const normalizedType = String(contentType ?? '').toLowerCase();
	if (normalizedType.includes('text/html')) return true;

	const preview = String(bodyText ?? '').slice(0, 600);
	return /<!doctype html|<html[\s>]|<body[\s>]|<\/html>/i.test(preview);
}

function splitBoundingBox([south, west, north, east]) {
	const midLat = (south + north) / 2;
	const midLng = (west + east) / 2;

	return [
		[south, west, midLat, midLng],
		[south, midLng, midLat, east],
		[midLat, west, north, midLng],
		[midLat, midLng, north, east]
	];
}

function formatBox(box) {
	return box.map((value) => value.toFixed(5)).join(',');
}

function qualityReasons(segment, rules) {
	const reasons = [];
	if (segment.distance >= rules.minDistance) reasons.push('distance');
	if (segment.elevationGain >= rules.minElevationGain) reasons.push('elevation');
	if (segment.totalAttempts >= rules.minAttempts) reasons.push('attempts');
	if (segment.totalAthletes >= rules.minAthletes) reasons.push('athletes');
	return reasons;
}

function qualityScore(segment) {
	const distanceKm = segment.distance / 1000;
	return Math.round(
		distanceKm * 14 +
			segment.elevationGain * 0.18 +
			segment.totalAttempts * 0.03 +
			segment.totalAthletes * 0.75 +
			segment.climbCategory * 10
	);
}

function previewReasons(candidate) {
	const reasons = [];
	if (candidate.distance >= 1200) reasons.push('distance');
	if (candidate.elevDifference >= 40) reasons.push('elevation');
	if (candidate.discoveryHits >= 2) reasons.push('repeat-discovery');
	if (candidate.climbCategory >= 1) reasons.push('climb');
	return reasons;
}

function previewScore(candidate) {
	const distanceKm = candidate.distance / 1000;
	return Math.round(
		distanceKm * 12 +
			candidate.elevDifference * 0.2 +
			Math.abs(candidate.avgGrade) * 2.5 +
			candidate.climbCategory * 12 +
			candidate.discoveryHits * 6
	);
}

function serializeLimit(value) {
	return Number.isFinite(value) ? value : null;
}

function serializeOptions(options) {
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

function computeWaitToNextWindowMs() {
	const now = new Date();
	const next = new Date(now);
	next.setSeconds(0, 0);
	next.setMinutes(Math.ceil(now.getMinutes() / 15) * 15);
	if (next <= now) {
		next.setMinutes(next.getMinutes() + 15);
	}
	return next.getTime() - now.getTime() + 5_000;
}

function computeWaitToNextUtcMidnightMs() {
	const now = new Date();
	const next = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 5)
	);
	return next.getTime() - now.getTime();
}

class StopRunError extends Error {
	constructor(code, message) {
		super(message);
		this.name = 'StopRunError';
		this.code = code;
	}
}

class StravaClient {
	constructor(env, minRequestGapMs, options = {}) {
		this.env = env;
		this.minRequestGapMs = minRequestGapMs;
		this.accessToken = null;
		this.accessTokenExpiresAt = 0;
		this.authInFlight = null;
		this.lastRequestAt = 0;
		this.lastRateLimit = null;
		this.requestCount = 0;
		this.maxRequests = options.maxRequests ?? Infinity;
		this.dailyHeadroom = options.dailyHeadroom ?? DEFAULTS.dailyHeadroom;
		this.transientRetryLimit = options.transientRetryLimit ?? TRANSIENT_RETRY_LIMIT;
	}

	tokenNeedsRefresh() {
		if (!this.accessToken) return true;
		return Date.now() >= this.accessTokenExpiresAt - 5 * 60 * 1000;
	}

	async auth(force = false) {
		if (!force && !this.tokenNeedsRefresh()) return;
		if (this.authInFlight) {
			await this.authInFlight;
			return;
		}

		this.authInFlight = (async () => {
			let attempt = 0;
			let payload = null;

			while (payload == null) {
				let response;
				try {
					response = await fetch('https://www.strava.com/oauth/token', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							client_id: this.env.STRAVA_CLIENT_ID,
							client_secret: this.env.STRAVA_CLIENT_SECRET,
							refresh_token: this.env.STRAVA_REFRESH_TOKEN,
							grant_type: 'refresh_token'
						})
					});
				} catch (error) {
					if (!isTransientFetchError(error)) throw error;
					attempt = await this.retryTransient(
						'OAuth token exchange',
						attempt,
						`network error: ${String(error.message ?? error)}`
					);
					continue;
				}

				const bodyText = await response.text();
				if (
					isTransientHttpStatus(response.status) ||
					looksLikeHtmlResponse(response.headers.get('content-type'), bodyText)
				) {
					attempt = await this.retryTransient(
						'OAuth token exchange',
						attempt,
						`${response.status} ${summarizeText(bodyText)}`
					);
					continue;
				}

				if (!response.ok) {
					throw new Error(`OAuth token exchange failed: ${response.status} ${bodyText}`);
				}

				try {
					payload = JSON.parse(bodyText);
				} catch (error) {
					attempt = await this.retryTransient(
						'OAuth token exchange',
						attempt,
						`invalid JSON: ${summarizeText(bodyText)}`
					);
				}
			}

			this.accessToken = payload.access_token;
			this.accessTokenExpiresAt = Number(payload.expires_at ?? 0) * 1000;

			if (
				typeof payload.refresh_token === 'string' &&
				payload.refresh_token.length > 0 &&
				payload.refresh_token !== this.env.STRAVA_REFRESH_TOKEN
			) {
				console.warn(
					`[strava-explore] Refresh token rotated to ${payload.refresh_token.slice(0, 8)}...`
				);
				console.warn(
					`[strava-explore] Update STRAVA_REFRESH_TOKEN in ${path.basename(ENV_FILE)} before the next long run.`
				);
				this.env.STRAVA_REFRESH_TOKEN = payload.refresh_token;
			}
		})();

		try {
			await this.authInFlight;
		} finally {
			this.authInFlight = null;
		}
	}

	async throttledFetch(url, options = {}) {
		const { allowAuthRetry = true, transientRetryCount = 0, requestLabel = url } = options;

		if (this.requestCount >= this.maxRequests) {
			throw new StopRunError(
				'request-budget-reached',
				`Reached request budget (${this.requestCount}/${this.maxRequests}). Start another run to continue.`
			);
		}

		await this.auth();

		const elapsed = Date.now() - this.lastRequestAt;
		if (elapsed < this.minRequestGapMs) {
			await wait(this.minRequestGapMs - elapsed);
		}

		let response;
		try {
			response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${this.accessToken}`,
					Accept: 'application/json'
				}
			});
		} catch (error) {
			if (!isTransientFetchError(error)) throw error;
			const nextRetryCount = await this.retryTransient(
				requestLabel,
				transientRetryCount,
				`network error: ${String(error.message ?? error)}`
			);
			return this.throttledFetch(url, {
				allowAuthRetry,
				transientRetryCount: nextRetryCount,
				requestLabel
			});
		}
		this.requestCount += 1;
		this.lastRequestAt = Date.now();
		this.captureRateLimit(response);

		if (response.status === 401 && allowAuthRetry) {
			console.warn('[strava-explore] Access token rejected, refreshing and retrying once');
			await this.auth(true);
			return this.throttledFetch(url, {
				allowAuthRetry: false,
				transientRetryCount,
				requestLabel
			});
		}

		if (response.status === 429) {
			if (this.lastRateLimit && this.lastRateLimit.dailyUsage >= this.lastRateLimit.dailyLimit) {
				const cooldown = computeWaitToNextUtcMidnightMs();
				throw new StopRunError(
					'daily-read-limit-hit',
					`Hit Strava daily read cap (${this.lastRateLimit.dailyUsage}/${this.lastRateLimit.dailyLimit}). Resets in about ${Math.round(cooldown / 60000)} minutes.`
				);
			}

			const cooldown = computeWaitToNextWindowMs();
			console.warn(
				`[strava-explore] Rate-limited. Cooling down for ${Math.round(cooldown / 1000)}s`
			);
			await wait(cooldown);
			return this.throttledFetch(url, { allowAuthRetry, transientRetryCount, requestLabel });
		}

		if (isTransientHttpStatus(response.status)) {
			const bodyText = await response.text();
			const nextRetryCount = await this.retryTransient(
				requestLabel,
				transientRetryCount,
				`${response.status} ${summarizeText(bodyText)}`
			);
			return this.throttledFetch(url, {
				allowAuthRetry,
				transientRetryCount: nextRetryCount,
				requestLabel
			});
		}

		return response;
	}

	async retryTransient(label, attempt, detail) {
		const nextAttempt = attempt + 1;
		if (nextAttempt > this.transientRetryLimit) {
			throw new StopRunError(
				'transient-service-failure',
				`Stopping after ${attempt} transient retries for ${label}: ${detail}`
			);
		}

		const delay = computeTransientRetryDelayMs(nextAttempt);
		console.warn(
			`[strava-explore] transient failure for ${label}; retrying in ${Math.round(delay / 1000)}s (${nextAttempt}/${this.transientRetryLimit}): ${detail}`
		);
		await wait(delay);
		return nextAttempt;
	}

	captureRateLimit(response) {
		const limitHeader =
			response.headers.get('x-readratelimit-limit') ?? response.headers.get('x-ratelimit-limit');
		const usageHeader =
			response.headers.get('x-readratelimit-usage') ?? response.headers.get('x-ratelimit-usage');

		if (!limitHeader || !usageHeader) return;

		const limit = limitHeader.split(',').map((value) => Number.parseInt(value, 10));
		const usage = usageHeader.split(',').map((value) => Number.parseInt(value, 10));
		if (limit.length < 2 || usage.length < 2) return;

		this.lastRateLimit = {
			shortLimit: limit[0],
			dailyLimit: limit[1],
			shortUsage: usage[0],
			dailyUsage: usage[1]
		};
	}

	async maybePauseForRateLimit() {
		if (!this.lastRateLimit) return;

		if (this.lastRateLimit.dailyUsage >= this.lastRateLimit.dailyLimit - this.dailyHeadroom) {
			const remaining = this.lastRateLimit.dailyLimit - this.lastRateLimit.dailyUsage;
			const cooldown = computeWaitToNextUtcMidnightMs();
			throw new StopRunError(
				'daily-headroom-reached',
				`Stopping with ${remaining} daily read requests remaining (${this.lastRateLimit.dailyUsage}/${this.lastRateLimit.dailyLimit}). Resets in about ${Math.round(cooldown / 60000)} minutes.`
			);
		}

		if (this.lastRateLimit.shortUsage < this.lastRateLimit.shortLimit - 2) return;

		const cooldown = computeWaitToNextWindowMs();
		console.warn(
			`[strava-explore] Approaching 15-minute read cap (${this.lastRateLimit.shortUsage}/${this.lastRateLimit.shortLimit}). Waiting ${Math.round(cooldown / 1000)}s`
		);
		await wait(cooldown);
	}

	async explore(box, activityType) {
		const apiActivityType = activityType === 'ride' ? 'riding' : 'running';
		const url = `https://www.strava.com/api/v3/segments/explore?bounds=${formatBox(box)}&activity_type=${apiActivityType}`;
		const label = `explore ${activityType} ${formatBox(box)}`;
		const payload = await this.requestJson(url, label);
		return Array.isArray(payload.segments) ? payload.segments : [];
	}

	async detail(segmentId) {
		const url = `https://www.strava.com/api/v3/segments/${segmentId}`;
		return this.requestJson(url, `detail ${segmentId}`);
	}

	async requestJson(url, label) {
		let parseRetryCount = 0;

		while (true) {
			const response = await this.throttledFetch(url, { requestLabel: label });
			const bodyText = await response.text();

			if (!response.ok) {
				throw new Error(`${label} failed: ${response.status} ${bodyText}`);
			}

			if (looksLikeHtmlResponse(response.headers.get('content-type'), bodyText)) {
				parseRetryCount = await this.retryTransient(
					label,
					parseRetryCount,
					`unexpected HTML response: ${summarizeText(bodyText)}`
				);
				continue;
			}

			let payload;
			try {
				payload = JSON.parse(bodyText);
			} catch (error) {
				parseRetryCount = await this.retryTransient(
					label,
					parseRetryCount,
					`invalid JSON: ${summarizeText(bodyText)}`
				);
				continue;
			}

			await this.maybePauseForRateLimit();
			return payload;
		}
	}
}

function writeJson(filename, payload) {
	fs.mkdirSync(path.dirname(filename), { recursive: true });
	fs.writeFileSync(filename, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJson(filename) {
	return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function loadStateFromFile(filename) {
	if (!filename || !fs.existsSync(filename)) {
		return null;
	}

	try {
		return readJson(filename);
	} catch (error) {
		console.warn(
			`[strava-explore] Could not load prior state from ${path.relative(ROOT, filename)}: ${String(error)}`
		);
		return null;
	}
}

function initPendingDiscoveryQueues() {
	return Object.fromEntries(
		ACTIVITY_TYPES.map((activityType) => [
			activityType,
			MARIN_BOUNDING_BOXES.map((box) => ({ box, depth: 0 }))
		])
	);
}

function clonePendingQueues(pendingQueues) {
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

function discoveryComplete(pendingQueues) {
	return ACTIVITY_TYPES.every((activityType) => (pendingQueues[activityType] ?? []).length === 0);
}

function pendingDiscoveryTileCount(pendingQueues) {
	return ACTIVITY_TYPES.reduce(
		(total, activityType) => total + (pendingQueues[activityType] ?? []).length,
		0
	);
}

function normalizeBox(box) {
	return Array.isArray(box) && box.length === 4 ? box.map((value) => Number(value)) : [0, 0, 0, 0];
}

function buildCandidateRecord(segment, activityType, box, depth) {
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

function normalizeLatlng(value) {
	if (!Array.isArray(value) || value.length !== 2) return [0, 0];
	return value.map((part) => Number(part ?? 0));
}

function applyCandidateDerivedFields(candidate) {
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

function sortCandidates(candidates) {
	return [...candidates]
		.map((candidate) => applyCandidateDerivedFields(candidate))
		.sort(
			(a, b) =>
				b.previewScore - a.previewScore ||
				b.discoveryHits - a.discoveryHits ||
				b.distance - a.distance
		);
}

function buildDiscoveryState(pendingQueues) {
	return {
		complete: discoveryComplete(pendingQueues),
		pendingTileCount: pendingDiscoveryTileCount(pendingQueues),
		pendingQueues: clonePendingQueues(pendingQueues)
	};
}

function buildSummary(candidates, segments, exploredTiles, pendingQueues, runStats) {
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

function buildRun(options, client, startedAt, phase, stopReason) {
	return {
		startedAt,
		updatedAt: new Date().toISOString(),
		phase,
		complete: phase === 'complete' && stopReason == null,
		stopReason,
		requestCount: client.requestCount,
		rateLimit: client.lastRateLimit,
		artifacts: {
			inputFile: path.relative(ROOT, options.inputFile),
			outputFile: path.relative(ROOT, options.outputFile),
			progressFile: path.relative(ROOT, options.progressFile),
			trancheDir: path.relative(ROOT, options.trancheDir)
		}
	};
}

function buildOutput(candidates, segments, options, summary, run, discoveryState) {
	const sortedSegments = [...segments].sort(
		(a, b) => b.qualityScore - a.qualityScore || b.totalAttempts - a.totalAttempts
	);
	const sortedCandidates = sortCandidates(candidates);

	return {
		generatedAt: new Date().toISOString(),
		source: 'strava-explore',
		options: serializeOptions(options),
		run,
		summary,
		discoveryState,
		recommendedFeatured: {
			ride: sortedSegments
				.filter((segment) => segment.activityType === 'ride' && segment.passesThresholds)
				.slice(0, 25)
				.map((segment) => ({
					id: segment.id,
					name: segment.name,
					startLatlng: segment.startLatlng,
					qualityScore: segment.qualityScore
				})),
			run: sortedSegments
				.filter((segment) => segment.activityType === 'run' && segment.passesThresholds)
				.slice(0, 12)
				.map((segment) => ({
					id: segment.id,
					name: segment.name,
					startLatlng: segment.startLatlng,
					qualityScore: segment.qualityScore
				}))
		},
		candidates: sortedCandidates,
		segments: sortedSegments
	};
}

function buildProgress(options, summary, run, discoveryState, context = {}) {
	return {
		generatedAt: new Date().toISOString(),
		source: 'strava-explore',
		options: serializeOptions(options),
		run,
		summary,
		discoveryState,
		context
	};
}

function writeTranche(trancheDir, prefix, index, payload) {
	const filename = path.join(trancheDir, `${prefix}-${String(index).padStart(4, '0')}.json`);
	writeJson(filename, payload);
	return filename;
}

function currentTrancheIndex(trancheDir, prefix) {
	if (!fs.existsSync(trancheDir)) return 0;

	const pattern = new RegExp(`^${prefix}-(\\d{4})\\.json$`);
	let max = 0;

	for (const entry of fs.readdirSync(trancheDir)) {
		const match = entry.match(pattern);
		if (!match) continue;
		max = Math.max(max, Number.parseInt(match[1], 10));
	}

	return max;
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		printUsage();
		return;
	}

	const env = ensureCredentials();
	const priorState = loadStateFromFile(options.inputFile);
	const client = new StravaClient(env, options.minRequestGapMs, {
		maxRequests: options.maxRequests,
		dailyHeadroom: options.dailyHeadroom
	});
	await client.auth();

	const candidates = new Map();
	const enriched = [];
	const startedAt = new Date().toISOString();
	const tileCheckpointEvery = Math.max(1, options.tileCheckpointEvery);
	const segmentCheckpointEvery = Math.max(1, options.segmentCheckpointEvery);
	const runStats = { newTilesThisRun: 0, newSegmentsThisRun: 0 };
	let exploredTiles = 0;
	let phase = 'discovery';
	let stopReason = null;
	let pendingQueues = initPendingDiscoveryQueues();
	let discoveryTrancheIndex = currentTrancheIndex(options.trancheDir, 'discovery');
	let trancheIndex = currentTrancheIndex(options.trancheDir, 'enrichment');
	let trancheStart = 0;
	const pendingDiscoveryCandidateIds = [];

	if (priorState && Array.isArray(priorState.candidates)) {
		for (const candidate of priorState.candidates) {
			const normalized = applyCandidateDerivedFields(candidate);
			candidates.set(normalized.id, normalized);
		}
	}

	if (priorState && Array.isArray(priorState.segments)) {
		for (const segment of priorState.segments) {
			enriched.push(segment);
		}
		trancheStart = enriched.length;
	}

	if (
		priorState?.summary?.exploredTiles != null &&
		(Array.isArray(priorState?.candidates) || priorState?.discoveryState?.pendingQueues)
	) {
		exploredTiles = Number(priorState.summary.exploredTiles) || 0;
	}

	if (priorState?.discoveryState?.pendingQueues) {
		pendingQueues = clonePendingQueues(priorState.discoveryState.pendingQueues);
	} else if (candidates.size > 0) {
		pendingQueues = Object.fromEntries(ACTIVITY_TYPES.map((activityType) => [activityType, []]));
	}

	if (options.mode === 'enrich' && candidates.size === 0) {
		throw new Error(
			`No candidate list found in ${path.relative(ROOT, options.inputFile)}. Run discovery or hybrid mode first.`
		);
	}

	function writeProgressSnapshot(context = {}) {
		const summary = buildSummary(
			Array.from(candidates.values()),
			enriched,
			exploredTiles,
			pendingQueues,
			runStats
		);
		const discoveryState = buildDiscoveryState(pendingQueues);
		const run = buildRun(options, client, startedAt, phase, stopReason);
		writeJson(options.progressFile, buildProgress(options, summary, run, discoveryState, context));
		return { summary, discoveryState, run };
	}

	writeProgressSnapshot({
		stage: 'starting',
		resumed: priorState != null,
		resumedCandidates: candidates.size,
		resumedSegments: enriched.length
	});

	try {
		if (options.mode !== 'enrich' && !discoveryComplete(pendingQueues)) {
			phase = 'discovery';

			for (const activityType of ACTIVITY_TYPES) {
				const queue = pendingQueues[activityType];

				while (queue.length > 0 && runStats.newTilesThisRun < options.tileLimit) {
					const current = queue.shift();
					const segments = await client.explore(current.box, activityType);
					exploredTiles++;
					runStats.newTilesThisRun++;

					for (const segment of segments) {
						const existing = candidates.get(segment.id);
						if (existing) {
							existing.discoveryHits += 1;
							existing.discoveredFrom.push({
								activityType,
								bounds: normalizeBox(current.box),
								depth: current.depth
							});
							const updated = applyCandidateDerivedFields(existing);
							candidates.set(updated.id, updated);
							continue;
						}

						const record = buildCandidateRecord(segment, activityType, current.box, current.depth);
						candidates.set(record.id, record);
						pendingDiscoveryCandidateIds.push(record.id);
					}

					if (segments.length >= 10 && current.depth < options.maxDepth) {
						queue.push(
							...splitBoundingBox(current.box).map((box) => ({
								box,
								depth: current.depth + 1
							}))
						);
					}

					if (
						runStats.newTilesThisRun % tileCheckpointEvery === 0 ||
						runStats.newTilesThisRun === options.tileLimit ||
						queue.length === 0
					) {
						const { summary, discoveryState, run } = writeProgressSnapshot({
							stage: 'discovery',
							activityType,
							currentBounds: current.box,
							currentDepth: current.depth,
							queueRemaining: queue.length,
							discoveredIds: candidates.size
						});
						const discoveryCandidates = sortCandidates(
							pendingDiscoveryCandidateIds
								.map((id) => candidates.get(id))
								.filter((candidate) => candidate != null)
						);
						if (discoveryCandidates.length > 0) {
							discoveryTrancheIndex++;
							const trancheFile = writeTranche(
								options.trancheDir,
								'discovery',
								discoveryTrancheIndex,
								{
									generatedAt: new Date().toISOString(),
									source: 'strava-explore',
									tranche: {
										type: 'discovery',
										index: discoveryTrancheIndex,
										candidateCount: discoveryCandidates.length,
										cumulativeCandidates: candidates.size,
										exploredTiles
									},
									run,
									summary,
									discoveryState,
									candidates: discoveryCandidates
								}
							);
							pendingDiscoveryCandidateIds.length = 0;
							console.log(
								`[strava-explore] wrote discovery tranche ${discoveryTrancheIndex}: ${candidates.size} candidate IDs (${path.relative(ROOT, trancheFile)})`
							);
						}
						console.log(
							`[strava-explore] discovery checkpoint: ${exploredTiles} total tiles, ${candidates.size} candidate IDs, ${client.requestCount} requests this run`
						);
					}
				}

				if (runStats.newTilesThisRun >= options.tileLimit) {
					break;
				}
			}
		}

		if (discoveryComplete(pendingQueues)) {
			console.log(
				`[strava-explore] discovered ${candidates.size} unique candidate IDs from ${exploredTiles} Marin tile scans`
			);
		}

		if (options.mode !== 'discover' && candidates.size > 0 && discoveryComplete(pendingQueues)) {
			phase = 'enrichment';
			const enrichedIds = new Set(enriched.map((segment) => segment.id));
			const candidatesToEnrich = sortCandidates(Array.from(candidates.values())).filter(
				(candidate) => !enrichedIds.has(candidate.id)
			);

			for (const candidate of candidatesToEnrich) {
				if (runStats.newSegmentsThisRun >= options.segmentLimit) break;

				const detail = await client.detail(candidate.id);
				const totalAttempts = detail.effort_count ?? 0;
				const totalAthletes = detail.athlete_count ?? 0;
				const segment = {
					id: detail.id,
					name: detail.name,
					activityType: candidate.activityType,
					polyline: detail.map?.polyline ?? candidate.polyline ?? null,
					startLatlng: normalizeLatlng(detail.start_latlng ?? candidate.startLatlng),
					endLatlng: normalizeLatlng(detail.end_latlng ?? candidate.endLatlng),
					distance: detail.distance ?? candidate.distance ?? 0,
					elevationGain: detail.total_elevation_gain ?? candidate.elevDifference ?? 0,
					avgGrade: detail.average_grade ?? candidate.avgGrade ?? 0,
					climbCategory: detail.climb_category ?? candidate.climbCategory ?? 0,
					totalAttempts,
					totalAthletes,
					discoveryHits: candidate.discoveryHits,
					discoveredFrom: candidate.discoveredFrom,
					previewScore: candidate.previewScore
				};

				const rules = QUALITY_RULES[segment.activityType];
				const reasons = qualityReasons(segment, rules);
				const passesThresholds =
					(totalAttempts >= rules.minAttempts || totalAthletes >= rules.minAthletes) &&
					(segment.distance >= rules.minDistance ||
						segment.elevationGain >= rules.minElevationGain);

				enriched.push({
					...segment,
					passesThresholds,
					qualifyingReasons: reasons,
					qualityScore: qualityScore(segment)
				});
				enrichedIds.add(segment.id);
				runStats.newSegmentsThisRun++;

				if (
					runStats.newSegmentsThisRun % segmentCheckpointEvery === 0 ||
					runStats.newSegmentsThisRun === options.segmentLimit ||
					enrichedIds.size === candidates.size
				) {
					const { summary, discoveryState, run } = writeProgressSnapshot({
						stage: 'enrichment',
						currentSegmentId: candidate.id,
						enrichedSegments: enriched.length,
						remainingCandidates: Math.max(candidates.size - enriched.length, 0)
					});
					const payload = buildOutput(
						Array.from(candidates.values()),
						enriched,
						options,
						summary,
						run,
						discoveryState
					);
					writeJson(options.outputFile, payload);

					const trancheSegments = enriched.slice(trancheStart);
					if (trancheSegments.length > 0) {
						trancheIndex++;
						const trancheFile = writeTranche(options.trancheDir, 'enrichment', trancheIndex, {
							generatedAt: new Date().toISOString(),
							source: 'strava-explore',
							tranche: {
								type: 'enrichment',
								index: trancheIndex,
								segmentCount: trancheSegments.length,
								cumulativeSegments: enriched.length
							},
							run,
							summary,
							discoveryState,
							segments: trancheSegments
						});
						trancheStart = enriched.length;
						console.log(
							`[strava-explore] wrote enrichment tranche ${trancheIndex}: ${enriched.length} total enriched -> ${path.relative(ROOT, options.outputFile)} (${path.relative(ROOT, trancheFile)})`
						);
					}
				}
			}
		}
	} catch (error) {
		if (error instanceof StopRunError) {
			stopReason = {
				code: error.code,
				message: error.message
			};
		} else {
			throw error;
		}
	}

	const discoveryDone = discoveryComplete(pendingQueues);
	const enrichmentDone =
		options.mode === 'discover' || candidates.size === 0 || enriched.length >= candidates.size;
	const runComplete = stopReason == null && discoveryDone && enrichmentDone;
	const finalPhase = runComplete ? 'complete' : phase;
	const summary = buildSummary(
		Array.from(candidates.values()),
		enriched,
		exploredTiles,
		pendingQueues,
		runStats
	);
	const discoveryState = buildDiscoveryState(pendingQueues);
	const run = buildRun(options, client, startedAt, finalPhase, stopReason);
	const payload = buildOutput(
		Array.from(candidates.values()),
		enriched,
		options,
		summary,
		run,
		discoveryState
	);
	writeJson(options.outputFile, payload);
	writeJson(options.progressFile, buildProgress(options, summary, run, discoveryState));

	const discoveryCandidates = sortCandidates(
		pendingDiscoveryCandidateIds
			.map((id) => candidates.get(id))
			.filter((candidate) => candidate != null)
	);
	if (discoveryCandidates.length > 0) {
		discoveryTrancheIndex++;
		writeTranche(options.trancheDir, 'discovery', discoveryTrancheIndex, {
			generatedAt: new Date().toISOString(),
			source: 'strava-explore',
			tranche: {
				type: 'discovery',
				index: discoveryTrancheIndex,
				candidateCount: discoveryCandidates.length,
				cumulativeCandidates: candidates.size,
				exploredTiles
			},
			run,
			summary,
			discoveryState,
			candidates: discoveryCandidates
		});
	}

	const trancheSegments = enriched.slice(trancheStart);
	if (trancheSegments.length > 0) {
		trancheIndex++;
		writeTranche(options.trancheDir, 'enrichment', trancheIndex, {
			generatedAt: new Date().toISOString(),
			source: 'strava-explore',
			tranche: {
				type: 'enrichment',
				index: trancheIndex,
				segmentCount: trancheSegments.length,
				cumulativeSegments: enriched.length
			},
			run,
			summary,
			discoveryState,
			segments: trancheSegments
		});
	}

	if (stopReason) {
		console.warn(`[strava-explore] stopped: ${stopReason.message}`);
		return;
	}

	if (!runComplete) {
		console.log(
			`[strava-explore] paused: phase=${finalPhase}, pending discovery tiles=${summary.pendingDiscoveryTiles}, remaining candidates=${summary.remainingCandidates}`
		);
		return;
	}

	console.log(
		`[strava-explore] complete: ${payload.summary.qualifiedRideSegments} ride + ${payload.summary.qualifiedRunSegments} run segments passed thresholds`
	);
}

main().catch((error) => {
	console.error('[strava-explore] failed:', error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});

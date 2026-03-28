#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.strava-explore.local');
const OUTPUT_FILE = path.join(ROOT, 'data', 'strava-explore.generated.json');

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
	maxDepth: 3,
	minRequestGapMs: 10_000,
	tileLimit: Infinity,
	segmentLimit: Infinity,
	outputFile: OUTPUT_FILE
};

function printUsage() {
	console.log(`Usage: npm run strava:explore -- [options]

Options:
  --max-depth=N           Recursive split depth for dense Marin tiles (default: ${DEFAULTS.maxDepth})
  --min-gap-ms=N          Minimum gap between Strava API requests (default: ${DEFAULTS.minRequestGapMs})
  --tile-limit=N          Stop after exploring N tiles (default: unlimited)
  --segment-limit=N       Stop after enriching N discovered segments (default: unlimited)
  --output=PATH           Write generated catalog to this file
  --help                  Show this help

Environment:
  This script reads STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN
  from ${path.basename(ENV_FILE)}.

Output:
  ${path.relative(ROOT, OUTPUT_FILE)}
`);
}

function parseArgs(argv) {
	const options = { ...DEFAULTS };

	for (const arg of argv) {
		if (arg === '--help') {
			options.help = true;
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
		if (arg.startsWith('--output=')) {
			options.outputFile = path.resolve(ROOT, arg.split('=')[1]);
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
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

class StravaClient {
	constructor(env, minRequestGapMs) {
		this.env = env;
		this.minRequestGapMs = minRequestGapMs;
		this.accessToken = null;
		this.lastRequestAt = 0;
		this.lastRateLimit = null;
	}

	async auth() {
		const response = await fetch('https://www.strava.com/oauth/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				client_id: this.env.STRAVA_CLIENT_ID,
				client_secret: this.env.STRAVA_CLIENT_SECRET,
				refresh_token: this.env.STRAVA_REFRESH_TOKEN,
				grant_type: 'refresh_token'
			})
		});

		if (!response.ok) {
			throw new Error(`OAuth token exchange failed: ${response.status} ${await response.text()}`);
		}

		const payload = await response.json();
		this.accessToken = payload.access_token;
	}

	async throttledFetch(url) {
		const elapsed = Date.now() - this.lastRequestAt;
		if (elapsed < this.minRequestGapMs) {
			await wait(this.minRequestGapMs - elapsed);
		}

		const response = await fetch(url, {
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				Accept: 'application/json'
			}
		});
		this.lastRequestAt = Date.now();
		this.captureRateLimit(response);

		if (response.status === 429) {
			const cooldown = computeWaitToNextWindowMs();
			console.warn(`[strava-explore] Rate-limited. Cooling down for ${Math.round(cooldown / 1000)}s`);
			await wait(cooldown);
			return this.throttledFetch(url);
		}

		return response;
	}

	captureRateLimit(response) {
		const limitHeader =
			response.headers.get('x-readratelimit-limit') ??
			response.headers.get('x-ratelimit-limit');
		const usageHeader =
			response.headers.get('x-readratelimit-usage') ??
			response.headers.get('x-ratelimit-usage');

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
		const response = await this.throttledFetch(url);

		if (!response.ok) {
			throw new Error(`Explore failed for ${activityType} ${formatBox(box)}: ${response.status} ${await response.text()}`);
		}

		await this.maybePauseForRateLimit();
		const payload = await response.json();
		return Array.isArray(payload.segments) ? payload.segments : [];
	}

	async detail(segmentId) {
		const url = `https://www.strava.com/api/v3/segments/${segmentId}`;
		const response = await this.throttledFetch(url);

		if (!response.ok) {
			throw new Error(`Detail failed for ${segmentId}: ${response.status} ${await response.text()}`);
		}

		await this.maybePauseForRateLimit();
		return response.json();
	}
}

function writeOutput(filename, payload) {
	fs.mkdirSync(path.dirname(filename), { recursive: true });
	fs.writeFileSync(filename, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function buildOutput(segments, options, summary) {
	const sorted = [...segments].sort((a, b) => b.qualityScore - a.qualityScore || b.totalAttempts - a.totalAttempts);
	return {
		generatedAt: new Date().toISOString(),
		source: 'strava-explore',
		options: {
			maxDepth: options.maxDepth,
			minRequestGapMs: options.minRequestGapMs,
			tileLimit: options.tileLimit,
			segmentLimit: options.segmentLimit
		},
		summary,
		recommendedFeatured: {
			ride: sorted
				.filter((segment) => segment.activityType === 'ride' && segment.passesThresholds)
				.slice(0, 25)
				.map((segment) => ({
					id: segment.id,
					name: segment.name,
					startLatlng: segment.startLatlng,
					qualityScore: segment.qualityScore
				})),
			run: sorted
				.filter((segment) => segment.activityType === 'run' && segment.passesThresholds)
				.slice(0, 12)
				.map((segment) => ({
					id: segment.id,
					name: segment.name,
					startLatlng: segment.startLatlng,
					qualityScore: segment.qualityScore
				}))
		},
		segments: sorted
	};
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		printUsage();
		return;
	}

	const env = ensureCredentials();
	const client = new StravaClient(env, options.minRequestGapMs);
	await client.auth();

	const discovered = new Map();
	let exploredTiles = 0;

	for (const activityType of ['ride', 'run']) {
		const queue = MARIN_BOUNDING_BOXES.map((box) => ({ box, depth: 0 }));

		while (queue.length > 0 && exploredTiles < options.tileLimit) {
			const current = queue.shift();
			const segments = await client.explore(current.box, activityType);
			exploredTiles++;

			for (const segment of segments) {
				const existing = discovered.get(segment.id);
				if (existing) {
					existing.discoveryHits += 1;
					existing.discoveredFrom.push({
						activityType,
						bounds: current.box,
						depth: current.depth
					});
					continue;
				}

				discovered.set(segment.id, {
					id: segment.id,
					name: segment.name,
					activityType,
					discoveryHits: 1,
					discoveredFrom: [
						{
							activityType,
							bounds: current.box,
							depth: current.depth
						}
					]
				});
			}

			if (segments.length >= 10 && current.depth < options.maxDepth) {
				queue.push(
					...splitBoundingBox(current.box).map((box) => ({
						box,
						depth: current.depth + 1
					}))
				);
			}
		}
	}

	console.log(
		`[strava-explore] discovered ${discovered.size} unique candidate IDs from ${exploredTiles} Marin tile scans`
	);

	const enriched = [];
	let index = 0;
	for (const candidate of discovered.values()) {
		if (index >= options.segmentLimit) break;
		index++;

		const detail = await client.detail(candidate.id);
		const totalAttempts = detail.effort_count ?? 0;
		const totalAthletes = detail.athlete_count ?? 0;
		const segment = {
			id: detail.id,
			name: detail.name,
			activityType: candidate.activityType,
			polyline: detail.map?.polyline ?? null,
			startLatlng: detail.start_latlng ?? [0, 0],
			endLatlng: detail.end_latlng ?? [0, 0],
			distance: detail.distance ?? 0,
			elevationGain: detail.total_elevation_gain ?? 0,
			avgGrade: detail.average_grade ?? 0,
			climbCategory: detail.climb_category ?? 0,
			totalAttempts,
			totalAthletes,
			discoveryHits: candidate.discoveryHits,
			discoveredFrom: candidate.discoveredFrom
		};

		const rules = QUALITY_RULES[segment.activityType];
		const reasons = qualityReasons(segment, rules);
		const passesThresholds =
			(totalAttempts >= rules.minAttempts || totalAthletes >= rules.minAthletes) &&
			(segment.distance >= rules.minDistance || segment.elevationGain >= rules.minElevationGain);

		enriched.push({
			...segment,
			passesThresholds,
			qualifyingReasons: reasons,
			qualityScore: qualityScore(segment)
		});

		if (index % 10 === 0 || index === discovered.size || index === options.segmentLimit) {
			const payload = buildOutput(enriched, options, {
				discoveredIds: discovered.size,
				exploredTiles,
				enrichedSegments: enriched.length,
				qualifiedRideSegments: enriched.filter(
					(segment) => segment.activityType === 'ride' && segment.passesThresholds
				).length,
				qualifiedRunSegments: enriched.filter(
					(segment) => segment.activityType === 'run' && segment.passesThresholds
				).length
			});
			writeOutput(options.outputFile, payload);
			console.log(
				`[strava-explore] wrote checkpoint: ${enriched.length} enriched -> ${path.relative(ROOT, options.outputFile)}`
			);
		}
	}

	const payload = buildOutput(enriched, options, {
		discoveredIds: discovered.size,
		exploredTiles,
		enrichedSegments: enriched.length,
		qualifiedRideSegments: enriched.filter(
			(segment) => segment.activityType === 'ride' && segment.passesThresholds
		).length,
		qualifiedRunSegments: enriched.filter(
			(segment) => segment.activityType === 'run' && segment.passesThresholds
		).length
	});
	writeOutput(options.outputFile, payload);

	console.log(
		`[strava-explore] complete: ${payload.summary.qualifiedRideSegments} ride + ${payload.summary.qualifiedRunSegments} run segments passed thresholds`
	);
}

main().catch((error) => {
	console.error('[strava-explore] failed:', error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});

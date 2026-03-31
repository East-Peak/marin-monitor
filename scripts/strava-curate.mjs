#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DEFAULTS = {
	inputFile: path.join(ROOT, 'data', 'strava-explore.state.json'),
	outputFile: path.join(ROOT, 'data', 'strava-curated.json'),
	overridesFile: path.join(ROOT, 'data', 'strava-curation.overrides.json'),
	configModuleFile: path.join(ROOT, 'src', 'lib', 'config', 'strava-curated.generated.ts'),
	rideLimit: 100,
	runLimit: 100,
	reviewLimit: 200
};

const RULES = {
	ride: {
		minAthletes: 250,
		minDistance: 800,
		minElevationGain: 40
	},
	run: {
		minAthletes: 100,
		minDistance: 500,
		minElevationGain: 40
	}
};

function printUsage() {
	console.log(`Usage: npm run strava:curate -- [options]

Options:
  --input=PATH         Finished explore/enrichment state file (default: ${path.relative(ROOT, DEFAULTS.inputFile)})
  --output=PATH        Draft curated list output (default: ${path.relative(ROOT, DEFAULTS.outputFile)})
  --overrides=PATH     Force include/exclude overrides (default: ${path.relative(ROOT, DEFAULTS.overridesFile)})
  --config=PATH        Generated TS config module (default: ${path.relative(ROOT, DEFAULTS.configModuleFile)})
  --ride-limit=N       Final curated ride count (default: ${DEFAULTS.rideLimit})
  --run-limit=N        Final curated run count (default: ${DEFAULTS.runLimit})
  --review-limit=N     Review-pool size per activity (default: ${DEFAULTS.reviewLimit})
  --help               Show this help
`);
}

function parseArgs(argv) {
	const options = { ...DEFAULTS };

	for (const arg of argv) {
		if (arg === '--help') {
			options.help = true;
			continue;
		}
		if (arg.startsWith('--input=')) {
			options.inputFile = path.resolve(ROOT, arg.split('=')[1]);
			continue;
		}
		if (arg.startsWith('--output=')) {
			options.outputFile = path.resolve(ROOT, arg.split('=')[1]);
			continue;
		}
		if (arg.startsWith('--overrides=')) {
			options.overridesFile = path.resolve(ROOT, arg.split('=')[1]);
			continue;
		}
		if (arg.startsWith('--config=')) {
			options.configModuleFile = path.resolve(ROOT, arg.split('=')[1]);
			continue;
		}
		if (arg.startsWith('--ride-limit=')) {
			options.rideLimit = Number.parseInt(arg.split('=')[1], 10);
			continue;
		}
		if (arg.startsWith('--run-limit=')) {
			options.runLimit = Number.parseInt(arg.split('=')[1], 10);
			continue;
		}
		if (arg.startsWith('--review-limit=')) {
			options.reviewLimit = Number.parseInt(arg.split('=')[1], 10);
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return options;
}

function writeJson(filename, payload) {
	fs.mkdirSync(path.dirname(filename), { recursive: true });
	fs.writeFileSync(filename, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeText(filename, content) {
	fs.mkdirSync(path.dirname(filename), { recursive: true });
	fs.writeFileSync(filename, content, 'utf8');
}

function readJson(filename) {
	return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function normalizeIdList(value) {
	if (!Array.isArray(value)) return [];
	return Array.from(
		new Set(
			value
				.map((entry) => Number.parseInt(entry, 10))
				.filter((entry) => Number.isFinite(entry) && entry > 0)
		)
	).sort((a, b) => a - b);
}

function normalizeOverrides(value) {
	return {
		forceInclude: {
			ride: normalizeIdList(value?.forceInclude?.ride),
			run: normalizeIdList(value?.forceInclude?.run)
		},
		forceExclude: {
			ride: normalizeIdList(value?.forceExclude?.ride),
			run: normalizeIdList(value?.forceExclude?.run)
		}
	};
}

function ensureOverridesFile(filename) {
	if (!fs.existsSync(filename)) {
		writeJson(filename, normalizeOverrides({}));
	}

	return normalizeOverrides(readJson(filename));
}

function buildFlags(segment, rules) {
	const flags = [];
	if (segment.distance < rules.minDistance) flags.push('short');
	if (segment.elevationGain < rules.minElevationGain) flags.push('flat');
	if (/sprint/i.test(segment.name)) flags.push('sprint-name');
	if (/stairs/i.test(segment.name)) flags.push('stairs-name');
	if (/descent|drop|downhill|\bdh\b/i.test(segment.name)) flags.push('descent-name');
	if (/\btt\b|time trial/i.test(segment.name)) flags.push('tt-name');
	if (/parking|patio|bike lane|gate 5/i.test(segment.name)) flags.push('connector-name');
	return flags;
}

function buildRejectionReasons(segment, activityType, rules, flags) {
	const reasons = [];
	if (segment.totalAthletes < rules.minAthletes) reasons.push('low-traffic');
	if (!(segment.distance >= rules.minDistance || segment.elevationGain >= rules.minElevationGain)) {
		reasons.push('fails-size-threshold');
	}
	if (flags.includes('sprint-name')) reasons.push('sprint-name');
	if (flags.includes('short') && flags.includes('flat')) reasons.push('short-and-flat');
	if (activityType === 'ride' && flags.includes('flat') && segment.distance < 1200) {
		reasons.push('short-flat-ride');
	}
	if (activityType === 'run' && flags.includes('flat') && segment.distance < 1200) {
		reasons.push('short-flat-run');
	}
	return reasons;
}

function passesAutoFilter(segment, activityType, rules) {
	return buildRejectionReasons(segment, activityType, rules, buildFlags(segment, rules)).length === 0;
}

function sortSegments(segments) {
	return [...segments].sort(
		(a, b) =>
			(b.qualityScore ?? 0) - (a.qualityScore ?? 0) ||
			(b.totalAthletes ?? 0) - (a.totalAthletes ?? 0) ||
			(b.totalAttempts ?? 0) - (a.totalAttempts ?? 0) ||
			(b.distance ?? 0) - (a.distance ?? 0)
	);
}

function dedupeById(segments) {
	const seen = new Set();
	const deduped = [];
	for (const segment of segments) {
		if (seen.has(segment.id)) continue;
		seen.add(segment.id);
		deduped.push(segment);
	}
	return deduped;
}

function buildCatalogSegments(curatedEntries, stateSegmentsById) {
	return curatedEntries
		.map((entry) => stateSegmentsById.get(entry.id))
		.filter((segment) => segment != null)
		.map((segment) => ({
			id: segment.id,
			name: segment.name,
			activityType: segment.activityType,
			polyline: segment.polyline ?? null,
			startLatlng: segment.startLatlng,
			endLatlng: segment.endLatlng,
			distance: segment.distance ?? 0,
			elevationGain: segment.elevationGain ?? 0,
			avgGrade: segment.avgGrade ?? 0,
			climbCategory: segment.climbCategory ?? 0,
			totalAttempts: segment.totalAttempts ?? 0,
			totalAthletes: segment.totalAthletes ?? 0
		}));
}

function buildConfigModule(seedSegments, summary) {
	const lines = [
		"import type { StravaSeedSegment } from '$lib/types/strava';",
		'',
		'// Generated by `npm run strava:curate`. Do not hand-edit.',
		`export const STRAVA_CURATED_RIDE_COUNT = ${summary.curatedRideCount};`,
		`export const STRAVA_CURATED_RUN_COUNT = ${summary.curatedRunCount};`,
		'',
		'export const CURATED_STRAVA_SEGMENTS: StravaSeedSegment[] = ['
	];

	for (const segment of seedSegments) {
		lines.push(
			`\t{ id: ${segment.id}, name: ${JSON.stringify(segment.name)}, activityType: ${JSON.stringify(segment.activityType)}, startLatlng: [${segment.startLatlng[0]}, ${segment.startLatlng[1]}] },`
		);
	}

	lines.push('];', '');
	return `${lines.join('\n')}\n`;
}

function toDraftEntry(segment, activityType, rules, overrides) {
	const forcedInclude = overrides.include.has(segment.id);
	const forcedExclude = overrides.exclude.has(segment.id);
	const flags = buildFlags(segment, rules);
	const rejectionReasons = buildRejectionReasons(segment, activityType, rules, flags);
	const autoEligible = rejectionReasons.length === 0;
	const reasons = [];

	if (forcedInclude) reasons.push('force-include');
	if (segment.totalAthletes >= rules.minAthletes) reasons.push('traffic');
	if (segment.distance >= rules.minDistance) reasons.push('distance');
	if (segment.elevationGain >= rules.minElevationGain) reasons.push('elevation');
	if (segment.passesThresholds) reasons.push('passes-thresholds');

	return {
		id: segment.id,
		name: segment.name,
		activityType,
		startLatlng: segment.startLatlng,
		distance: segment.distance,
		elevationGain: segment.elevationGain,
		avgGrade: segment.avgGrade,
		climbCategory: segment.climbCategory,
		totalAttempts: segment.totalAttempts,
		totalAthletes: segment.totalAthletes,
		qualityScore: segment.qualityScore,
		passesThresholds: Boolean(segment.passesThresholds),
		autoEligible,
		forcedInclude,
		forcedExclude,
		flags,
		reasons,
		rejectionReasons
	};
}

function buildActivityDraft(segments, activityType, options, overrides) {
	const rules = RULES[activityType];
	const include = new Set(overrides.forceInclude[activityType]);
	const exclude = new Set(overrides.forceExclude[activityType]);
	const sorted = sortSegments(segments.filter((segment) => segment.activityType === activityType));
	const draftEntries = sorted.map((segment) =>
		toDraftEntry(segment, activityType, rules, { include, exclude })
	);

	const autoEligible = draftEntries.filter((segment) => !segment.forcedExclude && segment.autoEligible);
	const forcedEntries = draftEntries.filter((segment) => !segment.forcedExclude && segment.forcedInclude);
	const combined = dedupeById([...forcedEntries, ...autoEligible]);

	const curatedLimit = activityType === 'ride' ? options.rideLimit : options.runLimit;
	const curated = combined.slice(0, curatedLimit);
	const reviewPool = combined.slice(0, options.reviewLimit);
	const excludedPreview = draftEntries
		.filter((segment) => segment.forcedExclude || !segment.autoEligible)
		.slice(0, 50);

	return {
		rules,
		sourceCount: draftEntries.length,
		autoEligibleCount: autoEligible.length,
		forcedIncludeCount: forcedEntries.length,
		forcedExcludeCount: draftEntries.filter((segment) => segment.forcedExclude).length,
		curated,
		reviewPool,
		excludedPreview,
		seedSegments: curated.map((segment) => ({
			id: segment.id,
			name: segment.name,
			activityType: segment.activityType,
			startLatlng: segment.startLatlng
		}))
	};
}

function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		printUsage();
		return;
	}

	const state = readJson(options.inputFile);
	if (!Array.isArray(state.segments) || state.segments.length === 0) {
		throw new Error(`No enriched segments found in ${path.relative(ROOT, options.inputFile)}`);
	}
	const stateSegmentsById = new Map(state.segments.map((segment) => [segment.id, segment]));

	const overrides = ensureOverridesFile(options.overridesFile);
	const ride = buildActivityDraft(state.segments, 'ride', options, overrides);
	const run = buildActivityDraft(state.segments, 'run', options, overrides);
	const seedSegments = [...ride.seedSegments, ...run.seedSegments];
	const catalogSegments = buildCatalogSegments([...ride.curated, ...run.curated], stateSegmentsById);

	const payload = {
		generatedAt: new Date().toISOString(),
		source: 'strava-curate',
		inputFile: path.relative(ROOT, options.inputFile),
		overridesFile: path.relative(ROOT, options.overridesFile),
		limits: {
			ride: options.rideLimit,
			run: options.runLimit,
			review: options.reviewLimit
		},
		rules: RULES,
		exploreSummary: state.summary ?? null,
		summary: {
			curatedRideCount: ride.curated.length,
			curatedRunCount: run.curated.length,
			reviewRideCount: ride.reviewPool.length,
			reviewRunCount: run.reviewPool.length,
			autoEligibleRideCount: ride.autoEligibleCount,
			autoEligibleRunCount: run.autoEligibleCount
		},
		curated: {
			ride: ride.curated,
			run: run.curated
		},
		reviewPool: {
			ride: ride.reviewPool,
			run: run.reviewPool
		},
		excludedPreview: {
			ride: ride.excludedPreview,
			run: run.excludedPreview
		},
		seedSegments,
		catalog: {
			segments: catalogSegments,
			lastUpdated: new Date().toISOString(),
			lastSuccessfulScrapeAt: new Date().toISOString()
		}
	};

	writeJson(options.outputFile, payload);
	writeText(options.configModuleFile, buildConfigModule(seedSegments, payload.summary));

	console.log(
		`[strava-curate] wrote ${path.relative(ROOT, options.outputFile)} with ${ride.curated.length} ride + ${run.curated.length} run curated segments`
	);
	console.log(
		`[strava-curate] generated ${path.relative(ROOT, options.configModuleFile)}`
	);
	console.log(
		`[strava-curate] review pool: ${ride.reviewPool.length} ride + ${run.reviewPool.length} run`
	);
	console.log(
		`[strava-curate] overrides file: ${path.relative(ROOT, options.overridesFile)}`
	);
}

try {
	main();
} catch (error) {
	console.error('[strava-curate] failed:', String(error));
	process.exitCode = 1;
}

/**
 * Health check endpoint — reports staleness of all data sources.
 * GET /api/health
 *
 * Public (no auth required). Returns JSON with per-source freshness,
 * API key availability, and optional proxy health.
 */
import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';

type Cadence = 'daily' | 'weekly' | 'monthly';

interface DataSourceConfig {
	name: string;
	blobKey: string;
	expectedCadence: Cadence;
	/** Maximum acceptable age in days before the source is considered stale */
	maxAgeDays: number;
}

export interface DataSourceStatus {
	name: string;
	blobKey: string;
	lastUpdated: string | null;
	expectedCadence: Cadence;
	maxAgeDays: number;
	isStale: boolean;
	ageDays: number | null;
	status: 'ok' | 'stale' | 'error';
	error?: string;
}

/** All monitored data sources and their freshness expectations */
export const _DATA_SOURCES: DataSourceConfig[] = [
	{ name: 'Gas Prices', blobKey: 'marin-gas-prices.json', expectedCadence: 'daily', maxAgeDays: 2 },
	{ name: 'Housing', blobKey: 'marin-housing.json', expectedCadence: 'monthly', maxAgeDays: 45 },
	{ name: 'Cappuccino Index', blobKey: 'marin-cappuccino.json', expectedCadence: 'weekly', maxAgeDays: 10 },
	{ name: 'Grocery Basket', blobKey: 'marin-grocery-basket.json', expectedCadence: 'weekly', maxAgeDays: 10 },
	{ name: 'Wine Index', blobKey: 'marin-wine-index.json', expectedCadence: 'weekly', maxAgeDays: 10 },
	{ name: 'School Tuition', blobKey: 'marin-school-tuition.json', expectedCadence: 'monthly', maxAgeDays: 45 },
	{ name: 'Fitness', blobKey: 'marin-fitness.json', expectedCadence: 'monthly', maxAgeDays: 45 },
	{ name: 'Driveway', blobKey: 'marin-driveway.json', expectedCadence: 'monthly', maxAgeDays: 45 },
	{ name: 'Composite Index', blobKey: 'marin-composite.json', expectedCadence: 'weekly', maxAgeDays: 10 },
	{ name: 'Police Logs', blobKey: 'marin-police-logs.json', expectedCadence: 'daily', maxAgeDays: 2 },
	{ name: 'Activity', blobKey: 'marin-activity.json', expectedCadence: 'daily', maxAgeDays: 2 },
	{ name: 'EV Charging', blobKey: 'marin-ev-charging.json', expectedCadence: 'daily', maxAgeDays: 2 },
	{ name: 'Strava Segments', blobKey: 'strava-segments.json', expectedCadence: 'weekly', maxAgeDays: 10 },
	{ name: 'Strava Events', blobKey: 'strava-events.json', expectedCadence: 'daily', maxAgeDays: 2 }
];

/** Check a single blob's freshness */
async function checkSource(
	config: DataSourceConfig,
	now: number,
	token: string
): Promise<DataSourceStatus> {
	try {
		const blob = await head(config.blobKey, { token });
		const uploadedAt = blob.uploadedAt?.toISOString() ?? null;
		let ageDays: number | null = null;
		let isStale = false;

		if (uploadedAt) {
			const ageMs = now - new Date(uploadedAt).getTime();
			ageDays = Math.round((ageMs / (24 * 60 * 60 * 1000)) * 10) / 10;
			isStale = ageDays > config.maxAgeDays;
		} else {
			// Blob exists but no uploadedAt — treat as stale
			isStale = true;
		}

		return {
			name: config.name,
			blobKey: config.blobKey,
			lastUpdated: uploadedAt,
			expectedCadence: config.expectedCadence,
			maxAgeDays: config.maxAgeDays,
			isStale,
			ageDays,
			status: isStale ? 'stale' : 'ok'
		};
	} catch {
		return {
			name: config.name,
			blobKey: config.blobKey,
			lastUpdated: null,
			expectedCadence: config.expectedCadence,
			maxAgeDays: config.maxAgeDays,
			isStale: true,
			ageDays: null,
			status: 'error',
			error: 'Blob not found or inaccessible'
		};
	}
}

/** Optionally check the local proxy health */
async function checkProxyHealth(): Promise<Record<string, unknown> | null> {
	try {
		const res = await fetchWithTimeout('http://100.67.183.14:8889/health', {}, 3000);
		if (res.ok) {
			return (await res.json()) as Record<string, unknown>;
		}
		return { reachable: false, status: res.status };
	} catch {
		return null;
	}
}

export const GET: RequestHandler = async () => {
	const now = Date.now();
	const token = env.BLOB_READ_WRITE_TOKEN ?? '';

	// Check all data sources in parallel
	const sources = await Promise.all(
		DATA_SOURCES.map((config) => checkSource(config, now, token))
	);

	// Check API key availability
	const apiKeys = [
		{ name: 'GOOGLE_PLACES_API_KEY', set: !!env.GOOGLE_PLACES_API_KEY },
		{ name: 'NREL_API_KEY', set: !!env.NREL_API_KEY },
		{ name: 'OPEN_CHARGE_MAP_API_KEY', set: !!env.OPEN_CHARGE_MAP_API_KEY },
		{ name: 'BLOB_READ_WRITE_TOKEN', set: !!env.BLOB_READ_WRITE_TOKEN },
		{ name: 'CRON_SECRET', set: !!env.CRON_SECRET },
		{ name: 'API_511_KEY', set: !!env.API_511_KEY }
	];

	// Check proxy health (non-blocking, omitted if unreachable)
	const proxyHealth = await checkProxyHealth();

	const staleCount = sources.filter((s) => s.isStale).length;
	const errorCount = sources.filter((s) => s.status === 'error').length;
	const allOk = staleCount === 0 && errorCount === 0;

	return new Response(
		JSON.stringify(
			{
				status: allOk ? 'healthy' : 'degraded',
				timestamp: new Date().toISOString(),
				summary: {
					total: sources.length,
					ok: sources.filter((s) => s.status === 'ok').length,
					stale: staleCount,
					error: errorCount
				},
				sources,
				apiKeys,
				...(proxyHealth && { proxy: proxyHealth })
			},
			null,
			2
		),
		{
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-cache'
			}
		}
	);
};

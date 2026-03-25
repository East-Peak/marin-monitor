/**
 * Health check endpoint — reports staleness of all data sources.
 * GET /api/health
 */
import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

interface SourceHealth {
	name: string;
	source: 'blob' | 'static' | 'api';
	status: 'ok' | 'stale' | 'error' | 'empty';
	lastUpdated: string | null;
	itemCount: number | null;
	error?: string;
}

async function checkBlob(blobName: string): Promise<{ exists: boolean; uploadedAt: string | null }> {
	try {
		const blob = await head(blobName, { token: env.BLOB_READ_WRITE_TOKEN });
		return { exists: true, uploadedAt: blob.uploadedAt?.toISOString() ?? null };
	} catch {
		return { exists: false, uploadedAt: null };
	}
}

export const GET: RequestHandler = async () => {
	const sources: SourceHealth[] = [];

	// Check police logs blob
	const policeBlob = await checkBlob('marin-police-logs.json');
	sources.push({
		name: 'Police Logs',
		source: 'blob',
		status: policeBlob.exists ? 'ok' : 'error',
		lastUpdated: policeBlob.uploadedAt,
		itemCount: null,
		...(!policeBlob.exists && { error: 'Blob not found' })
	});

	// Check activity blob
	const activityBlob = await checkBlob('marin-activity.json');
	sources.push({
		name: 'Activity',
		source: 'blob',
		status: activityBlob.exists ? 'ok' : 'error',
		lastUpdated: activityBlob.uploadedAt,
		itemCount: null,
		...(!activityBlob.exists && { error: 'Blob not found' })
	});

	// Check gas prices blob
	const gasBlob = await checkBlob('marin-gas-prices.json');
	sources.push({
		name: 'Gas Prices',
		source: 'blob',
		status: gasBlob.exists ? 'ok' : 'error',
		lastUpdated: gasBlob.uploadedAt,
		itemCount: null,
		...(!gasBlob.exists && { error: 'Blob not found' })
	});

	// Check EV charging blob
	const evBlob = await checkBlob('marin-ev-charging.json');
	sources.push({
		name: 'EV Charging',
		source: 'blob',
		status: evBlob.exists ? 'ok' : 'error',
		lastUpdated: evBlob.uploadedAt,
		itemCount: null,
		...(!evBlob.exists && { error: 'Blob not found' })
	});

	// Check housing blob
	const housingBlob = await checkBlob('marin-housing.json');
	sources.push({
		name: 'Housing',
		source: 'blob',
		status: housingBlob.exists ? 'ok' : 'error',
		lastUpdated: housingBlob.uploadedAt,
		itemCount: null,
		...(!housingBlob.exists && { error: 'Blob not found' })
	});

	// Check API key availability
	const keys = [
		{ name: 'GOOGLE_PLACES_API_KEY', set: !!env.GOOGLE_PLACES_API_KEY },
		{ name: 'NREL_API_KEY', set: !!env.NREL_API_KEY },
		{ name: 'OPEN_CHARGE_MAP_API_KEY', set: !!env.OPEN_CHARGE_MAP_API_KEY },
		{ name: 'BLOB_READ_WRITE_TOKEN', set: !!env.BLOB_READ_WRITE_TOKEN },
		{ name: 'CRON_SECRET', set: !!env.CRON_SECRET },
		{ name: 'API_511_KEY', set: !!env.API_511_KEY },
	];

	// Mark stale sources (older than 24h for frequent, 7d for weekly)
	const now = Date.now();
	for (const source of sources) {
		if (source.lastUpdated) {
			const age = now - new Date(source.lastUpdated).getTime();
			const maxAge = source.name === 'Housing' ? 8 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
			if (age > maxAge) {
				source.status = 'stale';
			}
		}
	}

	const allOk = sources.every(s => s.status === 'ok');

	return new Response(JSON.stringify({
		status: allOk ? 'healthy' : 'degraded',
		timestamp: new Date().toISOString(),
		sources,
		apiKeys: keys
	}, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-cache'
		}
	});
};

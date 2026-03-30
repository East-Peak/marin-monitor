/**
 * Daily freshness check cron — logs stale data sources.
 * Schedule: 0 15 * * * (daily at 3pm UTC / 8am Pacific)
 *
 * Checks all data source blobs for staleness. Stale sources are logged
 * with console.error('[STALE]') so they surface in Vercel function logs.
 *
 * TODO: Add email alerting via Resend or webhook integration.
 */
import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { DATA_SOURCES } from '../../health/+server';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const now = Date.now();
	const token = env.BLOB_READ_WRITE_TOKEN ?? '';
	const staleEntries: { name: string; blobKey: string; ageDays: number | null; maxAgeDays: number }[] = [];
	const errors: { name: string; blobKey: string; error: string }[] = [];

	for (const config of DATA_SOURCES) {
		try {
			const blob = await head(config.blobKey, { token });
			const uploadedAt = blob.uploadedAt?.toISOString() ?? null;

			if (uploadedAt) {
				const ageMs = now - new Date(uploadedAt).getTime();
				const ageDays = Math.round((ageMs / (24 * 60 * 60 * 1000)) * 10) / 10;
				if (ageDays > config.maxAgeDays) {
					staleEntries.push({
						name: config.name,
						blobKey: config.blobKey,
						ageDays,
						maxAgeDays: config.maxAgeDays
					});
				}
			} else {
				staleEntries.push({
					name: config.name,
					blobKey: config.blobKey,
					ageDays: null,
					maxAgeDays: config.maxAgeDays
				});
			}
		} catch {
			errors.push({
				name: config.name,
				blobKey: config.blobKey,
				error: 'Blob not found or inaccessible'
			});
		}
	}

	// Log stale sources prominently so they show up in Vercel logs
	if (staleEntries.length > 0) {
		for (const entry of staleEntries) {
			console.error(
				`[STALE] ${entry.name} (${entry.blobKey}): ${entry.ageDays ?? '?'} days old, max allowed ${entry.maxAgeDays} days`
			);
		}
	}

	for (const entry of errors) {
		console.error(`[ERROR] ${entry.name} (${entry.blobKey}): ${entry.error}`);
	}

	const totalProblems = staleEntries.length + errors.length;
	if (totalProblems === 0) {
		console.log(`[check-freshness] All ${DATA_SOURCES.length} data sources are fresh.`);
	} else {
		console.error(
			`[check-freshness] ${totalProblems} problem(s): ${staleEntries.length} stale, ${errors.length} errors out of ${DATA_SOURCES.length} sources.`
		);
	}

	return new Response(
		JSON.stringify(
			{
				ok: totalProblems === 0,
				timestamp: new Date().toISOString(),
				totalSources: DATA_SOURCES.length,
				stale: staleEntries,
				errors
			},
			null,
			2
		),
		{
			status: totalProblems === 0 ? 200 : 207,
			headers: { 'Content-Type': 'application/json' }
		}
	);
};

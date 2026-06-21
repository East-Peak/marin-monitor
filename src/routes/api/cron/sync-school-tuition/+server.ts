import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { computeSchoolSnapshot } from '$lib/server/scrapers/school-tuition';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { SCHOOL_TUITION_BLOB_KEY, MAX_SCHOOL_HISTORY } from '$lib/config/schools';
import type { RequestHandler } from './$types';
import type { SchoolIndexData, SchoolSnapshot } from '$lib/types/school';

export const config = { maxDuration: 60 };

/** Strip schools[] from a snapshot to keep history entries small */
function toHistoryEntry(snapshot: SchoolSnapshot): {
	timestamp: string;
	medianHouseholdIncome: number;
	tiers: SchoolSnapshot['tiers'];
	cumulativeK12: number;
} {
	return {
		timestamp: snapshot.timestamp,
		medianHouseholdIncome: snapshot.medianHouseholdIncome,
		tiers: snapshot.tiers,
		cumulativeK12: snapshot.cumulativeK12
	};
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		const snapshot = computeSchoolSnapshot();

		// Read existing blob to append history
		let existing: SchoolIndexData = { current: null, history: [] };
		try {
			const blob = await head(SCHOOL_TUITION_BLOB_KEY, { token: env.BLOB_READ_WRITE_TOKEN });
			const res = await fetch(blob.downloadUrl, {
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			});
			if (res.ok) {
				existing = (await res.json()) as SchoolIndexData;
			}
		} catch {
			// No existing blob -- start fresh
		}

		// Append to history (capped), omitting schools[] from history entries
		const history = [toHistoryEntry(snapshot), ...existing.history].slice(0, MAX_SCHOOL_HISTORY);

		const data: SchoolIndexData = {
			current: snapshot,
			history
		};

		await put(SCHOOL_TUITION_BLOB_KEY, JSON.stringify(data), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		const tierSummary = snapshot.tiers
			.map((t) => `${t.label}: $${t.avgTuition.toLocaleString()} (${t.pctOfMedianIncome}%)`)
			.join(', ');

		console.log(
			`[sync-school-tuition] OK: ${tierSummary}, K-12 cumulative $${snapshot.cumulativeK12.toLocaleString()} in ${Date.now() - start}ms`
		);

		return new Response(
			JSON.stringify({
				ok: true,
				tiers: snapshot.tiers.map((t) => ({
					level: t.level,
					avgTuition: t.avgTuition,
					pctOfMedianIncome: t.pctOfMedianIncome
				})),
				schoolCount: snapshot.schools.length,
				cumulativeK12: snapshot.cumulativeK12
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[sync-school-tuition] FAILED after ${Date.now() - start}ms:`, message);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

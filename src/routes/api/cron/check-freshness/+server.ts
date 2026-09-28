/**
 * Daily freshness check cron.
 * Schedule: 0 15 * * * (daily at 3pm UTC / 8am Pacific)
 *
 * Classifies every source with the same evaluator as /api/health and returns
 * 503 when anything is degraded, so the Vercel cron run itself fails rather
 * than logging a 2xx. Each problem is also logged with console.error.
 *
 * TODO: Alerting belongs to an independent monitor on /api/health (G0).
 */
import { env } from '$env/dynamic/private';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { buildHealthReport } from '$lib/server/health/report';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const now = new Date();
	const report = await buildHealthReport(env.BLOB_READ_WRITE_TOKEN ?? '', now);

	for (const source of report.sources) {
		if (source.status === 'ok' || source.status === 'reference') continue;
		console.error(
			`[${source.status.toUpperCase()}] ${source.name}: ${source.reason ?? source.status} (age ${source.ageDays ?? '?'}d, max ${source.maxAgeDays}d)`
		);
	}
	for (const subsource of report.subsources) {
		console.error(`[UNAVAILABLE] ${subsource.parent} › ${subsource.name}: ${subsource.problem}`);
	}
	console.log(
		`[check-freshness] ${report.status}: ${JSON.stringify(report.summary)}, ${report.subsources.length} subsource failure(s)`
	);

	return new Response(JSON.stringify({ ...report, timestamp: now.toISOString() }, null, 2), {
		status: report.status === 'healthy' ? 200 : 503,
		headers: { 'Content-Type': 'application/json' }
	});
};

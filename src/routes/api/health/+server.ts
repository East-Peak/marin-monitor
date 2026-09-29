/**
 * Health check endpoint — the truthful freshness contract for every data source.
 * GET /api/health
 *
 * Public: 200 only when every failure is covered by an active accepted
 * exception (inventory.ts) — i.e. "no unaccepted failure", never "all data
 * healthy"; `status` and each source's status stay factual. 503 otherwise, so
 * a plain uptime monitor sees any new degradation. Internal diagnostics (API key
 * presence, proxy health, blob keys) are included only with cron auth.
 */
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { hasValidCronAuth } from '$lib/server/cron-auth';
import { buildHealthReport, inventoryBlobKeys } from '$lib/server/health/report';
import type { HealthReport } from '$lib/server/health/evaluate';
import type { RequestHandler } from './$types';

/** Optionally check the local proxy health */
async function checkProxyHealth(
	proxyUrl: string,
	proxySecret: string
): Promise<Record<string, unknown> | null> {
	try {
		const healthUrl = new URL('/health', proxyUrl).toString();
		const res = await fetchWithTimeout(
			healthUrl,
			{
				headers: {
					Authorization: `Bearer ${proxySecret}`
				}
			},
			3000
		);
		if (res.ok) {
			return (await res.json()) as Record<string, unknown>;
		}
		return { reachable: false, status: res.status };
	} catch {
		return null;
	}
}

async function internalDiagnostics(report: HealthReport): Promise<Record<string, unknown>> {
	const apiKeys = [
		{ name: 'GOOGLE_PLACES_API_KEY', set: !!env.GOOGLE_PLACES_API_KEY },
		{ name: 'NREL_API_KEY', set: !!env.NREL_API_KEY },
		{ name: 'OPEN_CHARGE_MAP_API_KEY', set: !!env.OPEN_CHARGE_MAP_API_KEY },
		{ name: 'BLOB_READ_WRITE_TOKEN', set: !!env.BLOB_READ_WRITE_TOKEN },
		{ name: 'CRON_SECRET', set: !!env.CRON_SECRET },
		{ name: 'API_511_KEY', set: !!env.API_511_KEY },
		{ name: 'SCRAPE_PROXY_URL', set: !!env.SCRAPE_PROXY_URL },
		{ name: 'SCRAPE_PROXY_SECRET', set: !!env.SCRAPE_PROXY_SECRET }
	];
	const proxyHealth =
		env.SCRAPE_PROXY_URL && env.SCRAPE_PROXY_SECRET
			? await checkProxyHealth(env.SCRAPE_PROXY_URL, env.SCRAPE_PROXY_SECRET)
			: null;
	return {
		apiKeys,
		blobKeys: inventoryBlobKeys(),
		subsources: report.subsources,
		...(proxyHealth ? { proxy: proxyHealth } : {})
	};
}

export const GET: RequestHandler = async ({ request }) => {
	const now = new Date();
	const report = await buildHealthReport(env.BLOB_READ_WRITE_TOKEN ?? '', now);
	const internal = hasValidCronAuth(request) ? await internalDiagnostics(report) : undefined;

	return new Response(
		JSON.stringify(
			{
				status: report.status,
				acceptable: report.acceptable,
				timestamp: now.toISOString(),
				summary: report.summary,
				sources: report.sources,
				subsources: report.subsources.map(({ name, parent, status, accepted }) => ({
					name,
					parent,
					status,
					...(accepted ? { acceptedUntil: accepted.expiresAt } : {})
				})),
				...(internal ? { internal } : {})
			},
			null,
			2
		),
		{
			// 200 = no unaccepted failure, never "all data healthy": see `status`.
			status: report.acceptable ? 200 : 503,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-cache'
			}
		}
	);
};

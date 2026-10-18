/**
 * Server-side proxy for 511.org transit API
 *
 * Keeps the API key on the server side and handles the gzip/BOM quirks.
 * During dev, runs via Vite's built-in server.
 */

import { error, json } from '@sveltejs/kit';
import { get511ApiKey } from '$lib/server/api-keys';
import { get511, memo511 } from '$lib/server/upstream-511';
import type { RequestHandler } from './$types';

const ALLOWED_AGENCIES = new Set(['GG', 'GF', 'MA', 'SA', 'AF']);
/** Success or failure alike, so an outage costs no more of the hourly budget than a good day. */
const HOLD_MS = 15 * 60_000;
/** The whole read, body included. */
const DEADLINE_MS = 10_000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

type Outcome = { ok: true; data: string } | { ok: false; status: number };
/** Per agency: concurrent cold requests make one 511 read. Budget: $lib/server/upstream-511. */
const memo = memo511<Outcome>(HOLD_MS);

export const GET: RequestHandler = async ({ url }) => {
	const agency = url.searchParams.get('agency');

	if (!agency) {
		throw error(400, 'Missing agency parameter');
	}

	if (!ALLOWED_AGENCIES.has(agency)) {
		throw error(400, 'Unknown transit agency');
	}

	const apiKey = get511ApiKey();
	if (!apiKey) {
		return json({ error: 'Service unavailable' }, { status: 503 });
	}

	const read = await memo(agency, () => readAgency(agency, apiKey));
	if (!read.ok)
		throw error(
			read.status,
			read.status === 502 ? 'Failed to fetch transit alerts' : `511 API returned ${read.status}`
		);
	return new Response(read.data, {
		headers: {
			'Content-Type': 'application/json',
			// Alerts change slowly; the feed's own Header.Timestamp says when 511 published them.
			'Cache-Control': 'public, max-age=120, s-maxage=900'
		}
	});
};

async function readAgency(agency: string, apiKey: string): Promise<Outcome> {
	const deadline = new AbortController();
	const timer = setTimeout(() => deadline.abort(), DEADLINE_MS);
	try {
		const { status, body } = await get511(
			`/transit/servicealerts?agency=${agency}&format=json`,
			apiKey,
			deadline.signal,
			'transit'
		);
		if (status !== null && status >= 400) return { ok: false, status };
		// A 200 that isn't an alert feed (or never arrived) is a failure, never a held success.
		if (!isRecord(body) || !Array.isArray(body.Entities)) return { ok: false, status: 502 };
		return { ok: true, data: JSON.stringify(body) };
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Postmark's inbound webhook (email intake v1). POST only.
 *
 * 200 stored, a re-delivery of a stored message, or dropped by rule (account mail) — Postmark stops
 * · 400 not Postmark's JSON · 401 basic auth (GG_INGEST_USER / GG_INGEST_PASS) · 403 not Golden
 * Gate's verified mail to our address (Postmark stops retrying on 403) · 413 over the cap · 422 a
 * bad Date or no Message-ID · 500 unconfigured, or the write failed (Postmark retries).
 * Nothing is stored unless every check passes; the payload and credentials are never logged.
 */
import { env } from '$env/dynamic/private';
import { basicAuthOk, parsePostmark, verifyPostmark } from '$lib/server/email-intake/postmark';
import { ingestEmail } from '$lib/server/email-intake/store';
import { cronErrorResponse } from '$lib/server/cron-response';
import { readStreamCapped } from '$lib/server/news/bounded-fetch';
import { vercelBlobApi } from '$lib/server/news/vercel-blob-api';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 15 };
/** Golden Gate's largest sample is 29 KB; attachments are not wanted. */
const MAX_PAYLOAD_BYTES = 512 * 1024;
const RUN_BUDGET_MS = 10_000;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }
	});

export const POST: RequestHandler = async ({ request }) => {
	const start = Date.now();
	const { GG_INGEST_USER, GG_INGEST_PASS, GG_INGEST_TO, BLOB_READ_WRITE_TOKEN } = env;
	if (!GG_INGEST_USER || !GG_INGEST_PASS || !GG_INGEST_TO || !BLOB_READ_WRITE_TOKEN)
		return json(500, { error: 'not configured' });
	if (!basicAuthOk(request.headers.get('authorization'), GG_INGEST_USER, GG_INGEST_PASS))
		return json(401, { error: 'unauthorized' }, { 'WWW-Authenticate': 'Basic realm="inbound"' });

	const signal = AbortSignal.timeout(RUN_BUDGET_MS);
	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > MAX_PAYLOAD_BYTES) return json(413, { error: 'too large' });
	const body = request.body
		? await readStreamCapped(request.body, MAX_PAYLOAD_BYTES, signal)
		: null;
	if (request.body && body === null) return json(413, { error: 'too large' });

	let raw: unknown;
	try {
		raw = JSON.parse(body?.text ?? '');
	} catch {
		return json(400, { error: 'not json' });
	}
	const payload = parsePostmark(raw);
	if (!payload) return json(400, { error: 'not a postmark inbound payload' });
	const verdict = verifyPostmark(payload, GG_INGEST_TO, Date.now());
	if (!verdict.ok) {
		console.log(`[inbound-postmark] rejected ${verdict.status}: ${verdict.reason}`);
		return json(verdict.status, { error: 'rejected' });
	}
	try {
		const result = await ingestEmail(payload, {
			api: vercelBlobApi(BLOB_READ_WRITE_TOKEN),
			inbound: GG_INGEST_TO,
			now: () => new Date(),
			signal
		});
		console.log(`[inbound-postmark] ${JSON.stringify(result)} in ${Date.now() - start}ms`);
		return json(200, result);
	} catch (err) {
		return cronErrorResponse('inbound-postmark', err, start);
	}
};

/**
 * One sync-gg-alerts run (GGALERT1): read goldengate.org/alerts/ once and write the gg-alerts blob.
 * A failed read records its failure and keeps the last good read with that read's own time. If the
 * previous blob can't be read, the run writes nothing (it would erase the last good read); one that
 * reads but isn't a valid blob is replaced.
 * The write is conditional on the blob read, so two overlapping runs can't interleave.
 */
import { GG_ALERTS_PAGE, isGgAlertsBlob, type GgAlert, type GgAlertsBlob } from '$lib/gg-alerts';
import type { BoundedFetchResult } from '$lib/server/news/bounded-fetch';
import { BlobWriteConflict, type BlobApi } from '$lib/server/news/snapshot-store';
import { parseGgAlertsPage } from './parse';

export const GG_ALERTS_BLOB_KEY = 'gg-alerts.json';

export interface GgSyncDeps {
	api: BlobApi;
	fetchPage: (url: string, signal: AbortSignal) => Promise<BoundedFetchResult>;
	now: () => Date;
	signal: AbortSignal;
}

export type GgSyncResult =
	| { outcome: 'read'; alerts: number }
	| { outcome: 'failed'; error: string }
	| { outcome: 'superseded' };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

function lastBlob(text: string | undefined): GgAlertsBlob | null {
	try {
		const parsed: unknown = text === undefined ? null : JSON.parse(text);
		return isGgAlertsBlob(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

async function readPage(deps: GgSyncDeps): Promise<{ alerts: GgAlert[] } | { error: string }> {
	try {
		const page = await deps.fetchPage(GG_ALERTS_PAGE, deps.signal);
		if (!page.ok) return { error: `${page.reason}: ${page.detail}` };
		return { alerts: parseGgAlertsPage(page.text).alerts };
	} catch (err) {
		return { error: message(err) };
	}
}

export async function runGgAlertsSync(deps: GgSyncDeps): Promise<GgSyncResult> {
	const previous = await deps.api.read(GG_ALERTS_BLOB_KEY, deps.signal);
	const last = lastBlob(previous?.text);
	const read = await readPage(deps);
	const at = deps.now().toISOString();
	const blob: GgAlertsBlob =
		'alerts' in read
			? { checkedAt: at, lastSuccessfulScrapeAt: at, alerts: read.alerts, lastFailure: null }
			: {
					checkedAt: at,
					lastSuccessfulScrapeAt: last?.lastSuccessfulScrapeAt ?? null,
					alerts: last?.alerts ?? null,
					lastFailure: { at, error: read.error }
				};
	if (!isGgAlertsBlob(blob)) throw new Error('gg-alerts: refusing to write an invalid blob');
	try {
		await deps.api.write(
			GG_ALERTS_BLOB_KEY,
			JSON.stringify(blob),
			previous ? { ifMatch: previous.etag } : { createOnly: true },
			deps.signal
		);
	} catch (err) {
		if (err instanceof BlobWriteConflict) return { outcome: 'superseded' };
		throw err;
	}
	return 'alerts' in read
		? { outcome: 'read', alerts: read.alerts.length }
		: { outcome: 'failed', error: read.error };
}

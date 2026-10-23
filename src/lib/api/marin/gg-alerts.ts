/**
 * Client-side reader for Golden Gate's own alert list (GGALERT1): the blob sync-gg-alerts writes.
 * A body that isn't a valid blob is a failed read, never an empty list.
 */
import { isGgAlertsBlob, type GgAlertsBlob } from '$lib/gg-alerts';
import { createDataFetcherWithStatus } from './data-fetcher';

export const fetchGgAlertsWithStatus = createDataFetcherWithStatus<GgAlertsBlob | null>(
	'/api/data/gg-alerts',
	'GG alerts',
	null,
	(body) => {
		if (!isGgAlertsBlob(body)) throw new Error('gg-alerts: not a valid blob');
		return body;
	}
);

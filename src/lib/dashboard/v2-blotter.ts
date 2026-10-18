/**
 * The v2 map's sheriff blotter (NEWSPIN1): the controller's own read, judged by its part's
 * status entry. Reports count on their town's dot, never as points (the county's point is finer
 * than its hundred-block mask). The rolling window is re-applied on every render, so a read
 * kept after a failure ages out instead of staying forever. A count is a number only when the
 * read can vouch for it: "0 reports" only from a fresh ok read.
 */
import type { BlotterRead } from '$lib/api/marin/blotter';
import { BLOTTER_HOURS } from '$lib/api/marin/blotter';
import type { NewsItem } from '$lib/types';
import { measuredFromEntry } from './measured';
import { formatAsOf } from './pacific-time';
import type { SourceStatusEntry } from './source-status';

const HOUR_MS = 3_600_000;

export interface BlotterView {
	state: 'loading' | 'value' | 'unknown' | 'unavailable';
	asOf: number | null;
	/** "Kept from …" when the rows outlived a failed read. */
	kept: string | null;
	/** Shown reports inside the window, newest first. */
	reports: NewsItem[];
	/** Shown reports in the window; null whenever the read can't vouch for the number. */
	count: number | null;
	/** Reports in the window not shown (not a property or public-place report); null likewise. */
	hidden: number | null;
	/** The read held only the latest rows the county returns. */
	capped: boolean;
}

export function blotterView(
	entry: SourceStatusEntry | undefined,
	read: BlotterRead | null,
	now: number
): BlotterView {
	const m = measuredFromEntry(entry, read, 'Sheriff blotter', now);
	if (m.kind !== 'value')
		return {
			state: m.kind,
			asOf: null,
			kept: null,
			reports: [],
			count: null,
			hidden: null,
			capped: false
		};
	const since = now - BLOTTER_HOURS * HOUR_MS;
	const reports = m.value.reports.filter((r) => r.timestamp >= since);
	const hidden = m.value.hiddenAt.filter((t) => t >= since).length;
	const fresh = m.retainedAfter === null && m.observedAt !== null;
	const kept =
		m.retainedAfter === null
			? null
			: `Kept from ${m.observedAt === null ? 'an earlier read' : formatAsOf(m.observedAt, now)} · ${m.retainedAfter}`;
	return {
		state: 'value',
		asOf: m.observedAt,
		kept,
		reports,
		count: fresh || reports.length ? reports.length : null,
		hidden: fresh ? hidden : null,
		capped: m.value.capped
	};
}

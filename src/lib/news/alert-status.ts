/**
 * What may be called an alert, on the TV and the legacy page. An alert comes from a source that
 * publishes alerts, flagged by that source's own adapter, and is active. A headline's words never
 * make one: city pages carry boilerplate like "fire lane". Status we can't establish is not
 * claimed active; the item stays in the news, unbadged.
 */
import { isWithinWindow } from './recency';
import type { PublishedAtStatus } from './feed-date';

/** Nixle police alerts, 511 transit, NPS park alerts, USGS quakes, by their adapters' ids. */
const PUBLISHES_ALERTS = /^(nixle|511|nps|usgs)-/;
/** Nixle and USGS publish no end: a dated alert holds for a day. */
export const ALERT_WINDOW_MS = 24 * 3_600_000;
/** How long a live list's last read may vouch for its alerts through failed refreshes. */
export const LIVE_ALERT_MAX_AGE_MS = 3_600_000;

/** 511 and NPS answer with what is current now, so being listed is the status. */
export interface AlertLive {
	seenAt: number;
	/** The publisher's own active periods; none given means active while listed. */
	periods: readonly { start: number | null; end: number | null }[];
}

interface AlertFields {
	id: string;
	isAlert?: boolean;
	timestamp?: number;
	publishedAtStatus?: PublishedAtStatus;
	alertLive?: AlertLive;
}

export const isPublisherAlert = (item: AlertFields): boolean =>
	item.isAlert === true && PUBLISHES_ALERTS.test(item.id);

export function isActiveAlert(item: AlertFields, now: number): boolean {
	if (!isPublisherAlert(item)) return false;
	const { alertLive: live } = item;
	if (!live)
		return isWithinWindow({ ...item, timestamp: item.timestamp ?? NaN }, ALERT_WINDOW_MS, now);
	const inPeriod =
		live.periods.length === 0 ||
		live.periods.some((p) => (p.start ?? -Infinity) <= now && now < (p.end ?? Infinity));
	return inPeriod && now - live.seenAt <= LIVE_ALERT_MAX_AGE_MS;
}

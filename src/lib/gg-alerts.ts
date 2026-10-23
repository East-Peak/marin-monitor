/**
 * Golden Gate's own alert list (goldengate.org/alerts/), as the sync-gg-alerts producer stores it
 * and Getting Around reads it (GGALERT1). The page gives no publish times, so a read is dated only
 * by when we checked it. One validator serves the producer (before a write) and the reader.
 */

/** The page every Golden Gate row links to. */
export const GG_ALERTS_PAGE = 'https://www.goldengate.org/alerts/';

/** One notice, once: the page lists it under each route it covers, under one ID. */
export interface GgAlert {
	/** The page's own alert ID (its anchor name). */
	id: string;
	/** The headline as written, whitespace collapsed. */
	headline: string;
	/** The route groups it is listed under, in page order ("Larkspur Ferry", "Route 114"). */
	routes: string[];
}

export interface GgAlertsBlob {
	/** This run's check time. */
	checkedAt: string;
	/** The last good read's check time; null until a read has succeeded. */
	lastSuccessfulScrapeAt: string | null;
	/** The last good read's alerts, standing notices dropped; null until a read has succeeded. */
	alerts: GgAlert[] | null;
	/** This run's failure; null when this run's read succeeded. */
	lastFailure: { at: string; error: string } | null;
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isTime = (v: unknown): v is string => isString(v) && Number.isFinite(Date.parse(v));
const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

function isAlert(v: unknown): v is GgAlert {
	return (
		isRecord(v) &&
		isString(v.id) &&
		v.id !== '' &&
		isString(v.headline) &&
		v.headline !== '' &&
		Array.isArray(v.routes) &&
		v.routes.length > 0 &&
		v.routes.every(isString)
	);
}

/** A good read and its time come together; a failure names its time and error. */
export function isGgAlertsBlob(v: unknown): v is GgAlertsBlob {
	if (!isRecord(v) || !isTime(v.checkedAt)) return false;
	const good =
		v.lastSuccessfulScrapeAt === null
			? v.alerts === null
			: isTime(v.lastSuccessfulScrapeAt) && Array.isArray(v.alerts) && v.alerts.every(isAlert);
	const failure =
		v.lastFailure === null ||
		(isRecord(v.lastFailure) && isTime(v.lastFailure.at) && isString(v.lastFailure.error));
	return good && failure;
}

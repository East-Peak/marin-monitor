/**
 * 511.org Transit adapter for Marin County
 *
 * Fetches service alerts for Marin-area transit agencies:
 * - GG: Golden Gate Transit (buses)
 * - GF: Golden Gate Ferry (Larkspur, Sausalito, Tiburon ferries)
 * - MA: Marin Transit (local buses)
 * - SA: SMART (Sonoma-Marin Area Rail Transit)
 * - AF: Angel Island Tiburon Ferry
 *
 * Uses GTFS-RT ServiceAlerts format (JSON).
 * API key required — get one at https://511.org/open-data/token
 */

import type { NewsItem } from '$lib/types';
import { logger } from '$lib/config/api';
import { fetchAndRead, type OwnerOptions } from './fetch-helpers';

/** Marin-relevant transit agencies */
export const MARIN_AGENCIES = [
	{ id: 'GG', name: 'Golden Gate Transit' },
	{ id: 'GF', name: 'Golden Gate Ferry' },
	{ id: 'MA', name: 'Marin Transit' },
	{ id: 'SA', name: 'SMART' },
	{ id: 'AF', name: 'Angel Island Ferry' }
] as const;

/** GTFS-RT ServiceAlert entity from 511 */
interface GtfsAlertEntity {
	Id: string;
	Alert: {
		ActivePeriods?: Array<{ Start?: number; End?: number }>;
		InformedEntities?: Array<{
			AgencyId?: string;
			RouteId?: string;
			StopId?: string;
		}>;
		Cause?: number;
		Effect?: number;
		HeaderText?: {
			Translations?: Array<{ Text: string; Language?: string }>;
		};
		DescriptionText?: {
			Translations?: Array<{ Text: string; Language?: string }>;
		};
		Url?: {
			Translations?: Array<{ Text: string; Language?: string }>;
		};
	};
}

interface GtfsResponse {
	Header?: { Timestamp?: number };
	Entities: GtfsAlertEntity[];
}

/** One 511 alert as v2 shows it: its own words and its own link, nothing invented. */
interface TransitAlertRow {
	id: string;
	title: string;
	/** The alert's own http(s) link, or null: never a guessed page. */
	url: string | null;
}

/** One agency's read, for v2's Getting Around: alerts in feed order and the feed's own time, or the failure. */
export interface TransitAgencyRead {
	id: string;
	name: string;
	/** null when this agency's read failed. */
	alerts: TransitAlertRow[] | null;
	/** GTFS-RT `Header.Timestamp` (epoch ms); null when the feed carries none. */
	observedAt: number | null;
	error: string | null;
}

const httpUrl = (url: string | undefined): string | null =>
	url && /^https?:\/\//i.test(url) ? url : null;
const feedTime = (seconds: unknown): number | null =>
	typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;

/** The alert's header plus its routes, exactly as the legacy item title reads. */
function alertTitle(alert: GtfsAlertEntity['Alert']): string {
	const header = alert.HeaderText?.Translations?.[0]?.Text || 'Service Alert';
	const routes = (alert.InformedEntities || [])
		.filter((ie) => ie.RouteId)
		.map((ie) => ie.RouteId)
		.filter((v, i, a) => a.indexOf(v) === i); // dedupe
	return routes.length > 0 ? `${header} (${routes.join(', ')})` : header;
}

/**
 * Fetch service alerts for a single agency via the first-party API proxy.
 */
async function fetchAgencyAlerts(
	agencyId: string,
	agencyName: string,
	signal?: AbortSignal
): Promise<{
	items: NewsItem[];
	alerts: TransitAlertRow[] | null;
	observedAt: number | null;
	error?: string;
}> {
	try {
		logger.log('511', `Fetching ${agencyName} alerts`);
		const proxyUrl = `/api/transit?agency=${agencyId}`;
		const data = await fetchAndRead<GtfsResponse>(
			proxyUrl,
			{ headers: { Accept: 'application/json' }, signal },
			async (proxyResponse) => {
				if (!proxyResponse.ok)
					throw new Error(`Transit proxy failed for ${agencyId}: ${proxyResponse.status}`);
				return (await proxyResponse.json()) as GtfsResponse;
			}
		);

		return {
			items: data.Entities.map((entity) => entityToNewsItem(entity, agencyId, agencyName)),
			alerts: data.Entities.map((entity) => ({
				id: `511-${agencyId}-${entity.Id}`,
				title: alertTitle(entity.Alert),
				url: httpUrl(entity.Alert.Url?.Translations?.[0]?.Text)
			})),
			observedAt: feedTime(data.Header?.Timestamp)
		};
	} catch (error) {
		const msg = `${agencyName}: ${(error as Error).message}`;
		logger.warn('511', msg);
		return { items: [], alerts: null, observedAt: null, error: msg };
	}
}

/**
 * Convert a GTFS-RT alert entity to a NewsItem
 */
function entityToNewsItem(entity: GtfsAlertEntity, agencyId: string, agencyName: string): NewsItem {
	const alert = entity.Alert;
	const description = alert.DescriptionText?.Translations?.[0]?.Text;
	const url = alert.Url?.Translations?.[0]?.Text;

	// Determine timestamp from active periods
	const activePeriod = alert.ActivePeriods?.[0];
	const timestamp = activePeriod?.Start ? activePeriod.Start * 1000 : Date.now();

	// Ferry alerts get special treatment
	const isFerry = ['GF', 'AF'].includes(agencyId);
	const source = isFerry ? `${agencyName}` : `511 – ${agencyName}`;

	return {
		id: `511-${agencyId}-${entity.Id}`,
		title: alertTitle(alert),
		link: url || `https://511.org/transit/service-alerts`,
		timestamp,
		description: description?.slice(0, 300),
		source,
		category: 'safety',
		verification: 'official',
		isAlert: true
	};
}

/**
 * Fetch transit alerts for all Marin agencies.
 * Requests are sequential with a delay to avoid 511.org rate limiting (429s).
 * Once the owner `signal` aborts, no further agency request or delay starts.
 */
export async function fetchTransitAlerts({ signal }: OwnerOptions = {}): Promise<{
	items: NewsItem[];
	errors: string[];
	agencies: TransitAgencyRead[];
}> {
	const allItems: NewsItem[] = [];
	const errors: string[] = [];
	const agencies: TransitAgencyRead[] = [];

	for (let i = 0; i < MARIN_AGENCIES.length; i++) {
		if (signal?.aborted) break;
		const agency = MARIN_AGENCIES[i];
		try {
			const result = await fetchAgencyAlerts(agency.id, agency.name, signal);
			allItems.push(...result.items);
			if (result.error) errors.push(result.error);
			agencies.push({
				id: agency.id,
				name: agency.name,
				alerts: result.alerts,
				observedAt: result.observedAt,
				error: result.error ?? null
			});
		} catch (err) {
			const msg = (err as Error).message || 'Unknown error';
			errors.push(msg);
			agencies.push({
				id: agency.id,
				name: agency.name,
				alerts: null,
				observedAt: null,
				error: msg
			});
		}
		// Small delay between requests to avoid rate limiting
		if (i < MARIN_AGENCIES.length - 1 && !signal?.aborted) {
			await new Promise((r) => setTimeout(r, 500));
		}
	}

	// Sort by timestamp, newest first
	allItems.sort((a, b) => b.timestamp - a.timestamp);

	logger.log('511', `Total transit alerts: ${allItems.length}`);
	return { items: allItems, errors, agencies };
}

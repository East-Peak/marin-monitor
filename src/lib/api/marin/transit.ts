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
import { fetchWithTimeout } from './fetch-helpers';

/** Marin-relevant transit agencies */
const MARIN_AGENCIES = [
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
	Header: { Timestamp: number };
	Entities: GtfsAlertEntity[];
}

/**
 * Fetch service alerts for a single agency via the first-party API proxy.
 */
async function fetchAgencyAlerts(
	agencyId: string,
	agencyName: string
): Promise<{ items: NewsItem[]; error?: string }> {
	try {
		logger.log('511', `Fetching ${agencyName} alerts`);
		const proxyUrl = `/api/transit?agency=${agencyId}`;
		const proxyResponse = await fetchWithTimeout(proxyUrl, {
			headers: { Accept: 'application/json' }
		});
		if (!proxyResponse.ok) {
			throw new Error(`Transit proxy failed for ${agencyId}: ${proxyResponse.status}`);
		}
		const data: GtfsResponse = await proxyResponse.json();

		return {
			items: data.Entities.map((entity) => entityToNewsItem(entity, agencyId, agencyName))
		};
	} catch (error) {
		const msg = `${agencyName}: ${(error as Error).message}`;
		logger.warn('511', msg);
		return { items: [], error: msg };
	}
}

/**
 * Convert a GTFS-RT alert entity to a NewsItem
 */
function entityToNewsItem(entity: GtfsAlertEntity, agencyId: string, agencyName: string): NewsItem {
	const alert = entity.Alert;
	const header = alert.HeaderText?.Translations?.[0]?.Text || 'Service Alert';
	const description = alert.DescriptionText?.Translations?.[0]?.Text;
	const url = alert.Url?.Translations?.[0]?.Text;

	// Get affected routes
	const routes = (alert.InformedEntities || [])
		.filter((ie) => ie.RouteId)
		.map((ie) => ie.RouteId)
		.filter((v, i, a) => a.indexOf(v) === i); // dedupe

	const routeStr = routes.length > 0 ? ` (${routes.join(', ')})` : '';

	// Determine timestamp from active periods
	const activePeriod = alert.ActivePeriods?.[0];
	const timestamp = activePeriod?.Start ? activePeriod.Start * 1000 : Date.now();

	// Ferry alerts get special treatment
	const isFerry = ['GF', 'AF'].includes(agencyId);
	const source = isFerry ? `${agencyName}` : `511 – ${agencyName}`;

	return {
		id: `511-${agencyId}-${entity.Id}`,
		title: `${header}${routeStr}`,
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
 */
export async function fetchTransitAlerts(): Promise<{
	items: NewsItem[];
	errors: string[];
}> {
	const allItems: NewsItem[] = [];
	const errors: string[] = [];

	for (let i = 0; i < MARIN_AGENCIES.length; i++) {
		const agency = MARIN_AGENCIES[i];
		try {
			const result = await fetchAgencyAlerts(agency.id, agency.name);
			allItems.push(...result.items);
			if (result.error) errors.push(result.error);
		} catch (err) {
			errors.push((err as Error).message || 'Unknown error');
		}
		// Small delay between requests to avoid rate limiting
		if (i < MARIN_AGENCIES.length - 1) {
			await new Promise((r) => setTimeout(r, 500));
		}
	}

	// Sort by timestamp, newest first
	allItems.sort((a, b) => b.timestamp - a.timestamp);

	logger.log('511', `Total transit alerts: ${allItems.length}`);
	return { items: allItems, errors };
}

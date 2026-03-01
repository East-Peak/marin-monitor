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

import { TRANSIT_511_API_KEY } from '$lib/config/api';
import type { NewsItem } from '$lib/types';
import { logger } from '$lib/config/api';

const API_BASE = 'https://api.511.org/transit';

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
 * Fetch service alerts for a single agency.
 * Tries local API proxy first (keeps key server-side),
 * falls back to direct 511.org call if proxy unavailable.
 */
async function fetchAgencyAlerts(
	agencyId: string,
	agencyName: string
): Promise<{ items: NewsItem[]; error?: string }> {
	try {
		logger.log('511', `Fetching ${agencyName} alerts`);

		let data: GtfsResponse;

		// Try local proxy first
		try {
			const proxyUrl = `/api/transit?agency=${agencyId}`;
			const proxyResponse = await fetch(proxyUrl);
			if (proxyResponse.ok) {
				data = await proxyResponse.json();
			} else {
				throw new Error('Proxy failed');
			}
		} catch {
			// Fallback: direct call (needs API key in client)
			if (!TRANSIT_511_API_KEY) {
				return { items: [], error: 'No 511 API key configured' };
			}
			const url = `${API_BASE}/servicealerts?api_key=${TRANSIT_511_API_KEY}&agency=${agencyId}&format=json`;
			const response = await fetch(url, {
				headers: { Accept: 'application/json' }
			});
			if (!response.ok) {
				throw new Error(`511 API failed for ${agencyId}: ${response.status}`);
			}
			const text = await response.text();
			const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
			data = JSON.parse(clean);
		}

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
 * Fetch transit alerts for all Marin agencies
 */
export async function fetchTransitAlerts(): Promise<{
	items: NewsItem[];
	errors: string[];
}> {
	if (!TRANSIT_511_API_KEY) {
		logger.warn('511', 'No API key configured — skipping transit alerts');
		return { items: [], errors: ['No 511 API key'] };
	}

	const results = await Promise.allSettled(
		MARIN_AGENCIES.map((agency) => fetchAgencyAlerts(agency.id, agency.name))
	);

	const allItems: NewsItem[] = [];
	const errors: string[] = [];

	for (const result of results) {
		if (result.status === 'fulfilled') {
			allItems.push(...result.value.items);
			if (result.value.error) errors.push(result.value.error);
		} else {
			errors.push(result.reason?.message || 'Unknown error');
		}
	}

	// Sort by timestamp, newest first
	allItems.sort((a, b) => b.timestamp - a.timestamp);

	logger.log('511', `Total transit alerts: ${allItems.length}`);
	return { items: allItems, errors };
}

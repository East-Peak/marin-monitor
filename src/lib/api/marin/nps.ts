/**
 * National Park Service alerts adapter
 *
 * Fetches active alerts for Marin-area parks:
 * - pore: Point Reyes National Seashore
 * - muwo: Muir Woods National Monument
 * - goga: Golden Gate National Recreation Area
 *
 * Uses the free NPS API (DEMO_KEY works, but rate-limited).
 * Get a real key at: https://www.nps.gov/subjects/developer/get-started.htm
 */

import type { NewsItem } from '$lib/types';
import { logger } from '$lib/config/api';

const NPS_BASE = 'https://developer.nps.gov/api/v1';
const NPS_API_KEY = import.meta.env.VITE_NPS_API_KEY || 'DEMO_KEY';
const MARIN_PARKS = 'goga,muwo,pore';

interface NpsAlert {
	id: string;
	title: string;
	description: string;
	parkCode: string;
	category: string; // 'Danger', 'Caution', 'Information', 'Park Closure'
	url: string;
	lastIndexedDate: string;
}

interface NpsResponse {
	total: string;
	data: NpsAlert[];
}

const PARK_NAMES: Record<string, string> = {
	pore: 'Point Reyes',
	muwo: 'Muir Woods',
	goga: 'Golden Gate NRA'
};

/**
 * Fetch active alerts from NPS for Marin-area parks.
 * Returns them as NewsItem[] for the safety or outdoors panel.
 */
export async function fetchNpsAlerts(): Promise<NewsItem[]> {
	try {
		const url = `${NPS_BASE}/alerts?parkCode=${MARIN_PARKS}&api_key=${NPS_API_KEY}`;
		logger.log('NPS', `Fetching alerts for ${MARIN_PARKS}`);

		const response = await fetch(url, {
			headers: { Accept: 'application/json' }
		});

		if (response.status === 429) {
			logger.log('NPS', 'Rate limited (DEMO_KEY). Get a free key at nps.gov/subjects/developer');
			return [];
		}

		if (!response.ok) {
			throw new Error(`NPS API failed: ${response.status}`);
		}

		const data: NpsResponse = await response.json();

		return data.data.map((alert) => ({
			id: `nps-${alert.id}`,
			title: alert.title,
			link: alert.url || `https://www.nps.gov/${alert.parkCode}/planyourvisit/conditions.htm`,
			timestamp: new Date(alert.lastIndexedDate).getTime() || Date.now(),
			description: alert.description?.slice(0, 300),
			source: `NPS – ${PARK_NAMES[alert.parkCode] || alert.parkCode.toUpperCase()}`,
			category: 'outdoors',
			verification: 'official' as const,
			isAlert: alert.category === 'Danger' || alert.category === 'Park Closure'
		}));
	} catch (error) {
		logger.warn('NPS', `Alerts fetch failed: ${(error as Error).message}`);
		return [];
	}
}

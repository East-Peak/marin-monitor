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
import { fetchWithTimeout } from './fetch-helpers';

interface NpsAlert {
	id: string;
	title: string;
	description: string;
	parkCode: string;
	category: string; // 'Danger', 'Caution', 'Information', 'Park Closure'
	url: string;
	lastIndexedDate: string;
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
		logger.log('NPS', 'Fetching Marin park alerts via local API');
		const response = await fetchWithTimeout('/api/nps/alerts', {
			headers: { Accept: 'application/json' }
		});

		if (!response.ok) {
			throw new Error(`NPS API failed: ${response.status}`);
		}

		const alerts: NpsAlert[] = await response.json();

		return alerts.map((alert) => ({
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

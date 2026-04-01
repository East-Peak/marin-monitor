/**
 * Citizen app incident adapter
 *
 * Fetches real-time safety incidents (fires, accidents, police activity,
 * power outages) from Citizen's undocumented trending API.
 * Bounding box covers Marin County. Free, no auth required.
 */

import { detectTown } from '$lib/config';
import { logger } from '$lib/config/api';
import type { NewsItem, VerificationLevel } from '$lib/types';
import { fetchWithTimeout } from './fetch-helpers';

// Marin County bounding box for the Citizen API
const CITIZEN_URL =
	'https://citizen.com/api/incident/trending?' +
	'lowerLatitude=37.83&lowerLongitude=-122.75' +
	'&upperLatitude=38.08&upperLongitude=-122.45' +
	'&fullResponse=true&limit=200';

// Marin lat/lon sanity check (slightly wider than the API bbox)
const MARIN_LAT_MIN = 37.8;
const MARIN_LAT_MAX = 38.1;
const MARIN_LON_MIN = -122.8;
const MARIN_LON_MAX = -122.4;

interface CitizenUpdate {
	text: string;
	ts: number;
}

interface CitizenIncident {
	key: string;
	title: string;
	address: string;
	latitude: number;
	longitude: number;
	categories: string[];
	severity: string;
	ts: number;
	updates: CitizenUpdate[];
	source: string;
	closed: boolean;
	shareMap?: string;
	cityCode?: string;
}

/**
 * Map Citizen severity to our verification level.
 * Red/orange are confirmed incidents (often 911-sourced) → official.
 * Yellow are active/unconfirmed → local_media equivalent.
 * Grey are minor/community-reported → community.
 */
function severityToVerification(severity: string): VerificationLevel {
	switch (severity) {
		case 'red':
		case 'orange':
			return 'official';
		case 'yellow':
			return 'local_media';
		default:
			return 'community';
	}
}

/**
 * Derive topic tags from Citizen category strings.
 */
function deriveTopics(categories: string[]): string[] {
	const topics: string[] = [];
	const joined = categories.join(' ').toLowerCase();

	if (joined.includes('police') || joined.includes('law enforcement')) topics.push('police');
	if (joined.includes('fire')) topics.push('fire');
	if (joined.includes('ems') || joined.includes('medical') || joined.includes('ambulance'))
		topics.push('medical');
	if (joined.includes('traffic') || joined.includes('vehicle') || joined.includes('accident'))
		topics.push('traffic');
	if (joined.includes('hazard') || joined.includes('power') || joined.includes('utility'))
		topics.push('hazard');
	if (joined.includes('missing') || joined.includes('person')) topics.push('missing-person');
	if (joined.includes('theft') || joined.includes('robbery') || joined.includes('burglary'))
		topics.push('crime');

	return topics.length > 0 ? topics : ['incident'];
}

/**
 * Build a description from incident updates (first 3), falling back to the title.
 */
function buildDescription(incident: CitizenIncident): string {
	if (incident.updates && incident.updates.length > 0) {
		return incident.updates
			.slice(0, 3)
			.map((u) => u.text)
			.join(' · ');
	}
	return incident.title;
}

/**
 * Parse town from the Citizen address string (e.g. "402 Magnolia Ave, Larkspur, CA 94939, USA").
 * Tries detectTown on the whole address first, then falls back to extracting the city component.
 */
function parseTown(address: string): { name?: string; slug?: string } {
	// Try the full address against detectTown
	const detected = detectTown(address);
	if (detected) return detected;

	// Fallback: extract city from comma-separated address parts
	// Typical format: "street, City, STATE ZIP, Country"
	const parts = address.split(',').map((p) => p.trim());
	if (parts.length >= 2) {
		const cityPart = parts[1]; // usually the city name
		const fromCity = detectTown(cityPart);
		if (fromCity) return fromCity;
	}

	return {};
}

function isInMarinBounds(lat: number, lon: number): boolean {
	return lat >= MARIN_LAT_MIN && lat <= MARIN_LAT_MAX && lon >= MARIN_LON_MIN && lon <= MARIN_LON_MAX;
}

/**
 * Fetch real-time safety incidents from the Citizen app.
 * @param maxAgeHours Only include incidents from the last N hours (default 24)
 */
export async function fetchCitizenIncidents(maxAgeHours: number = 24): Promise<NewsItem[]> {
	try {
		logger.log('CITIZEN', 'Fetching Citizen app incidents');

		const response = await fetchWithTimeout(CITIZEN_URL, {
			headers: { Accept: 'application/json' }
		});

		if (!response.ok) {
			throw new Error(`Citizen API failed: ${response.status}`);
		}

		const data = await response.json();

		// API returns an object keyed by incident key, not an array
		const incidents: CitizenIncident[] = Object.values(data ?? {});
		const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;

		const items: NewsItem[] = [];

		for (const incident of incidents) {
			// Skip closed incidents
			if (incident.closed) continue;

			// Skip incidents older than maxAgeHours (ts is in milliseconds)
			if (incident.ts < cutoff) continue;

			// Sanity-check coordinates are within Marin
			if (!isInMarinBounds(incident.latitude, incident.longitude)) continue;

			const town = parseTown(incident.address || '');

			items.push({
				id: `citizen-${incident.key}`,
				title: incident.title,
				link: `https://citizen.com/${incident.key}`,
				pubDate: new Date(incident.ts).toISOString(),
				timestamp: incident.ts,
				description: buildDescription(incident),
				content: buildDescription(incident),
				source: 'Citizen',
				category: 'safety',
				verification: severityToVerification(incident.severity),
				town: town.name,
				townSlug: town.slug,
				lat: incident.latitude,
				lon: incident.longitude,
				locationConfidence: 'exact',
				locationEvidence: incident.address || incident.title,
				topics: deriveTopics(incident.categories || [])
			});
		}

		logger.log('CITIZEN', `${items.length} active incidents in Marin`);
		return items.sort((a, b) => b.timestamp - a.timestamp);
	} catch (error) {
		logger.warn('CITIZEN', `Citizen app fetch failed: ${(error as Error).message}`);
		return [];
	}
}

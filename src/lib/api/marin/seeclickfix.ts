import { detectTown } from '$lib/config';
import { logger } from '$lib/config/api';
import type { NewsItem } from '$lib/types';
import { fetchWithTimeout } from './fetch-helpers';

/** Marin County bounding box — filter out stray issues outside the county. */
const MARIN_BOUNDS = {
	latMin: 37.83,
	latMax: 38.08,
	lngMin: -122.75,
	lngMax: -122.45
};

interface SeeClickFixMedia {
	image_full?: string | null;
	image_square_100x100?: string | null;
}

interface SeeClickFixRequestType {
	title?: string;
	organization?: string;
}

interface SeeClickFixIssue {
	id: number;
	status: string;
	summary: string;
	description: string;
	lat: number | null;
	lng: number | null;
	address: string;
	created_at: string;
	updated_at: string;
	request_type?: SeeClickFixRequestType;
	media?: SeeClickFixMedia;
	html_url?: string;
}

interface SeeClickFixBlobData {
	issues: SeeClickFixIssue[];
	lastUpdated: string;
	count: number;
}

function isInMarinCounty(lat: number | null, lng: number | null): boolean {
	if (lat == null || lng == null) return false;
	return (
		lat >= MARIN_BOUNDS.latMin &&
		lat <= MARIN_BOUNDS.latMax &&
		lng >= MARIN_BOUNDS.lngMin &&
		lng <= MARIN_BOUNDS.lngMax
	);
}

/**
 * Strip the Spanish translation after " / " from SeeClickFix category names.
 * E.g. "Illegal Dumping / Desecho ilegal" → "Illegal Dumping"
 */
function stripSpanish(summary: string): string {
	const slashIdx = summary.indexOf(' / ');
	return slashIdx > 0 ? summary.slice(0, slashIdx).trim() : summary.trim();
}

/**
 * Extract a short street snippet from the full address for the title.
 * E.g. "123 Lincoln Ave, San Rafael, CA" → "Lincoln Ave"
 */
function addressSnippet(address: string): string {
	if (!address) return '';
	// Take the first line / comma-delimited part
	const firstPart = address.split(',')[0].trim();
	// Strip leading house number if present
	return firstPart.replace(/^\d+\s+/, '');
}

function issueToNewsItem(issue: SeeClickFixIssue): NewsItem | null {
	if (!issue.id || !issue.created_at) return null;
	if (!isInMarinCounty(issue.lat, issue.lng)) return null;

	const timestamp = new Date(issue.created_at).getTime();
	if (!Number.isFinite(timestamp)) return null;

	const category = stripSpanish(issue.summary || '');
	const snippet = addressSnippet(issue.address || '');
	const title = snippet ? `${category} · ${snippet}` : category;

	const town = detectTown(issue.address || '');
	const lat = issue.lat != null && Number.isFinite(issue.lat) ? issue.lat : undefined;
	const lon = issue.lng != null && Number.isFinite(issue.lng) ? issue.lng : undefined;

	const description = issue.description
		? issue.description.slice(0, 300)
		: `${category} reported at ${issue.address || 'unknown location'}`;

	return {
		id: `seeclickfix-${issue.id}`,
		title,
		link: issue.html_url || `https://seeclickfix.com/issues/${issue.id}`,
		pubDate: issue.created_at,
		timestamp,
		description,
		content: description,
		source: 'Fix It Marin',
		category: '311',
		verification: 'official',
		town: town?.name,
		townSlug: town?.slug,
		lat,
		lon,
		locationConfidence: lat !== undefined && lon !== undefined ? 'exact' : 'town',
		locationEvidence: issue.address || town?.name,
		topics: ['311', 'seeclickfix'],
		imageUrl: issue.media?.image_full || undefined,
		thumbnailUrl: issue.media?.image_square_100x100 || undefined
	};
}

/**
 * Fetch 311 issues from the pre-synced blob (via /api/data/311).
 * The cron job at /api/cron/sync-311 refreshes the blob every 4 hours.
 */
export async function fetchSeeClickFixIssues(): Promise<NewsItem[]> {
	try {
		logger.log('SEECLICKFIX', 'Fetching 311 issues from blob');

		const response = await fetchWithTimeout('/api/data/311', { cache: 'no-store' });

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const data = (await response.json()) as SeeClickFixBlobData;

		if (!data.issues || !Array.isArray(data.issues)) {
			logger.warn('SEECLICKFIX', 'Unexpected response shape — no issues array');
			return [];
		}

		const items = data.issues
			.map(issueToNewsItem)
			.filter((item): item is NewsItem => !!item)
			.sort((a, b) => b.timestamp - a.timestamp);

		logger.log('SEECLICKFIX', `Loaded ${items.length} issues from blob`);
		return items;
	} catch (error) {
		logger.warn('SEECLICKFIX', `311 blob fetch failed: ${(error as Error).message}`);
		return [];
	}
}

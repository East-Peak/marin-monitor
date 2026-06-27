/**
 * Strava public segment page scraper.
 *
 * Parses the public HTML for a Strava segment to extract:
 * - CR / QOM record holders (from React props JSON)
 * - Visible leaderboard rows (from HTML table)
 * - Attempt/athlete counts (from stat text)
 * - Segment name
 *
 * No authentication required — works with anonymous access to strava.com/segments/:id
 */

import type {
	StravaLeaderboard,
	StravaRecordHolder,
	StravaLeaderboardRow
} from '$lib/types/strava';
import { stripHtml } from '../html-text.js';

// ---------------------------------------------------------------------------
// HTML entity decoding
// ---------------------------------------------------------------------------

const HTML_ENTITY_MAP: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' '
};

/** Decode common HTML entities and numeric references. */
function decodeEntities(s: string): string {
	return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
		if (entity.startsWith('#x') || entity.startsWith('#X')) {
			const codepoint = Number.parseInt(entity.slice(2), 16);
			return Number.isFinite(codepoint) ? String.fromCodePoint(codepoint) : match;
		}
		if (entity.startsWith('#')) {
			const codepoint = Number.parseInt(entity.slice(1), 10);
			return Number.isFinite(codepoint) ? String.fromCodePoint(codepoint) : match;
		}
		return HTML_ENTITY_MAP[entity] ?? match;
	});
}

function cleanText(s: string): string {
	// DOM-based strip + decode (handles tags/entities robustly); replaces the
	// prior regex stripTags + decodeEntities composition (CodeQL incomplete-sanitization).
	return stripHtml(s);
}

// ---------------------------------------------------------------------------
// React props extraction
// ---------------------------------------------------------------------------

interface ReactFastestTimeEntry {
	id: number;
	name: string;
	stats: { label: string; value: string }[];
	date: string;
	segmentEffortId: string;
	activityId: number;
}

interface ReactSideBarProps {
	segmentId: number;
	fastestTimes: {
		overall?: ReactFastestTimeEntry;
		men?: ReactFastestTimeEntry;
		women?: ReactFastestTimeEntry;
	};
}

interface ReactProps {
	sideBarProps: ReactSideBarProps;
}

function toRecordHolder(entry: ReactFastestTimeEntry | undefined): StravaRecordHolder | null {
	if (!entry) return null;
	const time = cleanText(entry.stats?.[0]?.value ?? '');
	if (!time) return null;
	return {
		athleteId: entry.id,
		athleteName: cleanText(entry.name),
		time,
		date: entry.date,
		effortId: parseEffortId(entry.segmentEffortId),
		activityId: entry.activityId
	};
}

/** segmentEffortId can be a numeric string (possibly very large). Parse to number. */
function parseEffortId(raw: string | number | undefined): number {
	if (raw === undefined || raw === null) return 0;
	const n = Number(raw);
	return Number.isFinite(n) ? n : 0;
}

function extractReactProps(html: string): ReactProps | null {
	// Match the data-react-props attribute on the SegmentDetailsSideBar div
	const match = html.match(/data-react-class='SegmentDetailsSideBar'\s+data-react-props='([^']+)'/);
	if (!match) {
		// Try double-quote variant
		const match2 = html.match(
			/data-react-class="SegmentDetailsSideBar"\s+data-react-props="([^"]+)"/
		);
		if (!match2) return null;
		try {
			return JSON.parse(decodeEntities(match2[1]));
		} catch {
			return null;
		}
	}
	try {
		return JSON.parse(decodeEntities(match[1]));
	} catch {
		return null;
	}
}

// ---------------------------------------------------------------------------
// Leaderboard table parsing
// ---------------------------------------------------------------------------

function extractLeaderboardRows(html: string): StravaLeaderboardRow[] {
	const rows: StravaLeaderboardRow[] = [];

	// Find the table
	const tableMatch = html.match(
		/<table\s+class='table table-striped table-leaderboard'>([\s\S]*?)<\/table>/
	);
	if (!tableMatch) return rows;

	const tableHtml = tableMatch[1];

	// Determine columns from thead
	const theadMatch = tableHtml.match(/<thead>([\s\S]*?)<\/thead>/);
	const headers: string[] = [];
	if (theadMatch) {
		const thRegex = /<th[^>]*>(.*?)<\/th>/g;
		let thMatch;
		while ((thMatch = thRegex.exec(theadMatch[1])) !== null) {
			headers.push(cleanText(thMatch[1]).toLowerCase());
		}
	}

	// Parse the column layout — different for ride vs run segments
	// Ride: Rank, Name, Speed, Power, VAM, Time
	// Run:  Rank, Name, Pace, VAM, Time
	const hasSpeed = headers.includes('speed');
	const hasPower = headers.includes('power');
	const hasPace = headers.includes('pace');

	// Extract tbody rows
	const tbodyMatch = tableHtml.match(/<tbody>([\s\S]*?)<\/tbody>/);
	if (!tbodyMatch) return rows;

	const trRegex = /<tr>([\s\S]*?)<\/tr>/g;
	let trMatch;
	while ((trMatch = trRegex.exec(tbodyMatch[1])) !== null) {
		const rowHtml = trMatch[1];

		// Extract all <td> contents
		const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
		const cells: string[] = [];
		let tdMatch;
		while ((tdMatch = tdRegex.exec(rowHtml)) !== null) {
			cells.push(tdMatch[1]);
		}

		if (cells.length < 3) continue;

		// First cell: rank
		const rank = parseInt(cells[0].trim(), 10);
		if (isNaN(rank)) continue;

		// Second cell: athlete name
		const athleteName = cleanText(cells[1]);
		if (!athleteName) continue;

		// Last cell: time with activity link
		const lastCell = cells[cells.length - 1];
		const timeMatch = lastCell.match(/<a\s+href="\/activities\/(\d+)">([\s\S]*?)<\/a>/);
		if (!timeMatch) continue;

		const activityId = parseInt(timeMatch[1], 10);
		const time = cleanText(timeMatch[2]);
		if (!time) continue;

		// Middle cells: speed/pace, power, vam — varies by segment type
		let speed: string | null = null;
		let power: string | null = null;
		let vam: string | null = null;

		if (hasSpeed && hasPower) {
			// Ride: Rank, Name, Speed, Power, VAM, Time (6 cells)
			if (cells.length >= 6) {
				speed = extractNumericValue(cells[2]);
				power = extractNumericValue(cells[3]);
				vam = extractNumericValue(cells[4]);
			}
		} else if (hasPace) {
			// Run: Rank, Name, Pace, VAM, Time (5 cells)
			if (cells.length >= 5) {
				speed = extractNumericValue(cells[2]); // pace goes into speed field
				vam = extractNumericValue(cells[3]);
			}
		}

		rows.push({ rank, athleteName, time, speed, power, vam, activityId });
	}

	return rows;
}

/** Strip HTML tags and unit abbreviations to get the core numeric value */
function extractNumericValue(cellHtml: string): string | null {
	const text = cleanText(cellHtml);
	if (!text || text === '-') return null;
	// Extract leading numeric part (e.g., "29.3 km/h" → "29.3", "5:40 /km" → "5:40")
	const match = text.match(/^[\d:.,]+/);
	return match ? match[0] : null;
}

// ---------------------------------------------------------------------------
// Segment stats (distance, elevation gain, avg grade)
// ---------------------------------------------------------------------------

interface SegmentStats {
	distance: number | null;
	elevationGain: number | null;
	avgGrade: number | null;
}

function extractSegmentStats(html: string): SegmentStats {
	const stats: SegmentStats = { distance: null, elevationGain: null, avgGrade: null };

	// Pattern: <span class="stat-subtext">Distance</span><b class="stat-text">2.65<abbr ...>km</abbr></b>
	const distMatch = html.match(
		/<span class="stat-subtext">Distance<\/span><b class="stat-text">([\d.]+)<abbr[^>]*title='([^']+)'/
	);
	if (distMatch) {
		const value = parseFloat(distMatch[1]);
		const unit = distMatch[2];
		// Convert to meters
		if (unit === 'kilometers') {
			stats.distance = value * 1000;
		} else if (unit === 'meters') {
			stats.distance = value;
		} else if (unit === 'miles') {
			stats.distance = value * 1609.34;
		} else {
			stats.distance = value;
		}
	}

	const elevMatch = html.match(
		/<span class="stat-subtext">Elevation Gain<\/span><b class="stat-text">([\d.]+)<abbr[^>]*title='([^']+)'/
	);
	if (elevMatch) {
		const value = parseFloat(elevMatch[1]);
		const unit = elevMatch[2];
		if (unit === 'feet') {
			stats.elevationGain = value * 0.3048;
		} else {
			stats.elevationGain = value; // meters
		}
	}

	const gradeMatch = html.match(
		/<span class="stat-subtext">Avg Grade<\/span><b class="stat-text">([\d.]+)<abbr[^>]*title='([^']+)'/
	);
	if (gradeMatch) {
		stats.avgGrade = parseFloat(gradeMatch[1]);
	}

	return stats;
}

// ---------------------------------------------------------------------------
// Attempt counts
// ---------------------------------------------------------------------------

function extractAttemptCounts(html: string): { attempts: number; athletes: number } {
	// Pattern: "944,951 Attempts By 72,448 People"
	const match = html.match(/([\d,]+)\s+Attempts?\s+By\s+([\d,]+)\s+People/i);
	if (!match) return { attempts: 0, athletes: 0 };
	return {
		attempts: parseInt(match[1].replace(/,/g, ''), 10),
		athletes: parseInt(match[2].replace(/,/g, ''), 10)
	};
}

// ---------------------------------------------------------------------------
// Segment name
// ---------------------------------------------------------------------------

function extractSegmentName(html: string): string {
	// <span data-full-name='Hawk Hill' id='js-full-name'>
	const match = html.match(/data-full-name='([^']+)'/);
	if (match) return cleanText(match[1]);
	// Fallback: double-quote variant
	const match2 = html.match(/data-full-name="([^"]+)"/);
	if (match2) return cleanText(match2[1]);
	// Fallback: title tag
	const titleMatch = html.match(/<title>([^<]+)<\/title>/);
	if (titleMatch) return cleanText(titleMatch[1].replace(/\s*\|.*$/, ''));
	return 'Unknown Segment';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a Strava segment page HTML and extract leaderboard data.
 * Exported for testing with fixtures.
 */
export function parseSegmentPage(segmentId: number, html: string): StravaLeaderboard | null {
	if (!html || html.length < 100) return null;

	const props = extractReactProps(html);
	const segmentName = extractSegmentName(html);

	if (!props && segmentName === 'Unknown Segment') {
		// Likely not a valid Strava page
		return null;
	}

	const fastestTimes = props?.sideBarProps?.fastestTimes;

	// CR = overall record (or men's record if overall not present)
	const cr = toRecordHolder(fastestTimes?.overall) ?? toRecordHolder(fastestTimes?.men);
	const qom = toRecordHolder(fastestTimes?.women);

	const rows = extractLeaderboardRows(html);
	const { attempts, athletes } = extractAttemptCounts(html);
	const segmentStats = extractSegmentStats(html);

	return {
		segmentId,
		segmentName,
		cr,
		qom,
		rows,
		totalAttempts: attempts,
		totalAthletes: athletes,
		distance: segmentStats.distance,
		elevationGain: segmentStats.elevationGain,
		avgGrade: segmentStats.avgGrade,
		scrapedAt: new Date().toISOString()
	};
}

/**
 * Fetch and parse a Strava segment's public page.
 */
export type StravaSegmentScrapeResult =
	| { kind: 'ok'; leaderboard: StravaLeaderboard }
	| { kind: 'not_found' }
	| { kind: 'error' };

export async function scrapeSegmentLeaderboardResult(
	segmentId: number
): Promise<StravaSegmentScrapeResult> {
	const url = `https://www.strava.com/segments/${segmentId}`;

	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; MarinMonitor/1.0)',
				Accept: 'text/html'
			}
		});

		if (response.status === 404 || response.status === 410) {
			console.warn(
				`[strava-leaderboards] Segment ${segmentId} is no longer available (${response.status})`
			);
			return { kind: 'not_found' };
		}

		if (!response.ok) {
			console.warn(`[strava-leaderboards] HTTP ${response.status} for segment ${segmentId}`);
			return { kind: 'error' };
		}

		const html = await response.text();
		const leaderboard = parseSegmentPage(segmentId, html);
		if (!leaderboard) {
			console.warn(`[strava-leaderboards] Segment ${segmentId} returned unparsable HTML`);
			return { kind: 'error' };
		}
		return { kind: 'ok', leaderboard };
	} catch (err) {
		console.warn(`[strava-leaderboards] Failed to fetch segment ${segmentId}:`, err);
		return { kind: 'error' };
	}
}

export async function scrapeSegmentLeaderboard(
	segmentId: number
): Promise<StravaLeaderboard | null> {
	const result = await scrapeSegmentLeaderboardResult(segmentId);
	return result.kind === 'ok' ? result.leaderboard : null;
}

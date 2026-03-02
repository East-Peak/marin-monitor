/**
 * Keyword configuration for alerts, town detection, and categorization
 * Focused on Marin County local concerns
 */

import { MARIN_TOWNS } from './towns';

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWholePhrase(text: string, phrase: string): boolean {
	const pattern = new RegExp(`(^|[^a-z])${escapeRegex(phrase)}(?=$|[^a-z])`, 'i');
	return pattern.test(text);
}

/**
 * Alert keywords — things that should be flagged prominently
 */
export const ALERT_KEYWORDS = [
	// Fire
	'wildfire',
	'fire',
	'brush fire',
	'structure fire',
	'red flag warning',
	'fire weather watch',
	'psps',
	'power shutoff',
	'evacuation',
	'evacuation order',
	'evacuation warning',
	'shelter in place',
	// Weather
	'flood warning',
	'flood watch',
	'flash flood',
	'high wind',
	'storm warning',
	'winter storm',
	'atmospheric river',
	'king tide',
	'tsunami',
	// Safety
	'earthquake',
	'road closure',
	'landslide',
	'mudslide',
	'accident',
	'hazmat',
	'missing person',
	'amber alert',
	'silver alert',
	// Infrastructure
	'power outage',
	'water main break',
	'boil water',
	'bridge closure',
	'highway closure',
	'101 closed',
	'richmond bridge'
] as const;

export type AlertKeyword = (typeof ALERT_KEYWORDS)[number];

/**
 * Topic keywords — for categorizing stories beyond their feed source
 */
export const TOPIC_KEYWORDS: Record<string, string[]> = {
	FIRE: [
		'wildfire',
		'fire',
		'cal fire',
		'fire department',
		'fire season',
		'burn',
		'smoke',
		'red flag',
		'psps',
		'power shutoff',
		'evacuation'
	],
	WEATHER: [
		'rain',
		'storm',
		'flood',
		'wind',
		'fog',
		'atmospheric river',
		'drought',
		'king tide',
		'heat wave',
		'freeze',
		'temperature'
	],
	TRAFFIC: [
		'traffic',
		'101',
		'highway',
		'commute',
		'golden gate bridge',
		'richmond bridge',
		'ferry',
		'smart train',
		'marin transit',
		'road closure',
		'accident',
		'construction'
	],
	HOUSING: [
		'housing',
		'real estate',
		'home sale',
		'property',
		'rent',
		'affordable housing',
		'zoning',
		'development',
		'adus',
		'mortgage',
		'median price'
	],
	ENVIRONMENT: [
		'water',
		'drought',
		'mmwd',
		'reservoir',
		'creek',
		'erosion',
		'sea level',
		'climate',
		'open space',
		'trail',
		'park',
		'wildlife',
		'whale',
		'shark',
		'coyote',
		'mountain lion'
	],
	SCHOOLS: [
		'school',
		'district',
		'students',
		'education',
		'teacher',
		'college of marin',
		'tamalpais high',
		'marin academy',
		'branson',
		'san domenico'
	],
	CIVIC: [
		'board of supervisors',
		'city council',
		'town council',
		'planning commission',
		'county',
		'meeting',
		'vote',
		'ballot',
		'measure',
		'tax',
		'budget',
		'permit'
	]
};

/**
 * Patterns that indicate an editorial, opinion, or historical/retrospective piece
 * — these should NOT trigger alert badges.
 */
const EDITORIAL_PATTERNS = [
	/\bopinion\b/i,
	/\beditorial\b/i,
	/\bletter to the editor/i,
	/\bletters:/i,
	/\bop-ed\b/i,
	/\bcolumn:/i,
	/\breview:/i,
	/\bbook review\b/i,
	/\bfilm review\b/i
];

const HISTORICAL_PATTERNS = [
	/\bin\s+\d{4}\b/i, // "in 1992", "in 2001"
	/\b\d{4}\s+(massacre|siege|incident|tragedy|disaster|riot|bombing)\b/i,
	/\banniversary\b/i,
	/\blooking back\b/i,
	/\bretrospective\b/i,
	/\bhistory of\b/i,
	/\byears ago\b/i
];

/**
 * Check if a title contains alert keywords.
 *
 * IMPORTANT: Only pass the TITLE, not description/content. Description-level
 * matches produce too many false positives (e.g. "wildfire" in a landscaping
 * article, "landslide" in a concert listing).
 *
 * Accepts optional context to suppress false positives from editorials,
 * satire, and historical references.
 */
export function containsAlertKeyword(
	text: string,
	context?: { source?: string; verification?: string; link?: string; title?: string }
): { isAlert: boolean; keyword?: string } {
	const lowerText = text.toLowerCase();

	// Never alert on satire
	if (context?.verification === 'satire' || context?.source === 'Marin Lately') {
		return { isAlert: false };
	}

	// Suppress alerts on editorials/opinion pieces
	const link = context?.link ?? '';
	if (
		/\/opinion\//i.test(link) ||
		/\/letters\//i.test(link) ||
		/\/editorial\//i.test(link) ||
		/\/op-ed\//i.test(link) ||
		EDITORIAL_PATTERNS.some((p) => p.test(lowerText))
	) {
		return { isAlert: false };
	}

	// Suppress alerts on historical/retrospective content
	if (HISTORICAL_PATTERNS.some((p) => p.test(lowerText))) {
		return { isAlert: false };
	}

	for (const keyword of ALERT_KEYWORDS) {
		if (hasWholePhrase(lowerText, keyword)) {
			return { isAlert: true, keyword };
		}
	}
	return { isAlert: false };
}

// Pre-computed: towns sorted longest-first for greedy matching
const TOWNS_BY_LENGTH = [...MARIN_TOWNS].sort((a, b) => b.name.length - a.name.length);

// Common abbreviations and alternate names
const TOWN_ALIASES: Record<string, string> = {
	'pt reyes': 'point-reyes',
	'pt. reyes': 'point-reyes',
	'point reyes': 'point-reyes',
	'san rafael': 'san-rafael',
	'san anselmo': 'san-anselmo',
	'corte madera': 'corte-madera',
	'mill valley': 'mill-valley',
	'muir beach': 'muir-beach',
	stinson: 'stinson-beach',
	'tam valley': 'tam-valley',
	'forest knolls': 'forest-knolls',
	'san geronimo': 'san-geronimo',
	'lucas valley': 'lucas-valley',
	'terra linda': 'terra-linda'
};

/**
 * Detect town from text — checks for town names and common abbreviations
 */
export function detectTown(text: string): { name: string; slug: string } | null {
	const lowerText = text.toLowerCase();

	// Check each town name, longest first, with word boundaries.
	for (const town of TOWNS_BY_LENGTH) {
		if (hasWholePhrase(lowerText, town.name.toLowerCase())) {
			return { name: town.name, slug: town.slug };
		}
	}

	for (const [alias, slug] of Object.entries(TOWN_ALIASES)) {
		if (hasWholePhrase(lowerText, alias)) {
			const town = MARIN_TOWNS.find((t) => t.slug === slug);
			if (town) return { name: town.name, slug: town.slug };
		}
	}

	return null;
}

/**
 * Detect topics from text
 */
export function detectTopics(text: string): string[] {
	const lowerText = text.toLowerCase();
	const detected: string[] = [];
	for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
		if (keywords.some((k) => lowerText.includes(k))) {
			detected.push(topic);
		}
	}
	return detected;
}

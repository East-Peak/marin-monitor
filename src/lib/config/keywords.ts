/**
 * Keyword configuration for alerts, town detection, and categorization
 * Focused on Marin County local concerns
 */

import { MARIN_TOWNS } from './towns';

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
		'wildfire', 'fire', 'cal fire', 'fire department', 'fire season',
		'burn', 'smoke', 'red flag', 'psps', 'power shutoff', 'evacuation'
	],
	WEATHER: [
		'rain', 'storm', 'flood', 'wind', 'fog', 'atmospheric river',
		'drought', 'king tide', 'heat wave', 'freeze', 'temperature'
	],
	TRAFFIC: [
		'traffic', '101', 'highway', 'commute', 'golden gate bridge',
		'richmond bridge', 'ferry', 'smart train', 'marin transit',
		'road closure', 'accident', 'construction'
	],
	HOUSING: [
		'housing', 'real estate', 'home sale', 'property', 'rent',
		'affordable housing', 'zoning', 'development', 'adus',
		'mortgage', 'median price'
	],
	ENVIRONMENT: [
		'water', 'drought', 'mmwd', 'reservoir', 'creek', 'erosion',
		'sea level', 'climate', 'open space', 'trail', 'park',
		'wildlife', 'whale', 'shark', 'coyote', 'mountain lion'
	],
	SCHOOLS: [
		'school', 'district', 'students', 'education', 'teacher',
		'college of marin', 'tamalpais high', 'marin academy',
		'branson', 'san domenico'
	],
	CIVIC: [
		'board of supervisors', 'city council', 'town council',
		'planning commission', 'county', 'meeting', 'vote', 'ballot',
		'measure', 'tax', 'budget', 'permit'
	]
};

/**
 * Check if a headline contains alert keywords
 */
export function containsAlertKeyword(text: string): { isAlert: boolean; keyword?: string } {
	const lowerText = text.toLowerCase();
	for (const keyword of ALERT_KEYWORDS) {
		if (lowerText.includes(keyword)) {
			return { isAlert: true, keyword };
		}
	}
	return { isAlert: false };
}

/**
 * Detect town from text — checks for town names and common abbreviations
 */
export function detectTown(text: string): { name: string; slug: string } | null {
	const lowerText = text.toLowerCase();

	// Check each town name
	for (const town of MARIN_TOWNS) {
		if (lowerText.includes(town.name.toLowerCase())) {
			return { name: town.name, slug: town.slug };
		}
	}

	// Common abbreviations and alternate names
	const ALIASES: Record<string, string> = {
		'pt reyes': 'point-reyes',
		'pt. reyes': 'point-reyes',
		'point reyes': 'point-reyes',
		'san rafael': 'san-rafael',
		'san anselmo': 'san-anselmo',
		'corte madera': 'corte-madera',
		'mill valley': 'mill-valley',
		'muir beach': 'muir-beach',
		'stinson': 'stinson-beach',
		'tam valley': 'tam-valley',
		'forest knolls': 'forest-knolls',
		'san geronimo': 'san-geronimo',
		'lucas valley': 'lucas-valley',
		'terra linda': 'terra-linda'
	};

	for (const [alias, slug] of Object.entries(ALIASES)) {
		if (lowerText.includes(alias)) {
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

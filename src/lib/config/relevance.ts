/**
 * Marin relevance filter — local-vs-global scoring.
 *
 * Notes:
 * - Marin Lately is explicit pass-through (no filtering).
 * - Mixed/high-throughput sources require stronger local anchors.
 * - Full article content (if available) participates in scoring.
 */

import type { NewsItem } from '$lib/types';
import { MARIN_TOWNS } from './towns';

const PASSTHROUGH_SOURCES = new Set(['Marin Lately']);

const STRICT_LOCAL_SOURCES = new Set([
	'Point Reyes Light',
	'Pacific Sun',
	'Marin Magazine',
	'City of San Rafael',
	'Town of Fairfax',
	'MMWD / Marin Water',
	'Marin Humane',
	'WildCare',
	'Marin Sheriff Blotter',
	'Fairfax Police Log',
	'Mill Valley Police Log',
	'Ross Police Statistics',
	'Tiburon Police Department',
	'Belvedere Public Safety',
	'Central Marin PD',
	'Novato PD',
	'San Rafael PD',
	'Sausalito PD',
	'Marin County BOS – Agendas',
	'Marin County BOS – Minutes',
	'Sweetwater Music Hall',
	'Rancho Nicasio',
	"Mac's at 19 Broadway",
	"Peri's Tavern",
	"Smiley's Saloon",
	'HopMonk Novato',
	'The Junction',
	'KWMR',
	'Sausalito Seahorse',
	'Marin Symphony',
	'Mill Valley Library',
	'Marin County Free Library',
	'San Rafael Elks',
	'Dance Palace',
	'Osher Marin JCC',
	'Tourist Club',
	'B-17 / Webscorer',
	'Marin Trail Stewards',
	'Dipsea Race',
	'Quad Dipsea',
	'Miwok 100K',
	'Inside Trail Racing',
	'Redwood Bark',
	'NorCal MTB',
	'Marin Catholic Athletics',
	'Archie Williams Athletics',
	'San Rafael Athletics',
	'Tamalpais Union High School District',
	'Archie Williams MTB',
	'San Rafael Pacifics',
	'Marin Rowing Association',
	'Marin Highlanders Rugby',
	'Agricultural Institute of Marin',
	'California Department of Fish & Wildlife',
	'Point Reyes Farmstead Cheese'
]);

const MIXED_SOURCE_PATTERNS = [
	/^Marin IJ/,
	/^Marin Independent Journal$/,
	/^NBC Bay Area/,
	/^KQED News$/
];

const STRONG_LOCAL_SIGNALS: string[] = [
	'marin county',
	'marin',
	'north bay',
	'point reyes',
	'muir woods',
	'muir beach',
	'tomales bay',
	'bolinas',
	'stinson beach',
	'mount tamalpais',
	'mt tam',
	'highway 101',
	'sir francis drake',
	'golden gate transit',
	'marin transit',
	'smart train',
	'marin sheriff',
	'marin fire',
	'marin water',
	'college of marin',
	...MARIN_TOWNS.map((t) => t.name.toLowerCase())
];

const MEDIUM_LOCAL_SIGNALS: string[] = [
	'bay area',
	'san francisco bay',
	'richmond bridge',
	'san rafael bridge',
	'ferry terminal',
	'open space',
	'county board',
	'board of supervisors'
];

const EDITORIAL_URL_PATTERNS = [/\/opinion\//i, /\/letters\//i, /\/editorial\//i, /\/op-ed\//i];

const EDITORIAL_TITLE_PATTERNS = [
	/^letters:/i,
	/^your letters/i,
	/^editorial:/i,
	/^opinion:/i,
	/^op-ed:/i,
	/^letter to the editor/i
];

const GLOBAL_NEGATIVE_SIGNALS: string[] = [
	'white house',
	'congress',
	'supreme court',
	'department of justice',
	'doj',
	'fbi',
	'cia',
	'pentagon',
	'nato',
	'iran',
	'israel',
	'ukraine',
	'russia',
	'epstein',
	'clinton',
	'trump',
	'biden',
	'us prosecutors',
	'ap sources say',
	'world leaders'
];

export interface RelevanceDecision {
	keep: boolean;
	score: number;
	localHits: number;
	negativeHits: number;
	mixedSource: boolean;
}

function includesAny(text: string, terms: string[]): number {
	let hits = 0;
	for (const term of terms) {
		const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
		const pattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
		if (pattern.test(text)) hits++;
	}
	return hits;
}

export function isMixedSource(sourceName: string): boolean {
	return MIXED_SOURCE_PATTERNS.some((pattern) => pattern.test(sourceName));
}

function isPassthrough(item: NewsItem): boolean {
	return item.verification === 'satire' || PASSTHROUGH_SOURCES.has(item.source);
}

export function getRelevanceDecision(item: NewsItem): RelevanceDecision {
	if (isPassthrough(item)) {
		return {
			keep: true,
			score: 999,
			localHits: 0,
			negativeHits: 0,
			mixedSource: false
		};
	}

	const mixed = isMixedSource(item.source);
	const strictLocal = STRICT_LOCAL_SOURCES.has(item.source);
	const text = `${item.title} ${item.description || ''} ${item.content || ''}`.toLowerCase();

	const strongHits = includesAny(text, STRONG_LOCAL_SIGNALS);
	const mediumHits = includesAny(text, MEDIUM_LOCAL_SIGNALS);
	const negativeHits = includesAny(text, GLOBAL_NEGATIVE_SIGNALS);
	const hasLocalAnchor = strictLocal || !!item.townSlug || strongHits > 0 || mediumHits >= 2;

	const isEditorial =
		EDITORIAL_URL_PATTERNS.some((p) => p.test(item.link || '')) ||
		EDITORIAL_TITLE_PATTERNS.some((p) => p.test(item.title || ''));

	let score = 0;
	score += Math.min(strongHits, 4) * 2;
	score += Math.min(mediumHits, 3);
	if (item.townSlug) score += 4;
	if (strictLocal) score += 2;
	score -= Math.min(negativeHits, 4) * 2;
	if (isEditorial && mixed) score -= 2;

	// Mixed feeds must be anchored locally.
	if (mixed && !hasLocalAnchor) {
		return {
			keep: false,
			score,
			localHits: strongHits + mediumHits,
			negativeHits,
			mixedSource: mixed
		};
	}

	// Thresholds tuned for precision in politics/crime wires.
	const threshold = mixed ? 3 : 1;
	const keep = hasLocalAnchor && score >= threshold;

	return {
		keep,
		score,
		localHits: strongHits + mediumHits,
		negativeHits,
		mixedSource: mixed
	};
}

export function isLocallyRelevant(item: NewsItem): boolean {
	return getRelevanceDecision(item).keep;
}

/**
 * A headline's place from the reviewed gazetteer (NEWSPIN2). The title only: a place in a summary
 * is too often a meeting venue. Phrases match whole words, longest first, and towns compete as
 * phrases too, so "Tomales Bay" is the bay and "Point Reyes Station" is the town, never the
 * Lighthouse; a school or agency named after a place (NOT_PLACES) is a phrase that names nothing.
 * Two different places in one title place neither; a venue must agree with the title's town when
 * it names one, while an area stands alone.
 */
import { NOT_PLACES, PLACES, type Place } from '$lib/config/places';
import { MARIN_TOWNS } from '$lib/config/towns';
import { TOWN_ALIASES } from '$lib/config/keywords';

type Hit = { kind: 'place'; place: Place } | { kind: 'town'; slug: string } | { kind: 'other' };

const words = (s: string) =>
	s
		.toLowerCase()
		.replace(/[’']/g, '')
		.split(/[^a-z0-9]+/)
		.filter(Boolean);

/** Every phrase, keyed by its first word, longest first. */
const PHRASES = new Map<string, { words: string[]; hit: Hit }[]>();
const add = (phrase: string, hit: Hit) => {
	const w = words(phrase);
	PHRASES.set(w[0], [...(PHRASES.get(w[0]) ?? []), { words: w, hit }]);
};
for (const place of PLACES)
	for (const name of [place.name, ...place.aliases]) add(name, { kind: 'place', place });
for (const town of MARIN_TOWNS) add(town.name, { kind: 'town', slug: town.slug });
for (const [alias, slug] of Object.entries(TOWN_ALIASES)) add(alias, { kind: 'town', slug });
for (const name of NOT_PLACES) add(name, { kind: 'other' });
for (const list of PHRASES.values()) list.sort((a, b) => b.words.length - a.words.length);

function hits(title: string): Hit[] {
	const w = words(title);
	const out: Hit[] = [];
	for (let i = 0; i < w.length; ) {
		const match = PHRASES.get(w[i])?.find((p) => p.words.every((x, k) => w[i + k] === x));
		if (!match) {
			i++;
			continue;
		}
		out.push(match.hit);
		i += match.words.length;
	}
	return out;
}

export function matchHeadline(title: string): Place | null {
	const found = hits(title);
	const places = new Set(found.flatMap((h) => (h.kind === 'place' ? [h.place] : [])));
	if (places.size !== 1) return null;
	const [place] = places;
	if (place.precision === 'area') return place;
	const towns = found.flatMap((h) => (h.kind === 'town' ? [h.slug] : []));
	return towns.every((t) => t === place.townSlug) ? place : null;
}

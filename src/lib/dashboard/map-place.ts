/**
 * Where the v2 map may put an item (NEWSPIN1), placed only as precisely as its evidence: a show
 * at its reviewed venue when the event's own words agree, a blotter report on its town's dot, a
 * snapshot story at the one reviewed place its headline names (NEWSPIN2) unless the feed gave
 * its own point. Precision is shown and never upgraded: a source's coordinates say where the
 * source is, not where its event happens, so nothing else is placed. v2 builds its own features
 * from a MapPlace; it never sets lat/lon on a NewsItem.
 */
import { namesVenue, venueById } from '$lib/config/venues';
import { matchHeadline } from '$lib/news/gazetteer';
import { TOWN_BY_SLUG } from '$lib/config/towns';
import type { NewsItem } from '$lib/types';

export interface MapPlace {
	lat: number;
	lon: number;
	/** `venue`: drawn as a solid dot. `area`: a soft halo, labelled "(area)". */
	precision: 'venue' | 'area';
	label: string;
	/** Where the place came from, for the detail: "venue list". */
	provenance: string;
}

export type Placement =
	| { kind: 'place'; id: string; place: MapPlace }
	| { kind: 'town'; townSlug: string }
	| { kind: 'none' };

const NONE: Placement = { kind: 'none' };
/** Words that say an event isn't happening in a room you could walk into. */
const NOT_THERE = /\b(virtual|online|live ?stream(ed|ing)?|cancell?ed|postponed)\b/i;
const NOT_THERE_STATUS = /schema\.org\/(EventCancelled|EventPostponed|OnlineEventAttendanceMode)\b/;

export function placeOf(item: NewsItem): Placement {
	if (item.id.startsWith('blotter-'))
		return item.townSlug && TOWN_BY_SLUG[item.townSlug]
			? { kind: 'town', townSlug: item.townSlug }
			: NONE;
	if (item.category !== 'shows') return headlinePlace(item);
	const venue = venueById(item.venueId);
	if (!venue) return NONE;
	if (NOT_THERE.test(`${item.title} ${item.locationText ?? ''}`)) return NONE;
	if (NOT_THERE_STATUS.test(item.content ?? '')) return NONE;
	// A single-venue calendar's event with no words of its own is at the venue; words that
	// don't name it name another place.
	if (item.locationText && !namesVenue(venue, item.locationText)) return NONE;
	return {
		kind: 'place',
		id: `venue:${venue.id}`,
		place: {
			lat: venue.lat,
			lon: venue.lon,
			precision: 'venue',
			label: venue.name,
			provenance: 'venue list'
		}
	};
}

/** A story's place from its title, unless the feed's own point already places it. */
function headlinePlace(item: NewsItem): Placement {
	if (typeof item.lat === 'number' && typeof item.lon === 'number') return NONE;
	const place = matchHeadline(item.title);
	if (!place) return NONE;
	return {
		kind: 'place',
		id: `place:${place.id}`,
		place: {
			lat: place.lat,
			lon: place.lon,
			precision: place.precision,
			label: place.name,
			provenance: 'matched in the headline'
		}
	};
}

/**
 * The reviewed show venues (NEWSPIN1): single-venue calendars whose events the v2 map may place
 * at the venue itself. Each point is the venue's own building, checked against its street
 * address (the review table is in the NEWSPIN1 progress log). Multi-branch and page-based
 * sources (the county library, KWMR, the hub pages) are not venues: their coordinates say only
 * where the source is, never where an event happens.
 *
 * An event's own location words agree with its calendar's venue when they name the venue, an
 * alias or its street address as a whole phrase; anything else names another place.
 */

export interface Venue {
	id: string;
	/** The calendar's source name, as its scraper stamps `source`. */
	source: string;
	name: string;
	/** Other whole phrases that name this venue in an event's own location words. */
	aliases: readonly string[];
	/** Street, town: the street names the venue too. */
	address: string;
	town: string;
	townSlug: string;
	lat: number;
	lon: number;
}

export const VENUES: readonly Venue[] = [
	{
		id: 'sweetwater',
		source: 'Sweetwater Music Hall',
		name: 'Sweetwater Music Hall',
		aliases: ['Sweetwater'],
		address: '19 Corte Madera Ave, Mill Valley',
		town: 'Mill Valley',
		townSlug: 'mill-valley',
		lat: 37.907,
		lon: -122.5481
	},
	{
		id: 'rancho-nicasio',
		source: 'Rancho Nicasio',
		name: 'Rancho Nicasio',
		aliases: [],
		address: '1 Old Rancheria Rd, Nicasio',
		town: 'Nicasio',
		townSlug: 'nicasio',
		lat: 38.0623,
		lon: -122.6983
	},
	{
		id: 'macs',
		source: "Mac's at 19 Broadway",
		name: "Mac's at 19 Broadway",
		aliases: ['19 Broadway'],
		address: '19 Broadway Blvd, Fairfax',
		town: 'Fairfax',
		townSlug: 'fairfax',
		lat: 37.9869,
		lon: -122.588
	},
	{
		id: 'dance-palace',
		source: 'Dance Palace',
		name: 'Dance Palace',
		aliases: [],
		address: '503 B St, Point Reyes Station',
		town: 'Point Reyes Station',
		townSlug: 'point-reyes',
		lat: 38.0686,
		lon: -122.809
	},
	{
		id: 'marin-jcc',
		source: 'Osher Marin JCC',
		name: 'Osher Marin JCC',
		aliases: ['Marin JCC', 'Osher Marin Jewish Community Center'],
		address: '200 N San Pedro Rd, San Rafael',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9994,
		lon: -122.5231
	},
	{
		id: 'tourist-club',
		source: 'Tourist Club',
		name: 'Tourist Club',
		aliases: ['San Francisco Tourist Club', 'Nature Friends Tourist Club'],
		address: '30 Ridge Ave, Mill Valley',
		town: 'Mill Valley',
		townSlug: 'mill-valley',
		lat: 37.8985,
		lon: -122.57
	}
];

export function venueById(id: string | undefined): Venue | undefined {
	return id === undefined ? undefined : VENUES.find((v) => v.id === id);
}

/** A calendar's venue by its source name (the scrapers stamp `venueId` from this). */
export function venueOfSource(source: string): Venue {
	const venue = VENUES.find((v) => v.source === source);
	if (!venue) throw new Error(`no reviewed venue for ${source}`);
	return venue;
}

/** Street words as calendars spell them variously ("200 N. San Pedro Rd." = "200 North San Pedro Road"). */
const STREET_WORDS: Record<string, string> = {
	north: 'n',
	south: 's',
	east: 'e',
	west: 'w',
	street: 'st',
	road: 'rd',
	avenue: 'ave',
	boulevard: 'blvd',
	highway: 'hwy',
	drive: 'dr',
	lane: 'ln'
};

const words = (s: string) =>
	` ${s
		.toLowerCase()
		.replace(/[’']/g, '')
		.split(/[^a-z0-9&]+/)
		.filter(Boolean)
		.map((w) => STREET_WORDS[w] ?? w)
		.join(' ')} `;

/** True when the words name this venue, an alias or its street as a whole phrase. */
export function namesVenue(venue: Venue, text: string): boolean {
	const haystack = words(text);
	const street = venue.address.split(',')[0];
	return [venue.name, ...venue.aliases, street].some((phrase) => haystack.includes(words(phrase)));
}

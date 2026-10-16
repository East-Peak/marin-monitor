import { describe, expect, it } from 'vitest';
import { corridorEvents } from './corridors';

const NOW = Date.parse('2026-10-14T23:00:00Z');
let n = 0;
/** A 511 event as /traffic/events returns it (2026-10-14 shape). */
function ev(road: string, [lng, lat]: [number, number], over: Record<string, unknown> = {}) {
	return {
		id: `511.org/${++n}`,
		status: 'ACTIVE',
		event_type: 'INCIDENT',
		event_subtypes: ['Traffic Hazard'],
		severity: 'Moderate',
		created: '2026-10-14T22:20Z',
		schedule: { intervals: ['2026-10-14T22:20Z/'] },
		areas: [{ name: 'Contra Costa' }],
		roads: [{ name: road, direction: 'Westbound', '+article': 'east of', from: 'Central Ave' }],
		geography: { type: 'Point', coordinates: [lng, lat] },
		...over
	};
}
/** The corridor an event is on, else Marin (the old single group, now read from independent tags). */
const groups = (events: unknown[]) =>
	corridorEvents(events, NOW).events.map(
		(e) => `${e.corridor ?? (e.marin ? 'marin' : '-')}${e.certain ? '' : '?'} ${e.road}`
	);
const work = (intervals: unknown, over: Record<string, unknown> = {}) =>
	ev('US-101 N', [-122.52, 37.9], {
		areas: [{ name: 'Marin' }],
		event_type: 'CONSTRUCTION',
		event_subtypes: ['Roadwork'],
		schedule: { intervals },
		...over
	});

describe('corridorEvents (Getting Around roads)', () => {
	it('keeps the live airport-route incidents of 2026-10-14 (I-580 at Central Ave; 101 at Cesar Chavez)', () => {
		const { events, unreadable } = corridorEvents(
			[
				ev('I-580 W', [-122.311741, 37.89741]),
				ev('US-101 S', [-122.405, 37.748], { areas: [{ name: 'San Francisco' }] })
			],
			NOW
		);
		expect(unreadable).toBe(0);
		expect(events.map((e) => e.corridor)).toEqual(['to-oak', 'to-sfo']);
		expect(events[0]).toEqual({
			id: expect.any(String),
			marin: false,
			corridor: 'to-oak',
			trip: null, // westbound on 580 is toward Marin
			closed: false,
			lanes: null,
			certain: true,
			kind: 'Traffic Hazard',
			road: 'I-580',
			where: 'Westbound east of Central Ave',
			severity: 'Moderate',
			reportedAt: '2026-10-14T22:20:00.000Z'
		});
	});

	it('every configured segment keeps events along the itinerary, junctions included (route geometry, not just the two observed incidents)', () => {
		const points: [string, [number, number]][] = [
			['US-101 S', [-122.553, 38.1]], // Novato
			['US-101 S', [-122.478, 37.81]], // Golden Gate Bridge
			['US-101 S', [-122.405, 37.748]], // Cesar Chavez
			['US-101 S', [-122.39, 37.616]], // SFO exit
			['CA-1 S', [-122.472, 37.785]], // Park Presidio (from the bridge)
			['CA-1 S', [-122.476, 37.76]], // 19th Ave at Golden Gate Park
			['CA-1 S', [-122.475, 37.733]], // 19th Ave at Sloat
			['CA-1 S', [-122.469, 37.712]], // Junipero Serra, the 280 junction
			['I-280 S', [-122.469, 37.71]], // the CA-1 junction
			['I-280 S', [-122.47, 37.7]], // Daly City
			['I-280 S', [-122.445, 37.635]], // the I-380 junction (San Bruno)
			['I-380 E', [-122.44, 37.632]], // from 280
			['I-380 E', [-122.405, 37.632]], // the 101 junction at SFO
			['I-580 E', [-122.505, 37.95]], // San Rafael
			['I-580 E', [-122.43, 37.935]], // Richmond–San Rafael Bridge
			['I-580 E', [-122.31, 37.897]], // Albany
			['I-80 E', [-122.3, 37.87]], // Berkeley
			['I-80 E', [-122.295, 37.83]], // Emeryville / Maze
			['I-880 S', [-122.28, 37.8]], // Downtown Oakland
			['I-880 S', [-122.195, 37.735]] // Hegenberger (OAK)
		];
		// Order is the ranking's (trip-tagged first), not the itinerary's: compare as a multiset.
		expect(groups(points.map(([road, at]) => ev(road, at))).sort()).toEqual(
			points
				.map(
					([road]) =>
						`${/^(US-101|CA-1|I-280|I-380)\b/.test(road) ? 'to-sfo' : 'to-oak'} ${road.replace(/ [NSEW]$/, '')}`
				)
				.sort()
		);
	});

	it('drops the rest of the Bay Area, including route roads outside their boxes', () => {
		expect(
			groups([
				ev('I-580 E', [-121.73, 37.7], { areas: [{ name: 'Alameda' }] }), // Livermore
				ev('I-580 E', [-122.22, 37.79], { areas: [{ name: 'Alameda' }] }), // Oakland, not on the OAK route
				ev('US-101 S', [-122.07, 37.41], { areas: [{ name: 'Santa Clara' }] }), // Mountain View
				ev('CA-1 S', [-122.79, 38.04], { areas: [{ name: 'Sonoma' }] }), // CA-1 north, outside the SF box
				ev('I-680 N', [-122.06, 37.92]), // Walnut Creek
				ev('CA-116', [-123.0, 38.48], { areas: [{ name: 'Sonoma' }] })
			])
		).toEqual([]);
	});

	it('matches any of its roads, not only the first (Codex r1 #4)', () => {
		expect(
			groups([
				ev('Airport Dr', [-122.195, 37.735], {
					roads: [{ name: 'Airport Dr' }, { name: 'I-880 S' }]
				})
			])
		).toEqual(['to-oak I-880']);
	});

	it('keeps any Marin road, but never long-term construction (CA-1 at Olema)', () => {
		expect(
			groups([
				ev('Sir Francis Drake Blvd', [-122.6, 37.95], { areas: [{ name: 'Marin' }] }),
				ev('CA-1 S', [-122.79, 38.04], {
					areas: [{ name: 'Marin' }],
					event_type: 'CONSTRUCTION',
					event_subtypes: ['Long-term construction'],
					schedule: { intervals: ['2025-09-24T04:01Z/2026-11-30T16:59Z'] }
				})
			])
		).toEqual(['marin Sir Francis Drake Blvd']);
	});

	it('schedules are three-valued: in effect → kept; every interval readable and none now → dropped; anything unreadable → kept', () => {
		expect(
			groups([
				work(['2026-10-15T05:00Z/2026-10-15T13:00Z']), // tonight only: dropped
				work(['2026-10-14T22:00Z/2026-10-15T02:00Z']), // now
				work(['garbage']), // unreadable
				work(['2026-10-15T05:00Z/2026-10-15T13:00Z', 'garbage']), // mixed: not provably inactive (Codex r1 #5)
				work(['2026-10-15T05:00Z/2026-10-14T13:00Z']), // reversed: unreadable
				work([]), // none: unreadable
				work(['2026-02-30T00:00Z/2026-03-03T00:00Z']), // an impossible date is not "inactive" (Codex r6 #1)
				work(['2026-10-14T16:00:00/2026-10-14T18:00:00']) // zone-less: depends on the server's zone, so unknown
			])
		).toEqual(Array.from({ length: 7 }, () => 'to-sfo US-101'));
	});

	it('an incident counts whatever its schedule says; an inactive event never', () => {
		expect(
			groups([
				ev('I-80 E', [-122.3, 37.88], {
					schedule: { intervals: ['2026-10-13T00:00Z/2026-10-13T01:00Z'] }
				}),
				ev('I-80 E', [-122.3, 37.88], { status: 'ARCHIVED' })
			])
		).toEqual(['to-oak I-80']);
		expect(
			corridorEvents([ev('I-80 E', [-122.3, 37.88], { status: 'ARCHIVED' })], NOW).unreadable
		).toBe(0);
	});

	it('a route-road event that cannot be placed is kept and marked uncertain; out-of-range coordinates are no place', () => {
		expect(
			groups([
				ev('I-880 S', [0, 0], { geography: { type: 'LineString', coordinates: [] } }),
				ev('US-101 S', [-222.4, 37.7])
			])
		).toEqual(['to-oak? I-880', 'to-sfo? US-101']);
	});

	it('records it cannot read are counted, never silently dropped (Codex r1 #3)', () => {
		const read = corridorEvents(
			[
				{},
				'nonsense',
				{ ...ev('I-80 E', [-122.3, 37.88]), id: 42 },
				ev('Some Rd', [-122.0, 37.5], { areas: [] }), // no county and no route road: can't tell if it is in Marin
				ev('I-80 E', [-122.3, 37.88], { roads: undefined, areas: [{ name: 'Alameda' }] }), // no road: can't tell it is off the OAK route (Codex r2 #1)
				ev('I-80 E', [-122.3, 37.88], { status: 'PENDING' }), // a status 511 doesn't define
				ev('Airport Dr', [-122.195, 37.735], {
					roads: [{ name: 'Airport Dr' }, {}],
					areas: [{ name: 'Alameda' }]
				}), // a road we can't read could be I-880 (Codex r3 #1)
				ev('Some Rd', [-122.0, 37.5], { areas: [{ name: 'Alameda' }, { title: 'x' }] }), // a county we can't read could be Marin
				ev('I-680 N', [-122.06, 37.92]) // a readable event outside the corridors: excluded, not unreadable
			],
			NOW
		);
		expect(read).toEqual({ events: [], unreadable: 8 });
	});

	it('the same event twice is one row; a disagreeing copy is unreadable (Codex r4 #2)', () => {
		const one = ev('I-80 E', [-122.3, 37.88]);
		expect(corridorEvents([one, one], NOW)).toEqual({
			events: [expect.objectContaining({ id: one.id })],
			unreadable: 0
		});
		expect(corridorEvents([one, { ...one, severity: 'Major' }], NOW).unreadable).toBe(1);
	});

	it("most severe first, unknown before Moderate (call 5), then newest; 511's own words; 'between' when it gives from and to", () => {
		const { events } = corridorEvents(
			[
				ev('I-280 S', [-122.45, 37.7], { severity: 'Minor', created: '2026-10-14T22:50Z' }),
				ev('I-280 S', [-122.45, 37.7], {
					severity: 'Major',
					created: '2026-10-14T21:00Z',
					roads: [{ name: 'I-280 S', direction: 'Southbound', from: 'Daly City', to: 'San Bruno' }]
				}),
				ev('I-280 S', [-122.45, 37.7], {
					severity: 'Unknown',
					event_subtypes: [],
					created: 'not a time'
				}),
				ev('I-280 S', [-122.45, 37.7], { severity: 'Minor', created: '2026-10-14T22:55Z' })
			],
			NOW
		);
		expect(events.map((e) => [e.severity, e.reportedAt])).toEqual([
			['Major', '2026-10-14T21:00:00.000Z'],
			[null, null],
			['Minor', '2026-10-14T22:55:00.000Z'],
			['Minor', '2026-10-14T22:50:00.000Z']
		]);
		expect(events[0].where).toBe('Southbound between Daly City and San Bruno');
		expect(events[1].kind).toBe('Incident');
	});
});

/** Live 511 shapes of 2026-10-16 (fixtures-getting-around-2026-10-16/traffic.json): roadwork with a road `state`. */
const roadwork = (
	road: { name: string; direction?: string; state?: string; from?: string; to?: string },
	at: [number, number],
	over: Record<string, unknown> = {}
) =>
	ev(road.name, at, {
		event_type: 'CONSTRUCTION',
		event_subtypes: ['Roadwork'],
		severity: 'Unknown',
		schedule: { intervals: ['2026-10-14T22:00Z/2026-10-15T13:59Z'] },
		areas: [{ name: 'Marin' }],
		roads: [{ '+article': 'between', state: 'SOME_LANES_CLOSED', ...road }],
		...over
	});
const CORTE_MADERA: [number, number] = [-122.516002, 37.932177];
const tags = (events: unknown[]) =>
	corridorEvents(events, NOW).events.map((e) => [e.marin, e.corridor, e.trip]);

describe('corridorEvents: independent tags, direction, closures (Getting Around v2)', () => {
	it('tags a Corte Madera US-101 S event as Marin and to SFO', () => {
		expect(
			tags([
				roadwork(
					{
						name: 'US-101 S',
						direction: 'Southbound',
						from: 'I-580 W',
						to: 'Tamalpais Dr'
					},
					CORTE_MADERA
				)
			])
		).toEqual([[true, 'to-sfo', 'to-sfo']]);
	});

	it('a US-101 N event in Marin is Marin, corridor to-sfo, trip null', () => {
		expect(
			tags([
				roadwork(
					{
						name: 'US-101 N',
						direction: 'Northbound',
						from: 'Tamalpais Dr',
						to: 'I-580 W'
					},
					CORTE_MADERA
				)
			])
		).toEqual([[true, 'to-sfo', null]]);
	});

	it('"Eastbound and Westbound" on I-580 is trip to-oak', () => {
		expect(
			tags([
				ev('I-580 W', [-122.43, 37.935], {
					roads: [{ name: 'I-580 W', direction: 'Eastbound and Westbound', from: 'Castro St' }]
				})
			])
		).toEqual([[false, 'to-oak', 'to-oak']]);
	});

	it('empty direction matches the trip', () => {
		expect(
			tags([
				ev('I-380', [-122.44, 37.632], { roads: [{ name: 'I-380', from: 'I-280' }] }),
				ev('I-880 N', [-122.28, 37.8], {
					roads: [{ name: 'I-880 N', direction: '', from: 'Broadway' }]
				})
			]).map(([, , trip]) => trip)
		).toEqual(['to-sfo', 'to-oak']);
	});

	it('long-term construction with a CLOSED road is kept, with SOME_LANES_CLOSED it is skipped', () => {
		const longTerm = (state: string) =>
			roadwork({ name: 'US-101 S', direction: 'Southbound', state }, CORTE_MADERA, {
				event_subtypes: ['Long-term construction'],
				schedule: { intervals: ['2025-09-24T04:01Z/2026-11-30T16:59Z'] }
			});
		const { events } = corridorEvents([longTerm('CLOSED'), longTerm('SOME_LANES_CLOSED')], NOW);
		expect(events.map((e) => [e.kind, e.closed])).toEqual([['Long-term construction', true]]);
	});

	it('ranks closed, Major, unknown, Moderate, Minor; trip before Marin-only at equal rank', () => {
		const at = (id: string, over: Record<string, unknown>, direction = 'Southbound') =>
			ev('US-101 S', CORTE_MADERA, {
				id,
				areas: [{ name: 'Marin' }],
				roads: [{ name: direction === 'Southbound' ? 'US-101 S' : 'US-101 N', direction }],
				created: '2026-10-14T22:00Z',
				...over
			});
		const { events } = corridorEvents(
			[
				at('minor', { severity: 'Minor' }),
				at('moderate', { severity: 'Moderate' }),
				at(
					'unknown-marin-only',
					{ severity: 'Unknown', created: '2026-10-14T22:30Z' },
					'Northbound'
				),
				at('unknown-trip', { severity: 'Unknown' }),
				at('major', { severity: 'Major' }),
				at('closed', {
					severity: 'Minor',
					roads: [{ name: 'US-101 S', direction: 'Southbound', state: 'CLOSED' }]
				})
			],
			NOW
		);
		expect(events.map((e) => e.id)).toEqual([
			'closed',
			'major',
			'unknown-trip',
			'unknown-marin-only',
			'moderate',
			'minor'
		]);
	});

	it('SOME_LANES_CLOSED sets lanes "some lanes closed"; SINGLE_LANE_ALTERNATING "one lane alternating"', () => {
		const { events } = corridorEvents(
			[
				roadwork({ name: 'US-101 S', direction: 'Southbound' }, CORTE_MADERA),
				roadwork(
					{ name: 'US-101 N', direction: 'Northbound', state: 'SINGLE_LANE_ALTERNATING' },
					CORTE_MADERA,
					{ created: '2026-10-14T22:00Z' }
				)
			],
			NOW
		);
		expect(events.map((e) => [e.lanes, e.closed])).toEqual([
			['some lanes closed', false],
			['one lane alternating', false]
		]);
	});
});

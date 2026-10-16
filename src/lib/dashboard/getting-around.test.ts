import { describe, expect, it } from 'vitest';
import type { TransitAgencyRead, TransitAlertRow } from '$lib/api/marin/transit';
import type { TrafficCorridorsData } from '$lib/api/marin/traffic-corridors';
import type { AirportStatus, AirportStatusData } from '$lib/types/airport';
import type { DatasetFetch } from './source-adapters';
import { describePresentation } from './source-status';
import {
	faaText,
	gettingAroundView,
	PROMO_HEADLINES,
	transitRows,
	type GettingAroundInput,
	type Line
} from './getting-around';

const NOW = Date.parse('2026-10-14T23:00:00Z');
const MIN = 60_000;
const AGENCIES = [
	['GG', 'Golden Gate Transit'],
	['GF', 'Golden Gate Ferry'],
	['MA', 'Marin Transit'],
	['SA', 'SMART'],
	['AF', 'Angel Island Ferry']
] as const;
function reads(
	over: Partial<Record<string, Partial<TransitAgencyRead>>> = {}
): TransitAgencyRead[] {
	return AGENCIES.map(([id, name]) => ({
		id,
		name,
		alerts: [],
		observedAt: NOW - 2 * MIN,
		error: null,
		...over[id]
	}));
}
const alert = (
	id: string,
	headline: string,
	over: Partial<TransitAlertRow> = {}
): TransitAlertRow => ({
	id,
	title: headline,
	headline,
	description: null,
	stopIds: [],
	timing: 'now',
	url: null,
	...over
});
const alerts = (n: number, agency = 'MA') =>
	Array.from({ length: n }, (_, i) =>
		alert(`511-${agency}-${i + 1}`, `Alert ${i + 1}`, {
			url: i === 0 ? 'https://marintransit.gov/a' : null
		})
	);
/** The 9 live Marin Transit alerts of 2026-10-16 ~4 AM (fixtures-getting-around-2026-10-16/MA.json), timed at the feed. */
const MA_LIVE: TransitAlertRow[] = [
	{
		id: '511-MA-1181972814',
		title: 'Nighttime bus pad closures. Visit marintransit.gov for details. (71)',
		headline: 'Nighttime bus pad closures. Visit marintransit.gov for details.',
		description: null,
		stopIds: [],
		timing: 'now',
		url: null
	},
	{
		id: '511-MA-1187139282',
		title: 'Save Money with Clipper!',
		headline: 'Save Money with Clipper!',
		description:
			'Clipper offers a variety of discounts to save you money on Marin Transit—making it easy to get around for less. Visit marintransit.gov for more information. \r\n-\r\n¡Ahorre dinero con Clipper! Clipper ofrece diversos descuentos para que ahorre en Marin Transit, facilitándole desplazarse por menos dinero. Visite marintransit.gov para obtener más información.',
		stopIds: [],
		timing: 'now',
		url: 'https://marintransit.gov/clipper'
	},
	{
		id: '511-MA-MA_Night Closure - SB Terra Linda-1791823141476',
		title: 'Night Closure - SB Terra Linda',
		headline: 'Night Closure - SB Terra Linda',
		description:
			'Due to construction, this stop will be closed from 8pm to 6am the next day from 10/12 to 10/16.',
		stopIds: ['42112'],
		timing: 'unverified',
		url: null
	},
	{
		id: '511-MA-MA_West End Block Party-1786732506974',
		title: 'West End Block Party',
		headline: 'West End Block Party',
		description:
			'Due to the West End Block Party, stops between 4th St & E St and 4th St & Ida St will not be served between 5pm and 11pm every Friday between 8/21 and 10/16.',
		stopIds: ['40424', '40422', '40421'],
		timing: 'now',
		url: null
	},
	{
		id: '511-MA-MA_Night Closure - Lucky Dr-1791823005224',
		title: 'Night Closure - Lucky Dr',
		headline: 'Night Closure - Lucky Dr',
		description:
			'Due to construction, this stop will be closed from 10pm to 7am the next day from 10/12 to 10/16.',
		stopIds: ['40268'],
		timing: 'unverified',
		url: null
	},
	{
		id: '511-MA-MA_Night Closure - NB Terra Linda-1791820735127',
		title: 'Night Closure - NB Terra Linda',
		headline: 'Night Closure - NB Terra Linda',
		description:
			'Due to construction, this stop will be closed after 7pm to 7am the next day from 10/12 to 10/16.',
		stopIds: ['42027'],
		timing: 'unverified',
		url: null
	},
	{
		id: '511-MA-MA_Night Closure - N San Pedro Rd-1791820615363',
		title: 'Night Closure - N San Pedro Rd',
		headline: 'Night Closure - N San Pedro Rd',
		description:
			'Due to construction, this stop will not be served from 8pm to 6am the next day from 10/12 to 10/16.',
		stopIds: ['40581', '40580'],
		timing: 'unverified',
		url: null
	},
	{
		id: '511-MA-MA_Night Closure - Lucas Valley Rd-1791820418382',
		title: 'Night Closure - Lucas Valley Rd',
		headline: 'Night Closure - Lucas Valley Rd',
		description:
			'Due to construction, this stop will be closed from 8pm to 6am the next day from 10/12 to 10/16.',
		stopIds: ['40606'],
		timing: 'unverified',
		url: null
	},
	{
		id: '511-MA-MA_Night Closure - Smith Ranch Rd-1791820275588',
		title: 'Night Closure - Smith Ranch Rd',
		headline: 'Night Closure - Smith Ranch Rd',
		description:
			'Due to construction, this stop will be closed from 8pm to 7am the next day from 10/12 to 10/16,',
		stopIds: ['40607'],
		timing: 'unverified',
		url: null
	}
];

const NO_511 = 'No alerts on 511; check the agencies';
const airport = (code: string, over: Partial<AirportStatus> = {}): AirportStatus => ({
	code,
	icao: `K${code}`,
	name: code,
	status: 'on-time',
	delays: [],
	weather: null,
	forecastNotes: [],
	tsa: null,
	...over
});
const AIRPORTS: AirportStatusData = {
	lastUpdated: new Date(NOW - 3 * MIN).toISOString(),
	airports: [airport('SFO'), airport('OAK')]
};
const TRAFFIC: TrafficCorridorsData = {
	checkedAt: new Date(NOW - MIN).toISOString(),
	upstreamCount: 40,
	unreadable: 0,
	events: []
};
const live = (at: number): DatasetFetch => ({ kind: 'live', observedAt: at });
const failed = (retained: boolean, at: number | null = null): DatasetFetch => ({
	kind: 'failed',
	error: 'HTTP 502',
	retained,
	observedAt: at
});
function input(over: Partial<GettingAroundInput> = {}): GettingAroundInput {
	return {
		transit: { reads: reads(), error: null },
		airport: AIRPORTS,
		traffic: TRAFFIC,
		outcomes: { airport: live(NOW - 3 * MIN), traffic: live(NOW - MIN) },
		open: true,
		now: NOW,
		...over
	};
}
const said = (lines: Line[]) => lines.map((l) => `${l.label} · ${l.text}`);
const header = (i: GettingAroundInput) => describePresentation(gettingAroundView(i).status, NOW);
const ALL_CLEAR =
	/511 lists no alerts|No alerts on 511|No incidents listed|reports no incidents|No delays reported|No airport-wide delays|on time/i;
const everything = (i: GettingAroundInput) => {
	const v = gettingAroundView(i);
	return [v.airports, v.roads, v.transit]
		.flatMap((p) => [
			...said(p.lines),
			p.note ?? '',
			...p.rows.flatMap((r) => [r.tag ?? '', r.title, r.meta]),
			p.scope ?? '',
			p.meta ?? ''
		])
		.join('\n');
};

describe('gettingAroundView', () => {
	it('a fresh, complete, timed read with nothing listed says so where 511 is trusted, links elsewhere, and the header stays quiet', () => {
		const v = gettingAroundView(input());
		expect(said(v.transit.lines)).toEqual([
			`Golden Gate Transit, Golden Gate Ferry, Marin Transit, SMART, Angel Island Ferry · ${NO_511}`
		]);
		expect(v.transit.lines[0].links.map((l) => l.url)).toEqual([
			'https://www.goldengate.org/service-alerts/',
			'https://marintransit.gov/service-alerts',
			'https://www.sonomamarintrain.org/',
			'https://angelislandferry.com/'
		]);
		expect(v.roads.note).toBe(
			"511 reports no incidents on these roads · congestion isn't measured"
		);
		expect(v.roads.scope).toBe(
			'Marin roads; 101, 19th Ave, 280 and 380 to SFO; 580, 80 and 880 to OAK. Long-term construction shown only when it closes a road.'
		);
		expect([v.airports.lines, v.airports.note]).toEqual([
			[],
			'No airport-wide delays at SFO or OAK'
		]);
		expect([v.transit.meta, v.airports.meta, v.roads.meta]).toEqual([
			'511 · updated 2 min ago',
			'FAA · checked 3 min ago',
			'511 · checked 1 min ago'
		]);
		expect(header(input())).toBeNull();
	});

	it('failed SMART read stays its own unavailable line; the header names it (design: a failed read says unavailable)', () => {
		const i = input({
			transit: {
				reads: reads({ SA: { alerts: null, observedAt: null, error: 'SMART: HTTP 503' } }),
				error: null
			}
		});
		const v = gettingAroundView(i);
		expect(said(v.transit.lines)).toEqual([
			`Golden Gate Transit, Golden Gate Ferry, Marin Transit, Angel Island Ferry · ${NO_511}`,
			'SMART · Alerts unavailable'
		]);
		expect(v.transit.lines[1]).toMatchObject({
			id: 'SA',
			state: 'unavailable',
			url: 'https://www.sonomamarintrain.org/'
		});
		expect(header(i)).toBe('Partial coverage · SMART unavailable');
	});

	it('before the first transit read Marin Transit is loading; closed, the header says Loading… and asks for nothing else', () => {
		const v = gettingAroundView(
			input({ transit: { reads: null, error: null }, open: false, outcomes: {} })
		);
		const ma = v.transit.lines.find((l) => l.id === 'MA')!;
		expect([ma.text, ma.state]).toEqual(['Loading…', 'loading']);
		expect(v.status.state).toBe('loading');
		expect(v.airports.lines).toEqual([]);
		expect(v.roads.note).toBeNull();
	});

	it('closed, a failing detail is not in the header; open, it is', () => {
		const outcomes = { airport: failed(false), traffic: live(NOW - MIN) };
		expect(header(input({ open: false, outcomes, airport: null }))).toBeNull();
		expect(header(input({ open: true, outcomes, airport: null }))).toBe(
			'Partial coverage · FAA airport status unavailable'
		);
	});

	it('alerts: no count line; previewed 3 rows in agency then feed order with their own links, the rest counted', () => {
		const v = gettingAroundView(
			input({
				transit: {
					reads: reads({ MA: { alerts: alerts(4) }, GG: { alerts: alerts(1, 'GG') } }),
					error: null
				}
			})
		);
		expect(said(v.transit.lines)).toEqual([
			`Golden Gate Ferry, SMART, Angel Island Ferry · ${NO_511}`
		]);
		expect(v.transit.rows.map((r) => [r.id, r.url, r.meta])).toEqual([
			['511-GG-1', 'https://marintransit.gov/a', 'Golden Gate Transit'],
			['511-MA-1', 'https://marintransit.gov/a', 'Marin Transit'],
			['511-MA-2', null, 'Marin Transit']
		]);
		expect(v.transit.more).toBe(2);
	});

	it('a failed Marin Transit read is unavailable, never "511 lists no alerts", and the header names it', () => {
		const i = input({
			transit: {
				reads: reads({ MA: { alerts: null, observedAt: null, error: 'Marin Transit: HTTP 503' } }),
				error: null
			}
		});
		const ma = gettingAroundView(i).transit.lines.find((l) => l.id === 'MA')!;
		expect([ma.text, ma.state]).toEqual(['Alerts unavailable', 'unavailable']);
		expect(header(i)).toBe('Partial coverage · Marin Transit unavailable');
	});

	it('a whole transit read that failed: first → unavailable, never loading forever; after a fresh empty read → out of date, never "511 lists no alerts" (Codex r1 #2)', () => {
		const ma = (i: GettingAroundInput) =>
			gettingAroundView(i).transit.lines.find((l) => l.id === 'MA')!.text;
		expect(
			ma(input({ transit: { reads: null, error: 'transit: timed out after 15000 ms' } }))
		).toBe('Alerts unavailable');
		const later = input({
			transit: { reads: reads(), error: 'transit: timed out after 15000 ms' }
		});
		expect(ma(later)).toBe('Out of date');
		expect(everything(later)).not.toMatch(/511 lists no alerts|No alerts on 511/);
	});

	it.each([
		[{ observedAt: NOW - 45 * MIN }, 'Out of date'],
		[{ observedAt: null }, 'Not verified'],
		[{ observedAt: NOW - 45 * MIN, alerts: alerts(2) }, '2 alerts listed · out of date'],
		[{ observedAt: null, alerts: alerts(1) }, '1 alert listed · age unknown']
	] as [Partial<TransitAgencyRead>, string][])(
		'Marin Transit emptiness needs a fresh, timed feed: %j → %s',
		(over, text) => {
			const v = gettingAroundView(input({ transit: { reads: reads({ MA: over }), error: null } }));
			expect(v.transit.lines.find((l) => l.id === 'MA')!.text).toBe(text);
		}
	);

	it('an agency missing from the read is not checked: Not verified', () => {
		const v = gettingAroundView(
			input({ transit: { reads: reads().filter((r) => r.id !== 'MA'), error: null } })
		);
		expect(v.transit.lines.find((l) => l.id === 'MA')!.text).toBe('Not verified');
	});

	it.each([
		[{}, 'No delays reported'],
		[
			{
				status: 'ground-delay',
				delays: [{ type: 'ground-delay', avgMinutes: 45, maxMinutes: 90 }]
			},
			'Ground delay, avg 45 min, up to 90 min'
		],
		[
			{
				status: 'delays',
				delays: [{ type: 'arrival-delay', avgMinutes: 30 }, { type: 'departure-delay' }]
			},
			'Arrival delays, avg 30 min · Departure delays'
		],
		[
			{ status: 'on-time', delays: [{ type: 'scheduled-closure' }, { type: 'notice' }] },
			'No delays reported · Closure scheduled · FAA notice'
		],
		[{ status: 'closed', delays: [] }, 'Closed'],
		[{ status: 'ground-stop', delays: [{ type: 'ground-stop' }] }, 'Ground stop'],
		[{ status: 'unknown', delays: [] }, null]
	] as [Partial<AirportStatus>, string | null][])('faaText %j → %s', (over, words) => {
		expect(faaText(airport('SFO', over))).toBe(words);
	});

	it('an unreadable FAA read is "FAA status unavailable", never no delays; a missing airport too; the header names each', () => {
		const i = input({
			airport: { ...AIRPORTS, airports: [airport('OAK', { status: 'unknown' })] }
		});
		const v = gettingAroundView(i);
		expect(said(v.airports.lines)).toEqual([
			'SFO · FAA status unavailable',
			'OAK · FAA status unavailable'
		]);
		expect(v.status.failing.map((e) => [e.name, e.detail])).toEqual([
			['FAA status for SFO', 'not in the response'],
			['FAA status for OAK', 'FAA feed unreadable']
		]);
		expect(said(v.airports.lines).join('\n')).not.toMatch(ALL_CLEAR);
	});

	it('an FAA all-clear needs an ok read: retained, old, untimed or future → not an all-clear; real delays keep their words with the caveat (Codex r1 #1)', () => {
		const delayed = {
			...AIRPORTS,
			airports: [
				airport('SFO', { status: 'ground-stop', delays: [{ type: 'ground-stop' }] }),
				airport('OAK')
			]
		};
		const cases: [DatasetFetch, string[]][] = [
			[
				failed(true, NOW - 3 * MIN),
				['SFO · Ground stop · out of date', 'OAK · FAA status out of date']
			],
			[live(NOW - 40 * MIN), ['SFO · Ground stop · out of date', 'OAK · FAA status out of date']],
			[live(Number.NaN), ['SFO · Ground stop · not verified', 'OAK · FAA status not verified']],
			[live(NOW + 60 * MIN), ['SFO · Ground stop · not verified', 'OAK · FAA status not verified']]
		];
		const future = input({
			airport: delayed,
			outcomes: { airport: live(NOW + 60 * MIN), traffic: live(NOW - MIN) }
		});
		expect(gettingAroundView(future).airports.meta).toBe('FAA · time unknown');
		for (const [airportFetch, expected] of cases) {
			const i = input({
				airport: delayed,
				outcomes: { airport: airportFetch, traffic: live(NOW - MIN) }
			});
			expect(said(gettingAroundView(i).airports.lines)).toEqual(expected);
			expect(said(gettingAroundView(i).airports.lines).join('\n')).not.toMatch(ALL_CLEAR);
		}
	});

	it('a 200 with no FAA status for either airport is not coverage: with everything else down the header says unavailable, never "Nothing new" (Codex r2 #2)', () => {
		const i = input({
			airport: {
				...AIRPORTS,
				airports: [airport('SFO', { status: 'unknown' }), airport('OAK', { status: 'unknown' })]
			},
			outcomes: { airport: live(NOW - 3 * MIN), traffic: failed(false) },
			traffic: null,
			transit: { reads: null, error: 'transit: HTTP 503' }
		});
		const v = gettingAroundView(i);
		expect([v.status.state, v.airports.state]).toEqual(['unavailable', 'unavailable']);
		expect(header(i)).toMatch(
			/^Source unavailable · FAA status for SFO, FAA status for OAK, 511 traffic/
		);
	});

	it('a future or missing transit feed time is "time unknown" in the footer, checked per feed before taking the oldest (Codex r2 #6, r3 #2)', () => {
		const meta = (over: Partial<TransitAgencyRead>) =>
			gettingAroundView(input({ transit: { reads: reads({ MA: over }), error: null } })).transit
				.meta;
		expect(meta({ observedAt: NOW + 60 * MIN })).toBe('511 · time unknown');
		expect(meta({ observedAt: null })).toBe('511 · time unknown');
		expect(meta({ observedAt: NOW - 4 * MIN })).toBe('511 · updated 4 min ago');
		// Two claiming feeds: an older valid time must not mask the other's future one (Codex B1 #1).
		const twoFeeds = reads({
			GG: {
				alerts: [alert('511-GG-1', 'Route 101 detour')],
				observedAt: NOW - 10 * MIN
			},
			MA: { observedAt: NOW + 60 * MIN }
		});
		expect(
			gettingAroundView(input({ transit: { reads: twoFeeds, error: null } })).transit.meta
		).toBe('511 · time unknown');
	});

	it('details while loading, after a first failure, and retained after a failed refresh', () => {
		const loading = gettingAroundView(input({ outcomes: {}, airport: null, traffic: null }));
		expect([loading.airports.note, loading.roads.note]).toEqual([
			'Loading airport status…',
			'Loading traffic…'
		]);
		const failedFirst = gettingAroundView(
			input({
				airport: null,
				traffic: null,
				outcomes: { airport: failed(false), traffic: failed(false) }
			})
		);
		expect([failedFirst.airports.note, failedFirst.roads.note]).toEqual([
			'Airport status unavailable',
			'Traffic incidents unavailable'
		]);
		const retained = gettingAroundView(
			input({
				outcomes: { airport: failed(true, NOW - 3 * MIN), traffic: failed(true, NOW - MIN) }
			})
		);
		expect(retained.roads.note).toBe('Traffic out of date');
		expect(retained.roads.meta).toBe('511 · checked 1 min ago · out of date');
	});

	it('an old, untimed or partly unreadable traffic read never says "No incidents listed" (Codex r1 #3)', () => {
		const old = gettingAroundView(
			input({ outcomes: { airport: live(NOW - 3 * MIN), traffic: live(NOW - 20 * MIN) } })
		);
		const untimed = gettingAroundView(
			input({ outcomes: { airport: live(NOW - 3 * MIN), traffic: live(Number.NaN) } })
		);
		const unreadable = input({ traffic: { ...TRAFFIC, unreadable: 2 } });
		expect(old.roads.note).toBe('Traffic out of date');
		expect([untimed.roads.note, untimed.roads.meta]).toEqual([
			'Traffic not verified',
			'511 · time unknown'
		]);
		expect(gettingAroundView(unreadable).roads.note).toBe('Traffic not verified');
		expect(header(unreadable)).toBe('Partial coverage · 511 traffic unverified');
	});

	it('roads row puts road+where first, tag to SFO, tone major; consequence, severity in words and age after', () => {
		const ev = (id: string, over: Partial<TrafficCorridorsData['events'][number]> = {}) => ({
			id,
			marin: false,
			corridor: 'to-oak' as 'to-oak' | 'to-sfo' | null,
			trip: 'to-oak' as 'to-oak' | 'to-sfo' | null,
			closed: false,
			lanes: null as 'some lanes closed' | 'one lane alternating' | null,
			certain: true,
			kind: 'Traffic Hazard',
			road: 'I-580',
			where: 'Westbound east of Central Ave',
			severity: 'Moderate' as 'Major' | 'Moderate' | 'Minor' | null,
			reportedAt: new Date(NOW - 25 * MIN).toISOString(),
			...over
		});
		const view = (events: TrafficCorridorsData['events']) =>
			gettingAroundView(input({ traffic: { ...TRAFFIC, events } })).roads;
		const v = view([
			ev('a', {
				marin: true,
				corridor: 'to-sfo',
				trip: 'to-sfo',
				kind: 'Traffic Collision',
				road: 'US-101',
				where: 'Southbound between I-580 W and Tamalpais Dr',
				lanes: 'some lanes closed',
				severity: 'Major'
			}),
			ev('b', {
				marin: true,
				corridor: null,
				trip: null,
				road: 'Sir Francis Drake Blvd',
				where: '',
				severity: null,
				reportedAt: null
			}),
			ev('c', { closed: true, trip: null, certain: false, kind: 'Roadwork', where: '' }),
			ev('d', { reportedAt: new Date(NOW + 24 * 60 * MIN).toISOString() })
		]);
		expect(v.rows.map((r) => [r.tag, r.title, r.meta, r.tone])).toEqual([
			[
				'to SFO',
				'US-101 SB between I-580 W and Tamalpais Dr', // 511's direction, as the design's "I-280 NB"
				'Traffic Collision · some lanes closed · Major · reported 25 min ago',
				'major'
			],
			['Marin', 'Sir Francis Drake Blvd', 'Traffic Hazard · severity unknown', 'unknown'],
			[
				'toward Marin',
				'I-580',
				'Roadwork · road closed · Moderate · location unconfirmed · reported 25 min ago',
				'closed'
			]
		]);
		expect([v.more, v.note]).toEqual([1, null]);
		expect(
			view([ev('both', { where: 'Eastbound and Westbound east of Bohemian Hwy' })]).rows[0].title
		).toBe('I-580 EB and WB east of Bohemian Hwy');
		// No "reported 1 min ago" for a time tomorrow (Codex r4 #4).
		expect(
			view([ev('d', { reportedAt: new Date(NOW + 24 * 60 * MIN).toISOString() })]).rows[0].meta
		).toBe('Traffic Hazard · Moderate');
		expect(v.rows.every((r) => r.url === null)).toBe(true);
	});

	it('roads ok and empty → "congestion isn\'t measured"; never on a read that isn\'t ok', () => {
		expect(gettingAroundView(input()).roads.note).toBe(
			"511 reports no incidents on these roads · congestion isn't measured"
		);
		const old = gettingAroundView(
			input({ outcomes: { airport: live(NOW - 3 * MIN), traffic: live(NOW - 20 * MIN) } })
		);
		expect(old.roads.note).toBe('Traffic out of date');
	});

	it('airports both clear → one note line; airport with a delay → the two lines', () => {
		expect(gettingAroundView(input()).airports).toMatchObject({
			lines: [],
			note: 'No airport-wide delays at SFO or OAK',
			meta: 'FAA · checked 3 min ago'
		});
		const delayed = gettingAroundView(
			input({
				airport: {
					...AIRPORTS,
					airports: [
						airport('SFO', {
							status: 'ground-delay',
							delays: [{ type: 'ground-delay', avgMinutes: 45 }]
						}),
						airport('OAK')
					]
				}
			})
		).airports;
		expect([said(delayed.lines), delayed.note]).toEqual([
			['SFO · Ground delay, avg 45 min', 'OAK · No delays reported'],
			null
		]);
		// A notice beside "No delays reported" is not "no airport-wide delays": the lines stay.
		const notice = gettingAroundView(
			input({
				airport: {
					...AIRPORTS,
					airports: [airport('SFO', { delays: [{ type: 'notice' }] }), airport('OAK')]
				}
			})
		).airports;
		expect(said(notice.lines)).toEqual([
			'SFO · No delays reported · FAA notice',
			'OAK · No delays reported'
		]);
	});
});

describe('transitRows (Marin Transit, live 2026-10-16)', () => {
	it('groups six Night Closure alerts into one row, 7 stops, Terra Linda SB first, quoting its description', () => {
		const rows = transitRows('Marin Transit', MA_LIVE);
		expect(rows.map((r) => r.title)).toEqual([
			'Nighttime bus pad closures. Visit marintransit.gov for details.',
			'Night Closure · 7 stops: Terra Linda SB, Lucky Dr, Terra Linda NB, …',
			'West End Block Party'
		]);
		expect(rows[1].meta).toBe(
			'Marin Transit · e.g. Terra Linda SB: Due to construction, this stop will be closed from 8pm to 6am the next day from 10/12 to 10/16. · timing unverified'
		);
		expect(rows[2].meta).toBe(
			'Marin Transit · Due to the West End Block Party, stops between 4th St & E St and 4th St & Ida St will not be served between 5pm and 11pm every Friday…'
		);
		expect(rows.every((r) => r.tag === null && r.tone === null)).toBe(true);
	});

	it('drops Save Money with Clipper!', () => {
		expect(PROMO_HEADLINES).toEqual(['Save Money with Clipper!']);
		expect(
			transitRows('Marin Transit', [alert('p', '  Save Money with Clipper! ')]).map((r) => r.title)
		).toEqual([]);
	});

	it('keeps an unlisted promo-like headline', () => {
		expect(
			transitRows('Marin Transit', [alert('e', 'Ride free on Earth Day')]).map((r) => r.title)
		).toEqual(['Ride free on Earth Day']);
	});

	it('drops not-now alerts; a single " - " headline is not a group; no stop IDs counts alerts', () => {
		expect(
			transitRows('SMART', [
				alert('a', 'Delay - Novato', { timing: 'not-now' }),
				alert('b', 'Delay - Petaluma'),
				alert('c', 'Bike car closed')
			]).map((r) => r.title)
		).toEqual(['Delay - Petaluma', 'Bike car closed']);
		expect(
			transitRows('SMART', [alert('a', 'Delay - Novato'), alert('b', 'Delay - NB Petaluma')]).map(
				(r) => [r.title, r.meta]
			)
		).toEqual([['Delay · 2 stops: Novato, Petaluma NB', 'SMART']]);
	});
});

describe('Getting Around v2: transit summaries', () => {
	it('12 alerts → 3 rows and more counts alerts', () => {
		const v = gettingAroundView(
			input({
				transit: {
					reads: reads({
						MA: { alerts: MA_LIVE },
						SA: { alerts: [alert('s1', 'Delay - Novato'), alert('s2', 'Delay - Petaluma')] },
						AF: { alerts: [alert('f1', 'Ferry full'), alert('f2', 'Dock repair')] }
					}),
					error: null
				}
			})
		).transit;
		// 9 live MA (1 promo dropped → 8), 2 SMART (one group row), 2 Angel Island: 12 alerts, 6 rows.
		expect(v.rows).toHaveLength(3);
		expect(v.rows[1].title).toMatch(/^Night Closure · 7 stops/);
		expect(v.more).toBe(4);
	});

	it('GG GF SA AF empty → one no-511 line, goldengate.org once', () => {
		const v = gettingAroundView(
			input({ transit: { reads: reads({ MA: { alerts: MA_LIVE } }), error: null } })
		).transit;
		expect(v.lines).toEqual([
			{
				id: 'no-511',
				label: 'Golden Gate Transit, Golden Gate Ferry, SMART, Angel Island Ferry',
				text: NO_511,
				state: 'reference',
				url: null,
				links: [
					{ label: 'goldengate.org', url: 'https://www.goldengate.org/service-alerts/' },
					{ label: 'sonomamarintrain.org', url: 'https://www.sonomamarintrain.org/' },
					{ label: 'angelislandferry.com', url: 'https://angelislandferry.com/' }
				]
			}
		]);
	});

	it('an agency whose alerts are all promos or not in effect says so, never "No alerts on 511"', () => {
		const v = gettingAroundView(
			input({
				transit: {
					reads: reads({ MA: { alerts: [alert('p', 'Save Money with Clipper!')] } }),
					error: null
				}
			})
		).transit;
		expect(said(v.lines)).toContain('Marin Transit · No disruptions listed on 511 now');
		expect(v.lines.find((l) => l.id === 'no-511')!.label).not.toContain('Marin Transit');
	});

	it("never says tonight / on time / vs usual / don't publish (all view text, every fixture)", () => {
		const fixtures: GettingAroundInput[] = [
			input(),
			input({ transit: { reads: reads({ MA: { alerts: MA_LIVE } }), error: null } }),
			input({ transit: { reads: null, error: 'transit: HTTP 503' } }),
			input({ transit: { reads: reads(), error: 'transit: timed out' } }),
			input({ outcomes: {}, airport: null, traffic: null }),
			input({
				outcomes: { airport: failed(true, NOW - 3 * MIN), traffic: failed(true, NOW - MIN) }
			})
		];
		for (const f of fixtures)
			expect(everything(f)).not.toMatch(/tonight|on time|vs usual|don't publish|all clear/i);
	});
});

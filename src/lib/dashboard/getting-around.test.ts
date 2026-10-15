import { describe, expect, it } from 'vitest';
import type { TransitAgencyRead } from '$lib/api/marin/transit';
import type { TrafficCorridorsData } from '$lib/api/marin/traffic-corridors';
import type { AirportStatus, AirportStatusData } from '$lib/types/airport';
import type { DatasetFetch } from './source-adapters';
import { describePresentation } from './source-status';
import { faaText, gettingAroundView, type GettingAroundInput, type Line } from './getting-around';

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
const alerts = (n: number) =>
	Array.from({ length: n }, (_, i) => ({
		id: `511-MA-${i + 1}`,
		title: `Alert ${i + 1}`,
		url: i === 0 ? 'https://marintransit.gov/a' : null
	}));
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
const ALL_CLEAR = /511 lists no alerts|No incidents listed|No delays reported|on time/i;
const everything = (i: GettingAroundInput) => {
	const v = gettingAroundView(i);
	return [v.airports, v.roads, v.transit]
		.flatMap((p) => [...said(p.lines), p.note ?? ''])
		.join('\n');
};

describe('gettingAroundView', () => {
	it('a fresh, complete, timed read with nothing listed says so where 511 is trusted, links elsewhere, and the header stays quiet', () => {
		const v = gettingAroundView(input());
		expect(said(v.transit.lines)).toEqual([
			'Golden Gate Transit · See goldengate.org',
			'Golden Gate Ferry · See goldengate.org',
			'Marin Transit · 511 lists no alerts',
			'SMART · See sonomamarintrain.org',
			'Angel Island Ferry · See angelislandferry.com'
		]);
		expect(v.transit.lines.map((l) => l.url)).toEqual([
			'https://www.goldengate.org/service-alerts/',
			'https://www.goldengate.org/service-alerts/',
			'https://marintransit.gov/service-alerts',
			'https://www.sonomamarintrain.org/',
			'https://angelislandferry.com/'
		]);
		expect(v.roads.note).toBe('No incidents listed by 511 on these roads');
		expect(v.roads.scope).toBe(
			'Marin roads; 101, 19th Ave, 280 and 380 to SFO; 580, 80 and 880 to OAK. Long-term construction not shown.'
		);
		expect(said(v.airports.lines)).toEqual([
			'SFO · No delays reported',
			'OAK · No delays reported'
		]);
		expect([v.transit.meta, v.airports.meta, v.roads.meta]).toEqual([
			'511 · updated 2 min ago',
			'FAA · checked 3 min ago',
			'511 · checked 1 min ago'
		]);
		expect(header(input())).toBeNull();
	});

	it("511's empty list makes no claim for Golden Gate, SMART or Angel Island (2026-10-14: 511 empty while goldengate.org listed alerts)", () => {
		const v = gettingAroundView(
			input({
				transit: {
					reads: reads({ SA: { alerts: null, observedAt: null, error: 'SMART: HTTP 503' } }),
					error: null
				}
			})
		);
		const linked = v.transit.lines.filter((l) => l.id !== 'MA');
		expect(
			linked.every((l) => l.state === 'reference' && l.text.startsWith('See ') && l.url !== null)
		).toBe(true);
		expect(said(linked).join('\n')).not.toMatch(/511 lists no alerts|unavailable/);
		expect(v.status.failing.map((e) => e.name)).toEqual([]); // no claim made, so none can fail
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

	it('alerts: counted per agency (a linked agency too, when 511 lists some), previewed 3 in feed order with their own links, the rest counted', () => {
		const v = gettingAroundView(
			input({
				transit: {
					reads: reads({
						MA: { alerts: alerts(4) },
						GG: { alerts: alerts(1).map((a) => ({ ...a, id: '511-GG-1' })) }
					}),
					error: null
				}
			})
		);
		expect(said(v.transit.lines).slice(0, 3)).toEqual([
			'Golden Gate Transit · 1 alert listed',
			'Golden Gate Ferry · See goldengate.org',
			'Marin Transit · 4 alerts listed'
		]);
		expect(v.transit.lines[0].url).toBe('https://www.goldengate.org/service-alerts/'); // the agency's page stays one tap away
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
		expect(everything(later)).not.toMatch(/511 lists no alerts/);
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
				alerts: [{ id: '511-GG-1', title: 'Route 101 detour', url: null }],
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

	it("roads: 511's words, its route (or 'location unconfirmed'), severity and age; previewed 3 in the server's order", () => {
		const ev = (id: string, over: Partial<TrafficCorridorsData['events'][number]> = {}) => ({
			id,
			group: 'to-oak' as const,
			certain: true,
			kind: 'Traffic Hazard',
			road: 'I-580',
			where: 'Westbound east of Central Ave',
			severity: 'Moderate' as const,
			reportedAt: new Date(NOW - 25 * MIN).toISOString(),
			...over
		});
		const v = gettingAroundView(
			input({
				traffic: {
					...TRAFFIC,
					events: [
						ev('a'),
						ev('b', {
							group: 'marin',
							road: 'Sir Francis Drake Blvd',
							where: '',
							severity: null,
							reportedAt: null
						}),
						ev('c', { certain: false, group: 'to-sfo', road: 'US-101', where: '' }),
						ev('d', { reportedAt: new Date(NOW + 24 * 60 * MIN).toISOString() })
					]
				}
			})
		);
		expect(v.roads.rows.map((r) => [r.title, r.meta])).toEqual([
			[
				'Traffic Hazard · I-580 Westbound east of Central Ave',
				'Route to OAK · Moderate · reported 25 min ago'
			],
			['Traffic Hazard · Sir Francis Drake Blvd', 'Marin'],
			[
				'Traffic Hazard · US-101',
				'Route to SFO (location unconfirmed) · Moderate · reported 25 min ago'
			]
		]);
		expect([v.roads.more, v.roads.note]).toEqual([1, null]);
		const future = gettingAroundView(
			input({
				traffic: {
					...TRAFFIC,
					events: [ev('d', { reportedAt: new Date(NOW + 24 * 60 * MIN).toISOString() })]
				}
			})
		);
		expect(future.roads.rows[0].meta).toBe('Route to OAK · Moderate'); // no "reported 1 min ago" for a time tomorrow
		expect(v.roads.rows.every((r) => r.url === null)).toBe(true);
	});
});

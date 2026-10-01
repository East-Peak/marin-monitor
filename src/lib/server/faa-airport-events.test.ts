import { describe, it, expect } from 'vitest';
import { parseFaaFeed, faaStatusFor } from './faa-airport-events';
import feed from './__fixtures__/faa-airport-events-2026-10-01.json';
// The live feed carries no deicing in October; this entry follows the shape the FAA's
// NAS Status web app reads (`deicing.airportId`, `deicing.eventTime`).
import deicingFeed from './__fixtures__/faa-airport-events-deicing.json';

// A real nasstatus.faa.gov/api/airport-events body, captured 2026-10-01 and trimmed
// to four airports: DFW (ground delay program), CRQ (closure), LAX (free-form NOTAM),
// PHL (free-form NOTAM + runway config).
const events = parseFaaFeed(feed);
// The moment of the capture: inside CRQ's 10:00–13:00Z closure.
const CAPTURED_AT = new Date('2026-10-01T12:00:00Z');

describe('parseFaaFeed', () => {
	it('accepts the live feed body', () => {
		expect(events).toHaveLength(4);
	});

	it('rejects a body that is not an event list', () => {
		expect(parseFaaFeed({ error: 'Service Unavailable' })).toBeNull();
		expect(parseFaaFeed('<html>502 Bad Gateway</html>')).toBeNull();
		expect(parseFaaFeed(null)).toBeNull();
	});

	it('accepts an empty list as a real absence of events', () => {
		expect(parseFaaFeed([])).toEqual([]);
	});

	it.each([
		['non-object entries', [null, 'bad']],
		['an error object in a list', [{ error: 'unavailable' }]],
		['an entry with no events', [{ airportId: 'SFO' }]],
		['a non-string airportId', [{ airportId: 42, groundStop: { impactingCondition: 'x' } }]],
		['an event that is not an object', [{ airportId: 'SFO', groundDelay: 'yes' }]],
		['a non-numeric delay', [{ airportId: 'SFO', groundDelay: { avgDelay: 'long' } }]],
		['a non-string reason', [{ airportId: 'SFO', arrivalDelay: { reason: 7 } }]],
		[
			'an unreadable closure time',
			[{ airportId: 'SFO', airportClosure: { startTime: 'garbled', endTime: 'garbled' } }]
		],
		[
			'a closure with no effective interval',
			[{ airportId: 'SFO', airportClosure: { text: 'Closed', startTime: null, endTime: null } }]
		],
		[
			'an impossible calendar date',
			[
				{
					airportId: 'SFO',
					airportClosure: { startTime: '2026-02-30T10:00:00Z', endTime: '2026-03-03T10:00:00Z' }
				}
			]
		],
		[
			'a padded airport id',
			[{ airportId: ' SFO ', groundStop: { impactingCondition: 'weather' } }]
		],
		[
			'the same airport twice',
			[
				{ airportId: 'SFO', freeForm: { text: 'Notice' } },
				{
					airportId: 'sfo',
					airportClosure: { startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T13:00:00Z' }
				}
			]
		],
		[
			'a closure that ends before it starts',
			[
				{
					airportId: 'SFO',
					airportClosure: { startTime: '2026-10-01T13:00:00Z', endTime: '2026-10-01T10:00:00Z' }
				}
			]
		],
		[
			'an out-of-range zone offset',
			[
				{
					airportId: 'SFO',
					airportClosure: {
						startTime: '2026-10-01T10:00:00+24:00',
						endTime: '2026-10-01T13:00:00+24:00'
					}
				}
			]
		],
		['a time without a zone', [{ airportId: 'SFO', groundStop: { endTime: '2026-10-01 20:00' } }]],
		[
			'an event with none of its fields',
			[{ airportId: 'SFO', airportClosure: { error: 'unavailable' } }]
		],
		[
			'minutes with trailing garbage',
			[{ airportId: 'SFO', arrivalDelay: { averageDelay: '30garbage' } }]
		],
		[
			'a valid entry beside a malformed one',
			[...feed, { airportId: 'SFO', airportClosure: { startTime: 12 } }]
		]
	])('rejects a feed with %s', (_, body) => {
		expect(parseFaaFeed(body)).toBeNull();
	});
});

describe('faaStatusFor', () => {
	it('matches an airport by its airportId', () => {
		expect(faaStatusFor(events, 'DFW').status).toBe('ground-delay');
	});

	it('reports a ground delay with its impacting condition and numeric minutes', () => {
		expect(faaStatusFor(events, 'DFW').delays).toEqual([
			{
				type: 'ground-delay',
				reason: 'thunderstorms',
				avgMinutes: 79,
				maxMinutes: 147,
				endTime: '2026-10-02T02:59:00Z'
			}
		]);
	});

	it('reports a closure in effect with its NOTAM text', () => {
		const crq = faaStatusFor(events, 'CRQ', CAPTURED_AT);
		expect(crq.status).toBe('closed');
		expect(crq.delays[0]).toMatchObject({
			type: 'closure',
			reason: '!CRQ 09/020 CRQ AD AP CLSD 2610011000-2610011300'
		});
	});

	it('lists a closure that has not started as a scheduled notice, not closed', () => {
		const crq = faaStatusFor(events, 'CRQ', new Date('2026-10-01T09:30:00Z'));
		expect(crq.status).toBe('on-time');
		expect(crq.delays).toEqual([
			{
				type: 'scheduled-closure',
				reason: '!CRQ 09/020 CRQ AD AP CLSD 2610011000-2610011300',
				startTime: '2026-10-01T10:00:00Z',
				endTime: '2026-10-01T13:00:00Z'
			}
		]);
	});

	it('drops a closure that has ended', () => {
		const crq = faaStatusFor(events, 'CRQ', new Date('2026-10-01T13:30:00Z'));
		expect(crq).toEqual({ status: 'on-time', delays: [] });
	});

	it('lists deicing as its own notice, with no invented delay', () => {
		const sea = faaStatusFor(parseFaaFeed(deicingFeed), 'SEA');
		expect(sea.status).toBe('on-time');
		expect(sea.delays).toEqual([{ type: 'deicing', startTime: '2026-01-14T14:20:00Z' }]);
	});

	it('lists a free-form notice without calling the airport delayed', () => {
		const lax = faaStatusFor(events, 'LAX');
		expect(lax.status).toBe('on-time');
		expect(lax.delays).toEqual([
			expect.objectContaining({ type: 'notice', reason: expect.stringContaining('TRANSIENT GA') })
		]);
	});

	it('carries the runway configuration and arrival rate', () => {
		const phl = faaStatusFor(events, 'PHL');
		expect(phl.runwayConfig).toBe('27R/35/26 / 27L/35');
		expect(phl.arrivalRate).toBe(60);
	});

	it('reads ground stops, and arrival/departure delays by their own field names', () => {
		const stopped = parseFaaFeed([
			{
				airportId: 'SFO',
				groundStop: { impactingCondition: 'low ceilings', endTime: '2026-10-01T20:00:00Z' },
				arrivalDelay: { reason: 'volume', averageDelay: 31, trend: 'increasing' },
				departureDelay: { reason: 'weather', averageDelay: '16', trend: 'decreasing' }
			}
		]);
		const sfo = faaStatusFor(stopped, 'SFO');
		expect(sfo.status).toBe('ground-stop');
		expect(sfo.delays).toEqual([
			{ type: 'ground-stop', reason: 'low ceilings', endTime: '2026-10-01T20:00:00Z' },
			{ type: 'arrival-delay', reason: 'volume', avgMinutes: 31, trend: 'increasing' },
			{ type: 'departure-delay', reason: 'weather', avgMinutes: 16, trend: 'decreasing' }
		]);
	});

	it('is on time when the feed has no entry for the airport', () => {
		expect(faaStatusFor(events, 'SFO')).toEqual({ status: 'on-time', delays: [] });
	});

	it('is unknown, never on time, when the FAA read failed or did not parse', () => {
		expect(faaStatusFor(null, 'SFO')).toEqual({ status: 'unknown', delays: [] });
		expect(faaStatusFor(parseFaaFeed('garbled'), 'DFW').status).toBe('unknown');
	});
});

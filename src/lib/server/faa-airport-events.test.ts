import { describe, it, expect } from 'vitest';
import { parseFaaFeed, faaStatusFor } from './faa-airport-events';
import feed from './__fixtures__/faa-airport-events-2026-10-01.json';

// A real nasstatus.faa.gov/api/airport-events body, captured 2026-10-01 and trimmed
// to four airports: DFW (ground delay program), CRQ (closure), LAX (free-form NOTAM),
// PHL (free-form NOTAM + runway config).
const events = parseFaaFeed(feed);

describe('parseFaaFeed', () => {
	it('accepts the live feed body', () => {
		expect(events).toHaveLength(4);
	});

	it('rejects a body that is not an event list', () => {
		expect(parseFaaFeed({ error: 'Service Unavailable' })).toBeNull();
		expect(parseFaaFeed('<html>502 Bad Gateway</html>')).toBeNull();
		expect(parseFaaFeed(null)).toBeNull();
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

	it('reports a closure with its NOTAM text', () => {
		const crq = faaStatusFor(events, 'CRQ');
		expect(crq.status).toBe('closed');
		expect(crq.delays[0]).toMatchObject({
			type: 'closure',
			reason: '!CRQ 09/020 CRQ AD AP CLSD 2610011000-2610011300'
		});
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

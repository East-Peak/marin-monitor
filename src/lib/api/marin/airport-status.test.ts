import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAirportStatusOrThrow } from './airport-status';

const SFO = {
	code: 'SFO',
	icao: 'KSFO',
	name: 'San Francisco Intl',
	status: 'ground-delay',
	delays: [{ type: 'ground-delay', reason: 'low ceilings', avgMinutes: 45, maxMinutes: 90 }],
	weather: null,
	forecastNotes: [],
	tsa: null
};
const GOOD = {
	airports: [
		SFO,
		{ ...SFO, code: 'OAK', icao: 'KOAK', name: 'Oakland Intl', status: 'unknown', delays: [] }
	],
	lastUpdated: '2026-10-14T22:57:00.000Z'
};
const respond = (body: unknown, status = 200) =>
	vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(
			async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
		);

afterEach(() => vi.restoreAllMocks());

describe('fetchAirportStatusOrThrow', () => {
	it("returns a valid body (the FAA fix's 'unknown' included) and passes an owner-linked signal", async () => {
		const spy = respond(GOOD);
		await expect(
			fetchAirportStatusOrThrow({ signal: new AbortController().signal })
		).resolves.toEqual(GOOD);
		expect(spy.mock.calls[0][0]).toBe('/api/airport-status');
		expect(spy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
	});
	it.each([
		['HTTP 500', 'x', 500],
		['not JSON', '<html>', 200],
		['no airports array', { lastUpdated: 'x' }, 200],
		['no lastUpdated', { airports: [] }, 200],
		['a status outside the landed union', { ...GOOD, airports: [{ ...SFO, status: 'fine' }] }, 200],
		[
			'a delay type outside the union',
			{ ...GOOD, airports: [{ ...SFO, delays: [{ type: 'vibes' }] }] },
			200
		],
		[
			'minutes that are not numbers',
			{ ...GOOD, airports: [{ ...SFO, delays: [{ type: 'ground-delay', avgMinutes: '45' }] }] },
			200
		]
	])('throws on %s, never returns a guess', async (_name, body, status) => {
		respond(body, status);
		await expect(fetchAirportStatusOrThrow()).rejects.toThrow();
	});
	it("the owner's abort reaches the request", async () => {
		let seen: AbortSignal | undefined;
		vi.spyOn(globalThis, 'fetch').mockImplementation(
			(_input, init) =>
				new Promise<Response>((_, reject) => {
					seen = init?.signal ?? undefined;
					seen?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
				})
		);
		const owner = new AbortController();
		const pending = expect(fetchAirportStatusOrThrow({ signal: owner.signal })).rejects.toThrow();
		owner.abort();
		await pending;
		expect(seen?.aborted).toBe(true);
	});
});

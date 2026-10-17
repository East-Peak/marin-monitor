import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTrafficCorridorsOrThrow } from './traffic-corridors';

const GOOD = {
	checkedAt: '2026-10-14T22:59:00.000Z',
	upstreamCount: 40,
	unreadable: 0,
	events: [
		{
			id: '511.org/1',
			marin: false,
			corridor: 'to-oak',
			trip: 'to-oak',
			closed: false,
			lanes: 'some lanes closed',
			certain: true,
			kind: 'Traffic Hazard',
			road: 'I-580',
			where: 'Westbound east of Central Ave',
			severity: 'Moderate',
			reportedAt: '2026-10-14T22:20:00.000Z',
			at: [-122.311741, 37.89741] as [number, number] | null
		}
	]
};
/** The pre-v2 shape, still in a CDN copy for a few minutes after a deploy (and in the unedited height spec). */
const {
	marin: _m,
	corridor: _c,
	trip: _t,
	closed: _x,
	lanes: _l,
	at: _a,
	...BASE
} = GOOD.events[0];
const LEGACY = { ...BASE, group: 'to-oak' };
const respond = (body: unknown, status = 200) =>
	vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(
			async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
		);

afterEach(() => vi.restoreAllMocks());

describe('fetchTrafficCorridorsOrThrow: the map point (MAPX2)', () => {
	it('a response from before the point existed reads as "no location", never a guess', async () => {
		const { at: _gone, ...old } = GOOD.events[0];
		respond({ ...GOOD, events: [old] });
		expect((await fetchTrafficCorridorsOrThrow()).events[0].at).toBeNull();
	});
	it.each([
		['a string', 'here'],
		['one number', [-122.5]],
		['a non-finite number', [-122.5, null]],
		['out of range', [-222.5, 37.9]]
	])('a malformed point (%s) reads as "no location"', async (_name, at) => {
		respond({ ...GOOD, events: [{ ...GOOD.events[0], at }] });
		expect((await fetchTrafficCorridorsOrThrow()).events[0].at).toBeNull();
	});
});

describe('fetchTrafficCorridorsOrThrow', () => {
	it('returns a valid body and passes an owner-linked signal', async () => {
		const spy = respond(GOOD);
		await expect(
			fetchTrafficCorridorsOrThrow({ signal: new AbortController().signal })
		).resolves.toEqual(GOOD);
		expect(spy.mock.calls[0][0]).toBe('/api/traffic/corridors');
		expect(spy.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
	});
	it.each([
		['HTTP 502', { error: 'Traffic events incomplete' }, 502],
		['not JSON', '<html>', 200],
		['no check time', { ...GOOD, checkedAt: undefined }, 200],
		[
			'a legacy event with an unknown group',
			{ ...GOOD, events: [{ ...LEGACY, group: 'sonoma' }] },
			200
		],
		['an unknown corridor', { ...GOOD, events: [{ ...GOOD.events[0], corridor: 'to-sjc' }] }, 200],
		[
			'a trip on another corridor',
			{ ...GOOD, events: [{ ...GOOD.events[0], corridor: 'to-sfo', trip: 'to-oak' }] },
			200
		],
		['no closed flag', { ...GOOD, events: [{ ...GOOD.events[0], closed: undefined }] }, 200],
		['an unknown lane state', { ...GOOD, events: [{ ...GOOD.events[0], lanes: 'all' }] }, 200],
		[
			'an event with no marin, corridor or group',
			{
				...GOOD,
				events: [{ ...GOOD.events[0], marin: undefined, corridor: undefined, trip: undefined }]
			},
			200
		],
		['an unknown severity', { ...GOOD, events: [{ ...GOOD.events[0], severity: 'Unknown' }] }, 200],
		['no events array', { ...GOOD, events: null }, 200],
		['no unreadable count', { ...GOOD, unreadable: undefined }, 200],
		['no certainty flag', { ...GOOD, events: [{ ...GOOD.events[0], certain: undefined }] }, 200],
		['a negative unreadable count (Codex A2 #1)', { ...GOOD, unreadable: -1 }, 200],
		['a fractional unreadable count', { ...GOOD, unreadable: 0.5 }, 200],
		['a negative upstream count', { ...GOOD, upstreamCount: -40 }, 200]
	])('throws on %s, never returns a guess', async (_name, body, status) => {
		respond(body, status);
		await expect(fetchTrafficCorridorsOrThrow()).rejects.toThrow();
	});
	it("reads a legacy single-group event as tags, its trip from 511's direction words in `where` (Codex GA-v2 #1)", async () => {
		respond({
			...GOOD,
			events: [
				LEGACY, // I-580 Westbound: toward Marin
				{
					...LEGACY,
					id: '511.org/2',
					group: 'to-sfo',
					road: 'US-101',
					where: 'Southbound at Cesar Chavez'
				},
				{
					...LEGACY,
					id: '511.org/3',
					group: 'to-sfo',
					road: 'US-101',
					where: 'Northbound at Cesar Chavez'
				},
				{
					...LEGACY,
					id: '511.org/4',
					group: 'to-oak',
					where: 'Eastbound and Westbound at Castro St'
				},
				{ ...LEGACY, id: '511.org/5', group: 'to-oak', where: 'at Castro St' }, // no direction: matches
				{
					...LEGACY,
					id: '511.org/6',
					group: 'to-oak',
					where: 'Eastbound at Castro St',
					certain: false
				},
				{ ...LEGACY, id: '511.org/7', group: 'marin', road: 'Sir Francis Drake Blvd' }
			]
		});
		const { events } = await fetchTrafficCorridorsOrThrow();
		expect(events.map((e) => [e.marin, e.corridor, e.trip, e.closed, e.lanes])).toEqual([
			[false, 'to-oak', null, false, null],
			[false, 'to-sfo', 'to-sfo', false, null],
			[false, 'to-sfo', null, false, null],
			[false, 'to-oak', 'to-oak', false, null],
			[false, 'to-oak', 'to-oak', false, null],
			[false, 'to-oak', null, false, null], // unplaced: no trip claim
			[true, null, null, false, null]
		]);
		expect(events[0]).not.toHaveProperty('group');
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
		const pending = expect(
			fetchTrafficCorridorsOrThrow({ signal: owner.signal })
		).rejects.toThrow();
		owner.abort();
		await pending;
		expect(seen?.aborted).toBe(true);
	});
});

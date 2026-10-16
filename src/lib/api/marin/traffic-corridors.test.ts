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
			reportedAt: '2026-10-14T22:20:00.000Z'
		}
	]
};
/** The pre-v2 shape, still in a CDN copy for a few minutes after a deploy (and in the unedited height spec). */
const { marin: _m, corridor: _c, trip: _t, closed: _x, lanes: _l, ...BASE } = GOOD.events[0];
const LEGACY = { ...BASE, group: 'to-oak' };
const respond = (body: unknown, status = 200) =>
	vi
		.spyOn(globalThis, 'fetch')
		.mockImplementation(
			async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
		);

afterEach(() => vi.restoreAllMocks());

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
	it('reads a legacy single-group event as tags: no direction known, so the trip matches (call 1)', async () => {
		respond({
			...GOOD,
			events: [
				LEGACY,
				{ ...LEGACY, id: '511.org/2', group: 'marin', road: 'Sir Francis Drake Blvd' }
			]
		});
		const { events } = await fetchTrafficCorridorsOrThrow();
		expect(events.map((e) => [e.marin, e.corridor, e.trip, e.closed, e.lanes])).toEqual([
			[false, 'to-oak', 'to-oak', false, null],
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

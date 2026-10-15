import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTrafficCorridorsOrThrow } from './traffic-corridors';

const GOOD = {
	checkedAt: '2026-10-14T22:59:00.000Z',
	upstreamCount: 40,
	unreadable: 0,
	events: [
		{
			id: '511.org/1',
			group: 'to-oak',
			certain: true,
			kind: 'Traffic Hazard',
			road: 'I-580',
			where: 'Westbound east of Central Ave',
			severity: 'Moderate',
			reportedAt: '2026-10-14T22:20:00.000Z'
		}
	]
};
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
		['an unknown group', { ...GOOD, events: [{ ...GOOD.events[0], group: 'sonoma' }] }, 200],
		['an unknown severity', { ...GOOD, events: [{ ...GOOD.events[0], severity: 'Unknown' }] }, 200],
		['no events array', { ...GOOD, events: null }, 200],
		['no unreadable count', { ...GOOD, unreadable: undefined }, 200],
		['no certainty flag', { ...GOOD, events: [{ ...GOOD.events[0], certain: undefined }] }, 200]
	])('throws on %s, never returns a guess', async (_name, body, status) => {
		respond(body, status);
		await expect(fetchTrafficCorridorsOrThrow()).rejects.toThrow();
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

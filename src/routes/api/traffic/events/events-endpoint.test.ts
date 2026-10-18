// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/api-keys', () => ({ get511ApiKey: () => 'test-key' }));
/** Fresh per test: the route's memo is module state. */
let GET: () => Promise<Response>;

const fetchMock = vi.fn<typeof fetch>();
const LIST = JSON.stringify({ events: [{ id: 'a' }] });

beforeEach(async () => {
	vi.resetModules();
	({ GET } = await import('./+server'));
	vi.spyOn(console, 'info').mockImplementation(() => {});
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	fetchMock.mockReset();
	vi.stubGlobal('fetch', fetchMock);
	vi.useFakeTimers();
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('GET /api/traffic/events (TRAFFIC1 budget)', () => {
	it('concurrent requests make one 511 read, held 10 minutes here and at the CDN', async () => {
		fetchMock.mockImplementation(async () => new Response(LIST));
		const [a] = await Promise.all([GET(), GET()]);
		expect(a.headers.get('cache-control')).toBe('public, max-age=60, s-maxage=600');
		expect((await a.json()).count).toBe(1);
		vi.advanceTimersByTime(9 * 60_000);
		await GET();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(60_000);
		await GET();
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("511's refusal is passed on, uncached, and held 10 minutes", async () => {
		fetchMock.mockResolvedValue(new Response('', { status: 503 }));
		const res = await GET();
		expect([res.status, res.headers.get('cache-control')]).toEqual([503, 'no-store']);
		vi.advanceTimersByTime(9 * 60_000);
		await GET();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('a 200 with no event list is a failure, not an empty list', async () => {
		fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'maintenance' })));
		const res = await GET();
		expect([res.status, res.headers.get('cache-control')]).toEqual([502, 'no-store']);
	});
});

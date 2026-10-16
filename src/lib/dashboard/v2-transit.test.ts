import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import type { TransitAgencyRead } from '$lib/api/marin/transit';

vi.mock('$app/environment', () => ({ browser: true, version: 'test' }));
vi.mock('$lib/services/client', () => ({ serviceClient: { request: vi.fn() } }));
vi.mock('$lib/api/marin/load-all', () => ({ loadAllNews: vi.fn() }));
const { fetchTransitAlerts } = vi.hoisted(() => ({ fetchTransitAlerts: vi.fn() }));
vi.mock('$lib/api/marin/transit', async (orig) => ({
	...(await orig<object>()),
	fetchTransitAlerts
}));
const { createDashboardV2Controller, v2NewsSources } = await import('./v2-controller');
const { DEFAULT_OP_DEADLINE_MS } = await import('$lib/api/marin/bounded-op');

const READS: TransitAgencyRead[] = [
	{
		id: 'MA',
		name: 'Marin Transit',
		alerts: [
			{
				id: '511-MA-1',
				title: 'Route 35 detour',
				headline: 'Route 35 detour',
				description: null,
				stopIds: [],
				timing: 'now',
				url: null
			}
		],
		observedAt: 1,
		error: null
	}
];
const read = (agencies: TransitAgencyRead[] = READS) => ({ items: [], errors: [], agencies });
const owners: AbortController[] = [];

beforeEach(() => {
	fetchTransitAlerts.mockReset();
	// Every other part of the controller's own sources fails fast: no network in unit tests.
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response('down', { status: 503 }))
	);
});
afterEach(() => {
	for (const o of owners.splice(0)) o.abort(); // releases the news-store claim
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe("v2's transit part (Getting Around)", () => {
	it("publishes every agency's read and still returns the items for the news store", async () => {
		const item = { id: 'x' };
		fetchTransitAlerts.mockResolvedValue({ ...read(), items: [item] });
		const onTransit = vi.fn();
		await expect(
			v2NewsSources(new AbortController().signal, { onTransit }).transit()
		).resolves.toEqual([item]);
		expect(onTransit).toHaveBeenCalledWith(READS);
	});

	it('a read cut short by its deadline publishes nothing', async () => {
		vi.useFakeTimers();
		let finish!: (v: unknown) => void;
		fetchTransitAlerts.mockImplementation(() => new Promise((r) => (finish = r)));
		const onTransit = vi.fn();
		const pending = expect(
			v2NewsSources(new AbortController().signal, { deadlineMs: 1_000, onTransit }).transit()
		).rejects.toThrow('timed out');
		await vi.advanceTimersByTimeAsync(1_000);
		await pending;
		finish(read());
		await vi.runAllTimersAsync();
		expect(onTransit).not.toHaveBeenCalled();
	});

	it("the controller's own sources fill its transit store; a disposed owner's late read writes nothing", async () => {
		fetchTransitAlerts.mockResolvedValueOnce(read());
		const owner = new AbortController();
		owners.push(owner);
		const c = createDashboardV2Controller({
			signal: owner.signal,
			fetchAdvisories: async () => ({ advisories: [], unreadable: 0 })
		});
		expect(get(c.transit)).toEqual({ reads: null, error: null });
		await c.start();
		expect(get(c.transit)).toEqual({ reads: READS, error: null });

		let finish!: (v: unknown) => void;
		fetchTransitAlerts.mockImplementation(() => new Promise((r) => (finish = r)));
		const later = new AbortController();
		owners.push(later);
		const d = createDashboardV2Controller({
			signal: later.signal,
			fetchAdvisories: async () => ({ advisories: [], unreadable: 0 })
		});
		void d.start();
		await vi.waitFor(() => expect(fetchTransitAlerts).toHaveBeenCalledTimes(2));
		later.abort();
		finish(read());
		await new Promise((r) => setTimeout(r, 0));
		expect(get(d.transit)).toEqual({ reads: null, error: null });
	});

	it('a failed transit read is carried to the view: first read → error with no reads; a later failure keeps the reads it failed after (Codex r1 #2)', async () => {
		fetchTransitAlerts.mockRejectedValueOnce(new Error('proxy down'));
		const owner = new AbortController();
		owners.push(owner);
		let clock = 0;
		const c = createDashboardV2Controller({
			signal: owner.signal,
			now: () => clock,
			fetchAdvisories: async () => ({ advisories: [], unreadable: 0 })
		});
		await c.start();
		expect(get(c.transit)).toEqual({ reads: null, error: expect.stringContaining('proxy down') });
		fetchTransitAlerts.mockResolvedValueOnce(read());
		clock += 61_000;
		await c.refresh();
		expect(get(c.transit)).toEqual({ reads: READS, error: null });
		fetchTransitAlerts.mockRejectedValueOnce(new Error('timed out'));
		clock += 61_000;
		await c.refresh();
		expect(get(c.transit)).toEqual({ reads: READS, error: expect.stringContaining('timed out') });
	});

	it("an expired controller read keeps its reads, carries the deadline's error, and its late answer changes nothing (Codex A2 #2)", async () => {
		vi.useFakeTimers();
		fetchTransitAlerts.mockResolvedValueOnce(read());
		const owner = new AbortController();
		owners.push(owner);
		let clock = 0;
		const c = createDashboardV2Controller({
			signal: owner.signal,
			now: () => clock,
			fetchAdvisories: async () => ({ advisories: [], unreadable: 0 })
		});
		const started = c.start();
		await vi.runAllTimersAsync();
		await started;
		expect(get(c.transit)).toEqual({ reads: READS, error: null });

		let finish!: (v: unknown) => void;
		fetchTransitAlerts.mockImplementation(() => new Promise((r) => (finish = r)));
		clock += 61_000;
		const refreshed = c.refresh();
		await vi.advanceTimersByTimeAsync(DEFAULT_OP_DEADLINE_MS);
		await refreshed;
		expect(get(c.transit)).toEqual({ reads: READS, error: expect.stringContaining('timed out') });
		finish(read([{ ...READS[0], alerts: [] }]));
		await vi.runAllTimersAsync();
		expect(get(c.transit)).toEqual({ reads: READS, error: expect.stringContaining('timed out') });
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLifestyleWithStatus } from './lifestyle';

const body = (households: unknown[]) => ({
	computedAt: 'c',
	lastSuccessfulScrapeAt: null,
	households
});
const served = (json: unknown) =>
	vi.stubGlobal(
		'fetch',
		vi.fn(async () => new Response(JSON.stringify(json), { status: 200 }))
	);

afterEach(() => vi.unstubAllGlobals());

describe('the Lifestyle card’s read', () => {
	it('keeps a household that has its receipt', async () => {
		served(body([{ slug: 'ross', receipt: [] }]));
		const r = await fetchLifestyleWithStatus();
		expect(r.ok && r.data.households.map((h) => h.slug)).toEqual(['ross']);
	});

	it('drops one from before the receipt (a rollback, a cached response): unread, never a crash', async () => {
		served(body([{ slug: 'ross', top: [] }]));
		const r = await fetchLifestyleWithStatus();
		expect(r.ok && r.data.households).toEqual([]);
	});
});

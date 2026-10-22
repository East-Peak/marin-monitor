/* eslint-disable @typescript-eslint/no-explicit-any -- a RequestEvent mock; the handler reads none of it */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));
const { GET } = await import('./+server');

const dir = await mkdtemp(join(tmpdir(), 'life-api-'));
const fixture = join(dir, 'index.json');
await writeFile(
	fixture,
	JSON.stringify({
		current: {
			schema: 1,
			runId: 'r',
			computedAt: '2026-10-20T18:00:00.000Z',
			lastSuccessfulScrapeAt: null,
			anchors: [],
			budgets: [
				{
					town: 'ross',
					pricedAt: '2026-10-20T18:00:00.000Z',
					lines: [],
					sections: {},
					burnMonthly: 1,
					complete: false,
					breakEven: null,
					personaShare: { only: 0, any: 0 },
					marketTracker: {
						name: 'marketTracker',
						label: 'Ross SFR median',
						class: 'cited',
						value: 1,
						availability: 'ok',
						asOf: '2026-10-20',
						source: null
					}
				}
			]
		},
		history: []
	})
);

beforeEach(() => {
	for (const k of Object.keys(env)) delete env[k];
});

describe('GET /api/data/lifestyle', () => {
	it('does not exist while the flag is off', async () => {
		env.LIFESTYLE_FIXTURE = fixture;
		const res = await GET({} as any);
		expect(res.status).toBe(404);
	});

	it('serves the households’ summaries while the flag is on', async () => {
		Object.assign(env, { LIFESTYLE_INDEX: 'on', LIFESTYLE_FIXTURE: fixture });
		const res = await GET({} as any);
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toMatch(/s-maxage/);
		const body = await res.json();
		expect(body.households.map((h: { slug: string }) => h.slug)).toEqual(['ross']);
		expect(body.households[0].breakEven).toBeNull();
	});

	it('is a short-cached 503 when the index cannot be read', async () => {
		env.LIFESTYLE_INDEX = 'on';
		const res = await GET({} as any);
		expect(res.status).toBe(503);
		expect(res.headers.get('cache-control')).toBe('public, s-maxage=10');
	});
});

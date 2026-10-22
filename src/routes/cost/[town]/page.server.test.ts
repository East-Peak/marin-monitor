import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LiveKey, LiveRead, LiveReads } from '$lib/lifestyle/model';
import { priceSheet } from '$lib/lifestyle/price';
import { SHEETS } from '$lib/lifestyle/sheets';
import type { HouseholdPage } from '$lib/lifestyle/view';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));
vi.mock('$env/dynamic/private', () => ({ env }));
const { load } = await import('./+page.server');
type PageData = {
	page: HouseholdPage | null;
	town: string;
	computedAt: string | null;
	stale: boolean;
	towns: { slug: string; town: string }[];
};

const NOW = new Date('2026-10-20T18:00:00.000Z');
const reads = Object.fromEntries(
	(
		[
			'gas.regular',
			'coffee.cappuccino',
			'grocery.collagen',
			'grocery.manuka',
			'grocery.kombucha',
			'grocery.oatMilk',
			'grocery.silverOak',
			'ikon.adult',
			'rivian.lease'
		] as LiveKey[]
	).map((k): [string, LiveRead] => [
		k,
		{ availability: 'ok', value: 5, observedAt: NOW.toISOString(), maxAgeDays: 10, source: 't' }
	])
) as LiveReads;
const dir = await mkdtemp(join(tmpdir(), 'cost-page-'));
const fixture = join(dir, 'index.json');
await writeFile(
	fixture,
	JSON.stringify({
		current: {
			schema: 1,
			runId: 'r',
			computedAt: NOW.toISOString(),
			lastSuccessfulScrapeAt: NOW.toISOString(),
			anchors: [],
			budgets: SHEETS.filter((s) => s.id !== 'ross').map((s) => priceSheet(s, reads, NOW))
		},
		history: []
	})
);

function event(town: string) {
	const headers: Record<string, string> = {};
	const ev = {
		params: { town },
		setHeaders: (h: Record<string, string>) => Object.assign(headers, h)
	};
	return { ev: ev as unknown as Parameters<typeof load>[0], headers };
}
const status = async (p: unknown) => {
	try {
		await p;
		return 200;
	} catch (e) {
		return (e as { status?: number }).status;
	}
};

beforeEach(() => {
	for (const k of Object.keys(env)) delete env[k];
});

describe('/cost/[town]', () => {
	it('does not exist while the flag is off', async () => {
		env.LIFESTYLE_FIXTURE = fixture;
		expect(await status(load(event('larkspur').ev))).toBe(404);
	});

	it('is a 404 for a town with no household sheet', async () => {
		Object.assign(env, { LIFESTYLE_INDEX: 'on', LIFESTYLE_FIXTURE: fixture });
		expect(await status(load(event('tiburon').ev))).toBe(404);
		expect(await status(load(event('millvalley').ev))).toBe(404);
	});

	it('serves the household’s page, cached, with every town to switch to', async () => {
		Object.assign(env, { LIFESTYLE_INDEX: 'on', LIFESTYLE_FIXTURE: fixture });
		const { ev, headers } = event('mill-valley');
		const data = (await load(ev)) as PageData;
		expect(data.page?.summary.name).toBe('Mill Valley wellness');
		expect(data.towns.map((t) => t.slug)).toEqual(['larkspur', 'mill-valley', 'ross']);
		expect(data.computedAt).toBe(NOW.toISOString());
		expect(headers['Cache-Control']).toMatch(/^public, s-maxage=/);
	});

	it('says the whole budget is out of date when no run has succeeded within ten days', async () => {
		Object.assign(env, { LIFESTYLE_INDEX: 'on', LIFESTYLE_FIXTURE: fixture });
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			vi.setSystemTime(new Date(NOW.getTime() + 9 * 86_400_000));
			expect(((await load(event('larkspur').ev)) as PageData).stale).toBe(false);
			vi.setSystemTime(new Date(NOW.getTime() + 11 * 86_400_000));
			expect(((await load(event('larkspur').ev)) as PageData).stale).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('says the household can’t be read, uncached, when its budget is missing', async () => {
		Object.assign(env, { LIFESTYLE_INDEX: 'on', LIFESTYLE_FIXTURE: fixture });
		const { ev, headers } = event('ross');
		const data = (await load(ev)) as PageData;
		expect(data.page).toBeNull();
		expect(data.town).toBe('Ross');
		expect(headers['Cache-Control']).toBe('private, no-store');
	});
});

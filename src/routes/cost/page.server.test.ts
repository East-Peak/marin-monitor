import { PGE_EV2_KEYS, RANGE_ROVER_KEYS, REDFIN_KEYS, USDA_KEYS } from '$lib/lifestyle/model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LiveKey, LiveRead, LiveReads, PricedBudget } from '$lib/lifestyle/model';
import { priceSheet } from '$lib/lifestyle/price';
import { SHEETS } from '$lib/lifestyle/sheets';
import type { Comparison } from '$lib/lifestyle/compare';

const { env } = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));
vi.mock('$env/dynamic/private', () => ({ env }));
const { load } = await import('./+page.server');

interface Header {
	id: string;
	slug: string;
	town: string;
	name: string;
	who: string;
	read: boolean;
	burnMonthly: number | null;
	soFar: boolean;
	complete: boolean;
	breakEven: number | null;
	missing: string[];
}
type PageData = {
	households: Header[];
	comparison: Comparison;
	computedAt: string | null;
	stale: boolean;
	read: boolean;
};

const NOW = new Date('2026-10-20T18:00:00.000Z');
const reads = Object.fromEntries(
	[
		...(['gas.regular', 'coffee.cappuccino'] as LiveKey[]),
		...USDA_KEYS,
		...PGE_EV2_KEYS,
		...RANGE_ROVER_KEYS,
		...REDFIN_KEYS
	].map((k): [string, LiveRead] => [
		k,
		{ availability: 'ok', value: 5, observedAt: NOW.toISOString(), maxAgeDays: 10, source: 't' }
	])
) as LiveReads;
const priced = () => SHEETS.map((s) => priceSheet(s, reads, NOW));
const dir = await mkdtemp(join(tmpdir(), 'cost-compare-'));
async function fixture(name: string, budgets: PricedBudget[] | null, raw?: string) {
	const path = join(dir, `${name}.json`);
	const doc = {
		current: {
			schema: 1,
			runId: 'r',
			computedAt: NOW.toISOString(),
			lastSuccessfulScrapeAt: NOW.toISOString(),
			anchors: [],
			budgets
		},
		history: []
	};
	await writeFile(path, raw ?? JSON.stringify(doc));
	return path;
}
const all = await fixture('all', priced());
const noRoss = await fixture(
	'no-ross',
	priced().filter((b) => b.town !== 'ross')
);
const malformed = await fixture('malformed', null, '{"current":');
const sigless = await fixture(
	'sigless',
	priced().map((b) => {
		const sheet = SHEETS.find((s) => s.id === b.town)!;
		const sig = new Set(sheet.lines.filter((l) => l.signature).map((l) => l.id));
		return b.town === 'larkspur' ? { ...b, lines: b.lines.filter((l) => !sig.has(l.id)) } : b;
	})
);
/** Ross carries an offer that ends at the end of NOW's UTC day: the cache must stop there. */
const endingOffer = await fixture(
	'ending-offer',
	priced().map((b) => {
		if (b.town !== 'ross') return b;
		let done = false;
		return {
			...b,
			lines: b.lines.map((l) => ({
				...l,
				inputs: l.inputs.map((i) => {
					if (done || i.class !== 'cited' || i.availability !== 'ok') return i;
					done = true;
					return { ...i, validUntil: '2026-10-20' };
				})
			}))
		};
	})
);

function event() {
	const headers: Record<string, string> = {};
	const ev = { setHeaders: (h: Record<string, string>) => Object.assign(headers, h) };
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
const on = (path: string) => Object.assign(env, { LIFESTYLE_INDEX: 'on', LIFESTYLE_FIXTURE: path });

beforeEach(() => {
	for (const k of Object.keys(env)) delete env[k];
});
afterEach(() => vi.useRealTimers());

describe('/cost', () => {
	it('does not exist while the flag is off', async () => {
		env.LIFESTYLE_FIXTURE = all;
		expect(await status(load(event().ev))).toBe(404);
	});

	it('serves every household side by side, publicly cached, each linking to its page', async () => {
		on(all);
		const { ev, headers } = event();
		const data = (await load(ev)) as PageData;
		expect(data.households.map((h) => h.slug)).toEqual(['larkspur', 'mill-valley', 'ross']);
		expect(data.households.map((h) => h.name)).toEqual(SHEETS.map((s) => s.name));
		expect(data.households.map((h) => h.who)).toEqual(SHEETS.map((s) => s.who));
		expect(data.households.every((h) => h.read && h.burnMonthly !== null)).toBe(true);
		expect(data.comparison.rows.length).toBeGreaterThan(0);
		expect(data.read).toBe(true);
		expect(data.computedAt).toBe(NOW.toISOString());
		expect(headers['Cache-Control']).toBe('public, s-maxage=600, stale-while-revalidate=3600');
	});

	it('hides an incomplete household’s break-even and names what it is missing', async () => {
		on(all);
		const data = (await load(event().ev)) as PageData;
		for (const h of data.households) {
			if (h.complete) expect(h.breakEven).not.toBeNull();
			else {
				expect(h.breakEven).toBeNull();
				expect(h.missing.length).toBeGreaterThan(0);
			}
		}
	});

	it('limits the cache to the first offer ending in any displayed budget', async () => {
		on(endingOffer);
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-20T23:55:00.000Z'));
		const { ev, headers } = event();
		await load(ev);
		// About five minutes are left of Ross's offer: never cached past it.
		expect(headers['Cache-Control']).toMatch(
			/^public, s-maxage=(29\d|300), stale-while-revalidate=0$/
		);
	});

	it('a household missing from the snapshot reads unread, and the page is not edge-cached', async () => {
		on(noRoss);
		const { ev, headers } = event();
		const data = (await load(ev)) as PageData;
		const ross = data.households.find((h) => h.id === 'ross')!;
		expect(ross).toMatchObject({ read: false, burnMonthly: null, breakEven: null });
		expect(data.comparison.rows.every((r) => r.cells[2].state === 'unread')).toBe(true);
		expect(data.comparison.rows.every((r) => !r.comparable)).toBe(true);
		expect(headers['Cache-Control']).toBe('private, no-store');
	});

	it('a malformed or missing read is no index, never an empty one, and uncached', async () => {
		for (const path of [malformed, join(dir, 'nowhere.json')]) {
			on(path);
			const { ev, headers } = event();
			const data = (await load(ev)) as PageData;
			expect(data.read).toBe(false);
			expect(data.households.every((h) => !h.read)).toBe(true);
			expect(headers['Cache-Control']).toBe('private, no-store');
		}
	});

	it('a stored budget without its signature lines reads them unread: "so far", no break-even', async () => {
		on(sigless);
		const data = (await load(event().ev)) as PageData;
		const lark = data.households[0];
		expect(lark.complete).toBe(false);
		expect(lark.soFar).toBe(true);
		expect(lark.breakEven).toBeNull();
		expect(data.comparison.rows.some((r) => r.cells[0].state === 'partial')).toBe(true);
	});

	it('says the whole snapshot is out of date past the index’s max age', async () => {
		on(all);
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(NOW.getTime() + 9 * 86_400_000));
		expect(((await load(event().ev)) as PageData).stale).toBe(false);
		vi.setSystemTime(new Date(NOW.getTime() + 11 * 86_400_000));
		expect(((await load(event().ev)) as PageData).stale).toBe(true);
	});

	it('makes no comparative claim once the snapshot is out of date (Codex)', async () => {
		on(all);
		env.LIFESTYLE_HIGHLIGHTS = 'on';
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(NOW.getTime() + 11 * 86_400_000));
		const data = (await load(event().ev)) as PageData;
		expect(data.stale).toBe(true);
		expect(data.comparison.rows.every((r) => !r.comparable && r.highlight === null)).toBe(true);
	});

	it('compares with rank facts only under the highlights’ own flag', async () => {
		on(all);
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(NOW.getTime() + 86_400_000));
		const off = (await load(event().ev)) as PageData;
		expect(off.comparison.rows.every((r) => r.highlight === null)).toBe(true);
		env.LIFESTYLE_HIGHLIGHTS = 'on';
		const data = (await load(event().ev)) as PageData;
		expect(data.comparison.rows.some((r) => r.highlight?.rule === 'rank')).toBe(true);
	});
});

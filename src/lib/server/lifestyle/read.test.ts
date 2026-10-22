import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BlobApi } from '$lib/server/news/snapshot-store';
import type { PricedBudget } from '$lib/lifestyle/model';
import { SHEETS } from '$lib/lifestyle/sheets';
import { LIFESTYLE_KEY, type LifestyleSnapshot } from './producer';
import { lifestyleBlobApi, lifestyleCard, lifestyleOn, readLifestyle } from './read';

const signal = new AbortController().signal;
const budget = (town: string) =>
	({
		town,
		pricedAt: '2026-10-20T18:00:00.000Z',
		lines: [],
		sections: { housing: 100 },
		burnMonthly: 100,
		complete: true,
		breakEven: { gross: 2000, need: 1200, taxes: {} },
		personaShare: { only: 0.1, any: 0.5 }
	}) as unknown as PricedBudget;
const snapshot = (budgets: PricedBudget[]): LifestyleSnapshot => ({
	schema: 1,
	runId: '2026-10-20',
	computedAt: '2026-10-20T18:00:00.000Z',
	lastSuccessfulScrapeAt: '2026-10-20T18:00:00.000Z',
	anchors: [],
	budgets
});
const api = (text: string | null | Error): BlobApi => ({
	read: vi.fn(async (key: string) => {
		if (text instanceof Error) throw text;
		return key === LIFESTYLE_KEY && text !== null ? { text, etag: '"e"' } : null;
	}),
	write: vi.fn(),
	remove: vi.fn()
});

describe('the Lifestyle Index flag', () => {
	it('is on only when LIFESTYLE_INDEX is exactly "on"', () => {
		expect(lifestyleOn({ LIFESTYLE_INDEX: 'on' })).toBe(true);
		for (const v of [undefined, '', 'off', '1', 'true', 'ON'])
			expect(lifestyleOn({ LIFESTYLE_INDEX: v })).toBe(false);
	});
});

describe('where the index is read from', () => {
	it('reads a fixture file outside production only', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'life-'));
		const file = join(dir, 'f.json');
		await writeFile(file, JSON.stringify({ current: snapshot([budget('ross')]), history: [] }));
		const fromFile = lifestyleBlobApi({ LIFESTYLE_FIXTURE: file, VERCEL_ENV: 'preview' })!;
		expect((await readLifestyle(fromFile, signal))?.budgets).toHaveLength(1);

		const blob = vi.fn(() => api(null));
		lifestyleBlobApi(
			{ LIFESTYLE_FIXTURE: file, VERCEL_ENV: 'production', BLOB_READ_WRITE_TOKEN: 't' },
			blob
		);
		expect(blob).toHaveBeenCalledWith('t');
		expect(lifestyleBlobApi({ VERCEL_ENV: 'production' })).toBeNull();
	});

	it('returns the current snapshot, or null for a missing, failed or malformed read', async () => {
		const good = JSON.stringify({ current: snapshot([budget('ross')]), history: [] });
		expect((await readLifestyle(api(good), signal))?.runId).toBe('2026-10-20');
		expect(await readLifestyle(api(null), signal)).toBeNull();
		expect(await readLifestyle(api(new Error('down')), signal)).toBeNull();
		expect(await readLifestyle(api('{not json'), signal)).toBeNull();
		expect(await readLifestyle(api(JSON.stringify({ current: null })), signal)).toBeNull();
		expect(
			await readLifestyle(api(JSON.stringify({ current: { schema: 2, budgets: [] } })), signal)
		).toBeNull();
		// Codex LIFE2-1: every budget the card and page read must have its fields.
		const withBudgets = (budgets: unknown[]) =>
			api(JSON.stringify({ current: { ...snapshot([]), budgets } }));
		expect(await readLifestyle(withBudgets([null]), signal)).toBeNull();
		expect(await readLifestyle(withBudgets([{ town: 'ross' }]), signal)).toBeNull();
		const noTimes = { ...snapshot([budget('ross')]), computedAt: undefined };
		expect(await readLifestyle(api(JSON.stringify({ current: noTimes })), signal)).toBeNull();
	});
});

describe('the card’s data', () => {
	it('summarises each budget that has a sheet, in sheet order, with the run’s times', () => {
		const card = lifestyleCard(
			snapshot([budget('ross'), budget('larkspur'), budget('atlantis')]),
			SHEETS
		);
		expect(card.computedAt).toBe('2026-10-20T18:00:00.000Z');
		expect(card.lastSuccessfulScrapeAt).toBe('2026-10-20T18:00:00.000Z');
		expect(card.households.map((h) => h.slug)).toEqual(['larkspur', 'ross']);
		expect(card.households[1]).toMatchObject({ breakEven: 2000, burnMonthly: 100 });
	});
});

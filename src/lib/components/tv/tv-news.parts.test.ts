import { describe, expect, it, vi } from 'vitest';
import type { NewsSnapshotResponse } from '$lib/news/snapshot';

vi.mock('$app/environment', () => ({ browser: true, version: 'test' }));
vi.mock('$lib/services/client', () => ({ serviceClient: { request: vi.fn() } }));

const { createTvNewsLoader } = await import('./tv-news');
type Sources = Parameters<typeof createTvNewsLoader>[0]['sources'];
type Settled = [string, { ok: boolean; error?: string; at: number }];

const NOW = Date.parse('2026-09-29T18:00:00.000Z');
const OK_SNAPSHOT: NewsSnapshotResponse = {
	status: 'ok',
	snapshot: {
		schemaVersion: 1,
		revision: 1,
		generatedAt: '2026-09-29T17:55:00.000Z',
		lastSuccessfulScrapeAt: '2026-09-29T17:55:00.000Z',
		sources: [],
		items: []
	}
};

function sources(over: Partial<Sources> = {}): Sources {
	const empty = async () => [];
	return {
		snapshot: async () => OK_SNAPSHOT,
		nps: empty,
		earthquakes: empty,
		transit: empty,
		'sheriff-blotter': empty,
		'police-logs': empty,
		'supplemental-activity': empty,
		seeclickfix: empty,
		...over
	};
}

function loader(src: Sources, signal = new AbortController().signal) {
	const settled: Settled[] = [];
	const l = createTvNewsLoader({
		sources: src,
		signal,
		reset: () => {},
		commit: () => {},
		onEarthquakes: () => {},
		now: () => NOW,
		onPartSettled: (part, outcome) => settled.push([part, outcome])
	});
	return { l, settled };
}

describe('createTvNewsLoader onPartSettled', () => {
	it('reports every part once per refresh: ok, a thrown failure, and a non-ok snapshot', async () => {
		const { l, settled } = loader(
			sources({
				snapshot: async () => ({ status: 'unavailable', reason: 'missing' }),
				seeclickfix: async () => {
					throw new Error('HTTP 500');
				}
			})
		);
		await l.refresh();
		const byPart = Object.fromEntries(settled);
		expect(settled).toHaveLength(8);
		expect(byPart.nps).toEqual({ ok: true, at: NOW });
		expect(byPart.seeclickfix).toEqual({ ok: false, error: 'HTTP 500', at: NOW });
		expect(byPart.snapshot).toEqual({
			ok: false,
			error: 'news-snapshot: unavailable (missing)',
			at: NOW
		});
	});

	it('an ok snapshot read settles ok', async () => {
		const { l, settled } = loader(sources());
		await l.refresh();
		expect(Object.fromEntries(settled).snapshot).toEqual({ ok: true, at: NOW });
	});

	it('reports nothing once the owner is gone', async () => {
		const owner = new AbortController();
		let release!: () => void;
		const held = new Promise<[]>((r) => (release = () => r([])));
		const { l, settled } = loader(sources({ nps: () => held }), owner.signal);
		const running = l.refresh();
		await Promise.resolve();
		const before = settled.length;
		owner.abort();
		release();
		await running;
		expect(settled.filter(([p]) => p === 'nps')).toEqual([]);
		expect(settled.length).toBe(before);
	});
});

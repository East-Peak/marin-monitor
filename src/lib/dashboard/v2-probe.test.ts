import { describe, expect, it } from 'vitest';
import type { BriefCard } from './brief-store';
import { briefPending, createV2Probe } from './v2-probe';

describe('the v2 test hook (Codex r3 #5)', () => {
	it('without ?probe nothing is exposed', () => {
		const target: Record<string, unknown> = {};
		createV2Probe('', target).set({ loading: [] });
		expect('__v2Probe' in target).toBe(false);
	});
	it('with ?probe the live state is exposed and follows updates; dispose removes it', () => {
		const target: Record<string, unknown> = {};
		const probe = createV2Probe('?layout=v2&probe', target);
		probe.set({ loading: ['part:snapshot'], dataRevision: 2 });
		probe.set({ synced: { revision: 2, counts: { 'news-pins': 3 } } });
		expect(target.__v2Probe).toEqual({
			loading: ['part:snapshot'],
			layers: {},
			dataRevision: 2,
			synced: { revision: 2, counts: { 'news-pins': 3 } }
		});
		probe.dispose();
		expect('__v2Probe' in target).toBe(false);
	});
	it('briefPending names the brief cards still loading or reloading (Codex r4 #3)', () => {
		const card = (state: string, updatingFor: string | null = null) =>
			({
				value: null,
				scope: null,
				observedAt: null,
				maxAgeMs: null,
				state,
				detail: null,
				updatingFor
			}) as BriefCard<never>;
		expect(
			briefPending({
				forecast: card('loading'),
				observed: card('ok'),
				tides: card('stale', 'Mill Valley')
			})
		).toEqual(['brief:forecast', 'brief:tides']);
		expect(
			briefPending({
				forecast: card('unavailable'),
				observed: card('ok'),
				tides: card('ok')
			})
		).toEqual([]);
	});
});

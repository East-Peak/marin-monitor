import { describe, expect, it } from 'vitest';
import { exposeMapForProbe } from './tv-probe-hook';

describe('exposeMapForProbe', () => {
	it('exposes the map only with ?probe, and cleans up after itself', () => {
		const target: Record<string, unknown> = {};
		const map = { id: 'm' };
		exposeMapForProbe('', target, map)();
		expect(target).toEqual({});
		const cleanup = exposeMapForProbe('?probe=1', target, map);
		expect(target.__tvProbeMap).toBe(map);
		cleanup();
		expect('__tvProbeMap' in target).toBe(false);
	});

	it('a stale cleanup never removes a newer map', () => {
		const target: Record<string, unknown> = {};
		const stale = exposeMapForProbe('?probe', target, { id: 'old' });
		const fresh = { id: 'new' };
		exposeMapForProbe('?probe', target, fresh);
		stale();
		expect(target.__tvProbeMap).toBe(fresh);
	});
});

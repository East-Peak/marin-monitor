/**
 * Test-only state for the v2 page (Codex r3 #5). Under ?probe it is exposed as
 * window.__v2Probe: which controller parts are still loading, each map layer's coverage
 * kind, and which data revision the map last drew. e2e waits on these, never on wording.
 */
import { exposeMapForProbe } from '$lib/components/tv/tv-probe-hook';
import type { BriefState } from './brief-store';
import type { V2Provenance } from './v2-map-data';

/** Brief cards that still change the page's height: loading, or reloading for a new place (Codex r4 #3). */
export function briefPending(brief: BriefState): string[] {
	return (['forecast', 'observed', 'tides'] as const)
		.filter((k) => brief[k].state === 'loading' || brief[k].updatingFor !== null)
		.map((k) => `brief:${k}`);
}

export interface V2ProbeState {
	loading: string[];
	layers: Record<string, string>;
	dataRevision: number;
	synced: { revision: number; counts: Record<string, number> } | null;
	/** What the map judged 311 and quakes by (the production readback's evidence). */
	provenance: V2Provenance;
}

export function createV2Probe(search: string, target: Record<string, unknown>) {
	const state: V2ProbeState = {
		loading: [],
		layers: {},
		dataRevision: 0,
		synced: null,
		provenance: {
			'311': { state: 'loading', observedAt: null },
			earthquakes: { state: 'loading', observedAt: null }
		}
	};
	const dispose = exposeMapForProbe(search, target, state, '__v2Probe');
	return {
		state,
		set(patch: Partial<V2ProbeState>) {
			Object.assign(state, patch);
		},
		dispose
	};
}

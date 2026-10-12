/**
 * Opt-in measurement hook for the production acceptance probe (TV slice 3).
 * With ?probe in the URL the TV exposes its MapLibre map as
 * window.__tvProbeMap, so the probe can ask which 311 pins are actually
 * RENDERED (queryRenderedFeatures). Without the parameter nothing is exposed.
 * The TV uses `__tvProbeMap`; the v2 dashboard passes `__v2ProbeMap` and `__v2Probe` (any value).
 */
export function exposeMapForProbe(
	search: string,
	target: Record<string, unknown>,
	map: unknown,
	key = '__tvProbeMap'
): () => void {
	if (!new URLSearchParams(search).has('probe')) return () => {};
	target[key] = map;
	return () => {
		if (target[key] === map) delete target[key];
	};
}

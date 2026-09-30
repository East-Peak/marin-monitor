/**
 * Opt-in measurement hook for the production acceptance probe (TV slice 3).
 * With ?probe in the URL the TV exposes its MapLibre map as
 * window.__tvProbeMap, so the probe can ask which 311 pins are actually
 * RENDERED (queryRenderedFeatures). Without the parameter nothing is exposed.
 */
const KEY = '__tvProbeMap';

export function exposeMapForProbe(
	search: string,
	target: Record<string, unknown>,
	map: unknown
): () => void {
	if (!new URLSearchParams(search).has('probe')) return () => {};
	target[KEY] = map;
	return () => {
		if (target[KEY] === map) delete target[KEY];
	};
}

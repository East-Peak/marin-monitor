import { describe, expect, it } from 'vitest';
import mapDataLayerSource from './MapDataLayer.svelte?raw';
import { INSPECTION_CLICK_LAYERS } from './map-interactions';

/**
 * Drift guard: every point-like layer MapDataLayer binds for inspection must be in
 * INSPECTION_CLICK_LAYERS, or a click on it falls through and changes the global town.
 * The duplication already shipped one bug (fire zones, Codex PR3 #1).
 */
function triggerLayerGroups(source: string): Map<string, string[]> {
	const groups = new Map<string, string[]>();
	const declaration = /\b(?:const|let|var)\s+(\w+)TriggerLayers\b\s*(?::[^=]+)?=\s*\[([^\]]*)\]/g;
	for (const [, name, body] of source.matchAll(declaration)) {
		groups.set(
			name,
			[...body.matchAll(/(['"`])(.+?)\1/g)].map(([, , id]) => id)
		);
	}
	return groups;
}

describe('INSPECTION_CLICK_LAYERS stays in sync with MapDataLayer', () => {
	const groups = triggerLayerGroups(mapDataLayerSource);
	groups.delete('town'); // towns are the fallback click, not an inspection layer

	it('parses every declaration shape and quote style, so no id is silently skipped (Codex final-fix P3)', () => {
		const parsed = triggerLayerGroups(`
			const plainTriggerLayers = ['a-layer', "b-layer"];
			const typedTriggerLayers: string[] = [\`c-layer\`];
			let spacedTriggerLayers=[
				'd-layer',
			];
		`);
		expect([...parsed]).toEqual([
			['plain', ['a-layer', 'b-layer']],
			['typed', ['c-layer']],
			['spaced', ['d-layer']]
		]);
	});

	it('parses every *TriggerLayers declaration in MapDataLayer', () => {
		const declared = mapDataLayerSource.match(/\b\w+TriggerLayers\b\s*[:=]/g) ?? [];
		expect(triggerLayerGroups(mapDataLayerSource).size).toBe(declared.length);
	});

	it('finds the trigger-layer groups (the guard is not hollow)', () => {
		expect(groups.size).toBeGreaterThanOrEqual(12);
		expect(groups.get('fireZone')).toEqual(['fire-zones-layer']);
	});

	it.each([...groups])('%sTriggerLayers are all inspection click layers', (_name, ids) => {
		const inspection = new Set<string>(INSPECTION_CLICK_LAYERS);
		expect(ids.length).toBeGreaterThan(0);
		expect(ids.filter((id) => !inspection.has(id))).toEqual([]);
	});
});

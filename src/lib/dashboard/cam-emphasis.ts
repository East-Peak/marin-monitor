/**
 * A camera's wedge is quiet until asked for (CAMQUIET1): hovering its wedge, its pin or its
 * in-view row, or selecting it, emphasises the camera. One feature-state key, `emphasis`, is
 * set on its pin and its wedge alike, both addressed by the camera id (`promoteId: 'itemId'`).
 */
import type { Map as MapLibreMap } from 'maplibre-gl';

export const CAM_SOURCES = ['cameras', 'camera-wedges'] as const;

const PREFIX = 'cams:';

/** The cameras to emphasise: the hovered and the selected item, where each is a camera. */
export function emphasisedCams(hovered: string | null, selected: string | null): string[] {
	const ids = [hovered, selected].flatMap((id) =>
		id?.startsWith(PREFIX) ? [id.slice(PREFIX.length)] : []
	);
	return [...new Set(ids)];
}

/** Moves the key from the cameras in `from` to those in `to`, on every camera source present. */
export function setCamEmphasis(
	map: Pick<MapLibreMap, 'getSource' | 'setFeatureState'>,
	from: readonly string[],
	to: readonly string[]
): void {
	const set = (id: string, emphasis: boolean) => {
		for (const source of CAM_SOURCES)
			if (map.getSource(source)) map.setFeatureState({ source, id }, { emphasis });
	};
	for (const id of from) if (!to.includes(id)) set(id, false);
	for (const id of to) set(id, true);
}

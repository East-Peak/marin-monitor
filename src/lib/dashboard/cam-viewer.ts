/**
 * The camera viewer's sequence (CAMVIEW1): which cameras it steps through, in the wall's order,
 * and how the arrows move along them. The viewer shows only cameras with a loadable image: the
 * strip's cameras, validated here rather than taken on trust from a URL or a map. Pure.
 */
import type { CameraConfig } from '$lib/config/cameras';
import { CALTRANS_CAMS } from '$lib/config/caltrans-cams';
import { headingLine, noWedgeLine } from './cam-heading';
import type { HeadingsState } from './cam-headings-store';
import type { FrameSlot } from './cam-frame-window';
import { captureAgeLabel, stripCameras } from './cam-strip';
import { camWallGroups } from './cam-wall';
import type { Bounds } from './map-in-view';

export interface SequenceItem {
	cam: CameraConfig;
	/** The wall group's label: "South Marin", "101 traffic". */
	area: string;
}

/** The cameras the viewer can show: still images, served over https. */
export function viewerCameras(): CameraConfig[] {
	return stripCameras().filter((c) => c.type === 'image' && /^https:\/\//.test(c.url));
}

/** The given ids (or every viewer camera) in wall order; unknown and duplicate ids are dropped. */
export function camSequence(ids?: readonly string[]): SequenceItem[] {
	const want = ids ? new Set(ids) : null;
	return camWallGroups(viewerCameras().filter((c) => !want || want.has(c.id))).flatMap((g) =>
		g.cams.map((cam) => ({ cam, area: g.label }))
	);
}

/** ← and →: one step, stopping at the ends. */
export function stepIndex(length: number, index: number, dir: 1 | -1): number {
	return Math.min(Math.max(index + dir, 0), Math.max(length - 1, 0));
}

/** ↑ and ↓: the first camera of the previous or next area; nothing past the first or last. */
export function areaJump(seq: readonly SequenceItem[], index: number, dir: 1 | -1): number {
	const starts = seq.flatMap((s, i) => (i === 0 || seq[i - 1].area !== s.area ? [i] : []));
	const here = starts.filter((s) => s <= index).length - 1;
	return starts[here + dir] ?? index;
}

export interface SequenceArea {
	label: string;
	items: { cam: CameraConfig; index: number }[];
}

/** The thumbnail strip's groups. */
export function sequenceAreas(seq: readonly SequenceItem[]): SequenceArea[] {
	const out: SequenceArea[] = [];
	seq.forEach((s, index) => {
		if (out.at(-1)?.label !== s.area) out.push({ label: s.area, items: [] });
		out.at(-1)!.items.push({ cam: s.cam, index });
	});
	return out;
}

/** Where a camera stands, `[lon, lat]`: Caltrans' by D4's placement, as on the map (MAPX4b). */
export function camPosition(cam: CameraConfig): [number, number] | null {
	const road = CALTRANS_CAMS[cam.id];
	if (road) return [road.lon, road.lat];
	return cam.lon !== undefined && cam.lat !== undefined ? [cam.lon, cam.lat] : null;
}

/** The viewer cameras standing inside the bounds. */
export function camsInBounds(b: Bounds): string[] {
	return viewerCameras().flatMap((c) => {
		const p = camPosition(c);
		return p && p[0] >= b.west && p[0] <= b.east && p[1] >= b.south && p[1] <= b.north
			? [c.id]
			: [];
	});
}

/**
 * The map's sequence: a snapshot of the cameras in view, with the camera asked for added in
 * wall order when it stands outside the view (or the Cameras layer is off).
 */
export function mapSequence(visible: Bounds | null, requested?: string): SequenceItem[] {
	return camSequence([
		...(visible ? camsInBounds(visible) : []),
		...(requested ? [requested] : [])
	]);
}

/** The caption's time line: the source's capture age where known, never a guess. */
export function frameTimeLine(slot: FrameSlot, now: number): { text: string; warn: boolean } {
	if (slot.placeholder) return { text: 'Camera temporarily unavailable', warn: true };
	const f = slot.frame;
	if (!f)
		return slot.failed
			? { text: 'Frame unavailable', warn: true }
			: { text: 'Loading frame…', warn: false };
	if (slot.failed) {
		const min = Math.max(1, Math.round((now - f.receivedAt) / 60_000));
		return { text: `Last received ${min} min ago, not updating`, warn: true };
	}
	const age = captureAgeLabel(f.capturedAt, now);
	return age
		? { text: `Updated ${age.text}`, warn: age.old }
		: { text: 'Capture time unavailable', warn: false };
}

/** The heading as the map's detail says it: with its time, and why no cone is drawn. */
export function headingLines(
	cam: CameraConfig,
	headings: HeadingsState | null,
	now: number
): string[] {
	const road = CALTRANS_CAMS[cam.id];
	if (road) return [`Facing ${road.direction} · approximate (road direction)`];
	const read = headings?.state === 'ok' ? headings.read : null;
	const h = read?.cams.find((c) => c.id === cam.id);
	const why = noWedgeLine(h, now);
	return [headingLine(h, read?.headingAt ?? null, now), ...(why ? [why] : [])];
}

/** What a map offers its details: Enlarge opens the viewer on the cameras in view. */
export interface CamViewerContext {
	open(id: string): void;
}
export const CAM_VIEWER_CONTEXT = 'cam-viewer';

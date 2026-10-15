/**
 * The desktop cam wall (plan-dashboard-desktop Goal 1): the strip's cameras grouped by
 * area. Ridge cams by their config sub-region, then the 101 traffic cams; a camera with
 * no sub-region goes to a final "Other" group, so none is ever dropped. Pure.
 */
import { FIRE_SUB_REGIONS, type CameraConfig } from '$lib/config/cameras';

export interface CamWallGroup {
	id: string;
	label: string;
	/** Columns of the wall's six-column grid: South Marin leads at 4, the rest take 2. */
	span: 4 | 2;
	cams: CameraConfig[];
}

const GROUPS = [
	...FIRE_SUB_REGIONS.map((r) => ({ id: r.id as string, label: r.label })),
	{ id: 'traffic', label: '101 traffic' },
	{ id: 'other', label: 'Other' }
];

function groupOf(cam: CameraConfig): string {
	if (cam.category === 'traffic') return 'traffic';
	return cam.subRegion ?? 'other';
}

/** Groups in wall order; `cams` is already in strip order and keeps it. */
export function camWallGroups(cams: readonly CameraConfig[]): CamWallGroup[] {
	return GROUPS.map((g) => ({
		...g,
		span: g.id === 'south' ? (4 as const) : (2 as const),
		cams: cams.filter((c) => groupOf(c) === g.id)
	})).filter((g) => g.cams.length > 0);
}

import { describe, expect, it } from 'vitest';
import { CAMERAS, type CameraConfig } from '$lib/config/cameras';
import { stripCameras } from './cam-strip';
import { camWallGroups } from './cam-wall';

const fire = (id: string, subRegion?: CameraConfig['subRegion'], order = 1): CameraConfig => ({
	id,
	name: id,
	location: 'Marin',
	category: 'fire',
	type: 'image',
	url: `https://example.test/${id}.jpg`,
	source: 'ALERTCalifornia',
	order,
	subRegion
});

describe('camWallGroups', () => {
	it('groups ridge cams South/Central/West/North in that order, then 101 traffic; a camera with no sub-region lands in a final "Other" group, never dropped', () => {
		const stray = fire('alert-stray');
		const input = stripCameras([...CAMERAS, stray]);
		const groups = camWallGroups(input);
		expect(groups.map((g) => g.label)).toEqual([
			'South Marin',
			'Central Marin',
			'West Marin',
			'North Marin',
			'101 traffic',
			'Other'
		]);
		expect(groups.flatMap((g) => g.cams)).toHaveLength(input.length);
		expect(new Set(groups.flatMap((g) => g.cams.map((c) => c.id)))).toEqual(
			new Set(input.map((c) => c.id))
		);
		expect(groups.at(-1)!.cams.map((c) => c.id)).toEqual(['alert-stray']);
		expect(
			groups.find((g) => g.label === '101 traffic')!.cams.every((c) => c.category === 'traffic')
		).toBe(true);
	});
	it('South Marin leads at span 4; every other group is span 2; empty groups are left out', () => {
		const groups = camWallGroups(stripCameras(CAMERAS));
		expect(groups.map((g) => g.span)).toEqual([4, 2, 2, 2, 2]);
		expect(camWallGroups([fire('a', 'west')]).map((g) => g.label)).toEqual(['West Marin']);
	});
	it('keeps the strip order inside each group', () => {
		const cams = [fire('s2', 'south', 2), fire('s1', 'south', 1)];
		expect(camWallGroups(stripCameras(cams))[0].cams.map((c) => c.id)).toEqual(['s1', 's2']);
	});
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAMERAS } from './cameras';

/**
 * CAMQUIET1: our ALERTCalifornia positions are each camera's named site, so each sits within
 * 1 km of the feed's own point (rounded to 0.01°, up to ~0.8 km of rounding). The feed as read
 * on 2026-10-18; no network.
 */
const feed = JSON.parse(
	readFileSync(join(__dirname, '__fixtures__', 'alert-cams-feed.json'), 'utf8')
) as { cams: Record<string, { name: string; coordinates: [number, number, number] }> };

const AXIS = /\/public-camera-data\/([^/]+)\/latest-frame\.jpg$/;
const alertCams = CAMERAS.flatMap((c) => {
	const axis = AXIS.exec(c.url)?.[1];
	return axis ? [{ cam: c, feed: feed.cams[axis] }] : [];
});

const km = ([lon1, lat1]: number[], [lon2, lat2]: number[]) => {
	const rad = (d: number) => (d * Math.PI) / 180;
	const a =
		Math.sin(rad(lat2 - lat1) / 2) ** 2 +
		Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
	return 2 * 6371 * Math.asin(Math.sqrt(a));
};

describe('ALERTCalifornia camera positions', () => {
	it('the fixture holds every configured ALERTCalifornia camera', () => {
		expect(alertCams).toHaveLength(17);
		for (const { cam, feed: f } of alertCams) expect(f, cam.id).toBeDefined();
	});

	it("every camera sits within 1.0 km of the feed's rounded point", () => {
		const off = alertCams
			.map(({ cam, feed: f }) => ({ id: cam.id, km: km([cam.lon!, cam.lat!], f.coordinates) }))
			.filter((d) => !(d.km <= 1.0))
			.map((d) => `${d.id}: ${d.km.toFixed(1)} km`);
		expect(off).toEqual([]);
	});

	it('cameras on one site share one point', () => {
		const sites = new Map<string, Set<string>>();
		for (const { cam, feed: f } of alertCams) {
			const site = f.coordinates.slice(0, 2).join(',');
			sites.set(site, (sites.get(site) ?? new Set()).add(`${cam.lat},${cam.lon}`));
		}
		for (const [site, points] of sites) expect([...points], site).toHaveLength(1);
	});
});

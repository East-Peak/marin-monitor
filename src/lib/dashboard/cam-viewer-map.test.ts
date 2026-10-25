import { describe, expect, it } from 'vitest';
import { CAMERAS } from '$lib/config/cameras';
import { MARIN_OUTLINE } from '$lib/config/marin-outline';
import type { CamHeading } from './cam-heading';
import { FRAME_FRESH_MS } from './cam-heading';
import {
	MARIN_BOUNDS,
	ANCHORS,
	createProjection,
	outlinePaths,
	viewerCone
} from './cam-viewer-map';

const cam = (id: string) => CAMERAS.find((c) => c.id === id)!;
const NOW = 1_800_000_000_000;
const heading = (over: Partial<CamHeading> = {}): CamHeading => ({
	id: 'alert-tam-east',
	az: 90,
	fov: 60,
	patrolling: false,
	frameAt: NOW - 60_000,
	...over
});

describe('createProjection', () => {
	const box = { west: -123, east: -122, south: 38, north: 39 };
	const p = createProjection(box, 200, 10);

	it('is north-up: west→left, north→top, inside the padding', () => {
		expect(p.project([-123, 39])).toEqual([10, 10]);
		const [x, y] = p.project([-122, 38]);
		expect(x).toBeCloseTo(190);
		expect(y).toBeCloseTo(p.height - 10);
	});

	it('keeps the aspect: a degree of longitude is cos(latitude) of a degree of latitude', () => {
		const k = Math.cos((38.5 * Math.PI) / 180);
		expect((p.height - 20) / 180).toBeCloseTo(1 / k, 5);
	});

	it('fits Marin in a corner-map width', () => {
		const m = createProjection(MARIN_BOUNDS, 240, 8);
		expect(m.height).toBeGreaterThan(200);
		expect(m.height).toBeLessThan(300);
		for (const ring of MARIN_OUTLINE)
			for (const pt of ring) {
				const [x, y] = m.project(pt);
				expect(x).toBeGreaterThanOrEqual(7.99);
				expect(x).toBeLessThanOrEqual(232.01);
				expect(y).toBeGreaterThanOrEqual(7.99);
				expect(y).toBeLessThanOrEqual(m.height - 7.99);
			}
	});
});

describe('outlinePaths / anchors', () => {
	it('draws every ring as a closed path', () => {
		const paths = outlinePaths(createProjection(MARIN_BOUNDS, 240, 8));
		expect(paths).toHaveLength(MARIN_OUTLINE.length);
		for (const d of paths) expect(d).toMatch(/^M[\d.]+,[\d.]+(L[\d.]+,[\d.]+)+Z$/);
	});

	it('names the five anchors, each inside the county box', () => {
		expect(ANCHORS.map((a) => a.name)).toEqual([
			'Mt. Tam',
			'San Rafael',
			'Novato',
			'Point Reyes',
			'Golden Gate'
		]);
		for (const a of ANCHORS) {
			expect(a.at[0]).toBeGreaterThanOrEqual(MARIN_BOUNDS.west);
			expect(a.at[0]).toBeLessThanOrEqual(MARIN_BOUNDS.east);
			expect(a.at[1]).toBeGreaterThanOrEqual(MARIN_BOUNDS.south);
			expect(a.at[1]).toBeLessThanOrEqual(MARIN_BOUNDS.north);
		}
	});
});

describe('viewerCone', () => {
	const proj = createProjection(MARIN_BOUNDS, 240, 8);
	const tam = cam('alert-tam-east');
	const origin = proj.project([tam.lon!, tam.lat!]);

	it('a still, fresh heading: solid, opening toward its azimuth', () => {
		const c = viewerCone(tam, heading({ az: 90 }), NOW, proj);
		expect(c.style).toBe('solid');
		if (!c.style) throw new Error();
		expect(c.origin).toEqual(origin);
		// East: the far points lie to the right of the camera, about level with it.
		const far = c.points.slice(1, -1);
		expect(far.every(([x]) => x > origin[0])).toBe(true);
		const mid = far[Math.floor(far.length / 2)];
		expect(Math.abs(mid[1] - origin[1])).toBeLessThan(1);
	});

	it('north points up, south points down', () => {
		const n = viewerCone(tam, heading({ az: 0 }), NOW, proj);
		const s = viewerCone(tam, heading({ az: 180 }), NOW, proj);
		if (!n.style || !s.style) throw new Error();
		expect(n.points.slice(1, -1).every(([, y]) => y < origin[1])).toBe(true);
		expect(s.points.slice(1, -1).every(([, y]) => y > origin[1])).toBe(true);
	});

	it('dashed while patrolling or with the patrol flag unreported', () => {
		expect(viewerCone(tam, heading({ patrolling: true }), NOW, proj).style).toBe('sweeping');
		expect(viewerCone(tam, heading({ patrolling: null }), NOW, proj).style).toBe('sweeping');
	});

	it('none, with the map’s reason, without a usable heading', () => {
		expect(viewerCone(tam, undefined, NOW, proj)).toEqual({
			style: null,
			reason: 'No direction drawn: heading unavailable'
		});
		expect(viewerCone(tam, heading({ az: null }), NOW, proj).style).toBeNull();
	});

	it('expires with the clock: a frame older than the freshness window draws none', () => {
		const h = heading({ frameAt: NOW });
		expect(viewerCone(tam, h, NOW + FRAME_FRESH_MS, proj).style).toBe('solid');
		expect(viewerCone(tam, h, NOW + FRAME_FRESH_MS + 60_000, proj)).toEqual({
			style: null,
			reason: 'No direction drawn: last frame 6 min ago'
		});
	});

	it('a traffic camera: its road direction, approximate, whatever the heading feed says', () => {
		const c = viewerCone(cam('caltrans-spencer'), undefined, NOW, proj);
		expect(c.style).toBe('approximate');
		if (!c.style) throw new Error();
		// Facing N.
		expect(c.points.slice(1, -1).every(([, y]) => y < c.origin[1])).toBe(true);
	});
});

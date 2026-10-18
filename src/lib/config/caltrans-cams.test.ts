import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAMERAS } from './cameras';
import {
	CALTRANS_CAMS,
	CALTRANS_WEDGE_FOV,
	d4Placement,
	directionAz,
	type D4Record
} from './caltrans-cams';

const fixture = JSON.parse(
	readFileSync(join(__dirname, '__fixtures__', 'cctv-d4-marin.json'), 'utf8')
) as { data: D4Record[] };

const caltransCams = CAMERAS.filter((c) => c.source === 'Caltrans');

describe('CALTRANS_CAMS placement table', () => {
	it('covers every configured Caltrans camera with a matching image URL', () => {
		expect(caltransCams.length).toBeGreaterThan(0);
		for (const cam of caltransCams) {
			const entry = CALTRANS_CAMS[cam.id];
			expect(entry, cam.id).toBeDefined();
			expect(entry.d4ImageUrl).toBe(cam.url);
			expect(entry.id).toBe(cam.id);
		}
	});

	it('names only configured cameras', () => {
		const ids = new Set(caltransCams.map((c) => c.id));
		for (const [key, entry] of Object.entries(CALTRANS_CAMS)) {
			expect(ids.has(key), key).toBe(true);
			expect(entry.id).toBe(key);
		}
	});

	it('places every camera inside Marin', () => {
		for (const entry of Object.values(CALTRANS_CAMS)) {
			expect(entry.lat).toBeGreaterThan(37.8);
			expect(entry.lat).toBeLessThan(38.35);
			expect(entry.lon).toBeGreaterThan(-123.1);
			expect(entry.lon).toBeLessThan(-122.4);
		}
	});

	it('agrees with the D4 feed fixture for every camera', () => {
		for (const entry of Object.values(CALTRANS_CAMS)) {
			const p = d4Placement(fixture.data, entry.d4ImageUrl);
			expect(p, entry.id).not.toBeNull();
			expect(p!.lat).toBeCloseTo(entry.lat, 5);
			expect(p!.lon).toBeCloseTo(entry.lon, 5);
			expect(p!.direction).toBe(entry.direction);
		}
	});
});

describe('d4Placement', () => {
	it('returns null for an unknown URL', () => {
		expect(d4Placement(fixture.data, 'https://cwwp2.dot.ca.gov/nope.jpg')).toBeNull();
	});

	it('returns null for malformed records instead of throwing', () => {
		expect(d4Placement([{} as D4Record], 'x')).toBeNull();
	});
});

describe('directionAz', () => {
	it('maps compass letters to azimuth degrees', () => {
		expect(directionAz('N')).toBe(0);
		expect(directionAz('E')).toBe(90);
		expect(directionAz('S')).toBe(180);
		expect(directionAz('W')).toBe(270);
	});

	it('exposes the wedge field of view', () => {
		expect(CALTRANS_WEDGE_FOV).toBe(60);
	});
});

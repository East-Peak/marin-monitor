import { describe, expect, it } from 'vitest';
import {
	ALERT_AXIS_IDS,
	FRAME_FRESH_MS,
	HeadingFeedError,
	compass16,
	headingFooter,
	headingLine,
	noWedgeLine,
	parseHeadingFeed,
	sector,
	wedgeState,
	type CamHeading
} from './cam-heading';

const feature = (props: Record<string, unknown>) => ({
	type: 'Feature',
	geometry: { type: 'Point', coordinates: [null, null, null] },
	properties: {
		az_current: 162.64,
		fov: 65.1,
		is_patrol_mode: 0,
		is_currently_patrolling: 0,
		last_frame_ts: 1_792_293_751,
		...props
	}
});
const feed = (...features: unknown[]) => ({ type: 'FeatureCollection', features });

describe('ALERT_AXIS_IDS', () => {
	it("maps each configured ALERTCalifornia cam's Axis id to our id (17 in Marin)", () => {
		expect(ALERT_AXIS_IDS.size).toBe(17);
		expect(ALERT_AXIS_IDS.get('Axis-TamEast')).toBe('alert-tam-east');
		expect(ALERT_AXIS_IDS.get('Axis-League221')).toBe('alert-league-221');
	});
});

describe('parseHeadingFeed', () => {
	it('keeps only the configured Marin cams, under our ids', () => {
		const out = parseHeadingFeed(
			feed(feature({ id: 'Axis-TamEast' }), feature({ id: 'AXIS-BCPOSLongmont' }))
		);
		expect(out).toEqual([
			{
				id: 'alert-tam-east',
				az: 162.64,
				fov: 65.1,
				patrolling: false,
				frameAt: 1_792_293_751_000
			}
		]);
	});

	it("ignores the feed's coordinates: null or rounded, positions are ours", () => {
		const [cam] = parseHeadingFeed(feed(feature({ id: 'Axis-Bolinas' })));
		expect(cam).not.toHaveProperty('lat');
		expect(cam.id).toBe('alert-bolinas');
	});

	it('an unreported heading or field of view is null, never 0 (fov "" is common)', () => {
		const [cam] = parseHeadingFeed(
			feed(feature({ id: 'Axis-Vision', az_current: null, fov: '', last_frame_ts: null }))
		);
		expect(cam).toMatchObject({ az: null, fov: null, frameAt: null });
	});

	it('either patrol flag means the camera is sweeping', () => {
		const out = parseHeadingFeed(
			feed(
				feature({ id: 'Axis-TamEast', is_patrol_mode: 1 }),
				feature({ id: 'Axis-TamWest', is_currently_patrolling: 1 })
			)
		);
		expect(out.map((c) => c.patrolling)).toEqual([true, true]);
	});

	it('a schema miss is a HeadingFeedError with a reason', () => {
		expect(() => parseHeadingFeed({ type: 'FeatureCollection' })).toThrow(HeadingFeedError);
		expect(() => parseHeadingFeed(null)).toThrow(/features/);
		expect(() =>
			parseHeadingFeed(feed({ type: 'Feature', properties: { id: 'Axis-TamEast' } }))
		).toThrow(/az_current/);
	});

	it('no patrol flag is never "holding still" (Codex MAPX4 #3): patrol not reported', () => {
		const [cam] = parseHeadingFeed(
			feed({
				type: 'Feature',
				properties: { id: 'Axis-TamEast', az_current: 1, fov: 60, last_frame_ts: 1 }
			})
		);
		expect(cam.patrolling).toBeNull();
	});

	it('null-valued patrol flags are unknown too, never "still" (Codex MAPFRESH1 #4)', () => {
		const [cam] = parseHeadingFeed(
			feed(feature({ id: 'Axis-TamEast', is_patrol_mode: null, is_currently_patrolling: null }))
		);
		expect(cam.patrolling).toBeNull();
		const [still] = parseHeadingFeed(
			feed(feature({ id: 'Axis-TamEast', is_patrol_mode: 0, is_currently_patrolling: null }))
		);
		expect(still.patrolling).toBe(false);
	});

	it('the 2026-10 feed: its own id, our Axis id in stream_ids, no patrol flags (MAPFRESH1)', () => {
		const live = (props: Record<string, unknown>) => ({
			type: 'Feature',
			properties: {
				fov: 65.1,
				az_current: 326.78,
				ptz_updated_ts: 1_792_808_201,
				last_frame_ts: 1_792_808_213,
				...props
			}
		});
		const out = parseHeadingFeed(
			feed(
				live({ id: 'mttam-cam01', stream_ids: ['Axis-TamEast'] }),
				live({ id: 'africalookout-cam01', stream_ids: ['axis-africalookout1'] })
			)
		);
		expect(out).toEqual([
			{ id: 'alert-tam-east', az: 326.78, fov: 65.1, patrolling: null, frameAt: 1_792_808_213_000 }
		]);
	});

	it('none of our cams in the feed (ids renamed) is a schema miss, not an empty map', () => {
		expect(() => parseHeadingFeed(feed(feature({ id: 'AXIS-Elsewhere' })))).toThrow(
			/none of the 17 Marin cameras/
		);
	});
});

describe('compass16', () => {
	it.each([
		[0, 'N'],
		[11.24, 'N'],
		[11.25, 'NNE'],
		[90, 'E'],
		[162.64, 'SSE'],
		[270.42, 'W'],
		[348.75, 'N'],
		[359.9, 'N'],
		[-10, 'N'],
		[370, 'N']
	])('%s° is %s', (az, word) => expect(compass16(az)).toBe(word));
});

const cam = (over: Partial<CamHeading> = {}): CamHeading => ({
	id: 'alert-tam-east',
	az: 162.64,
	fov: 65.1,
	patrolling: false,
	frameAt: 1_000_000,
	...over
});

describe('headingFooter', () => {
	it('names the direction and the rounded bearing', () => {
		expect(headingFooter(cam())).toBe('Looking SSE · 163°');
	});
	it('says "Sweeping" while patrolling', () => {
		expect(headingFooter(cam({ patrolling: true }))).toBe('Sweeping');
	});
	it('patrol not reported: the last reported direction, never "Looking" (MAPFRESH1)', () => {
		expect(headingFooter(cam({ az: 326.78, patrolling: null }))).toBe('Last reported NNW · 327°');
	});
	it('no read or no heading: nothing, never a guess', () => {
		expect(headingFooter(undefined)).toBeNull();
		expect(headingFooter(cam({ az: null }))).toBeNull();
	});
	it('360 rounds to 0°, not 360°', () => {
		expect(headingFooter(cam({ az: 359.7 }))).toBe('Looking N · 0°');
	});
});

describe('headingLine', () => {
	const at = Date.parse('2026-10-17T14:52:00Z'); // 7:52 AM Pacific
	it("is the last reported heading with the feed's own time", () => {
		expect(headingLine(cam(), at, at + 60_000)).toBe('Last reported heading: SSE (163°) · 7:52 AM');
	});
	it('says when it was sweeping', () => {
		expect(headingLine(cam({ patrolling: true }), at, at)).toBe(
			'Last reported heading: sweeping (patrol) · 7:52 AM'
		);
	});
	it('no heading: says so', () => {
		expect(headingLine(cam({ az: null }), at, at)).toBe('Heading not reported');
		expect(headingLine(undefined, null, at)).toBe('Heading unavailable');
	});
});

describe('wedgeState', () => {
	const now = 10_000_000;
	it('solid when the frame is at most 5 minutes old and the camera is still', () => {
		expect(wedgeState(cam({ frameAt: now - FRAME_FRESH_MS }), now)).toBe('solid');
	});
	it('dashed ("sweeping") while patrolling', () => {
		expect(wedgeState(cam({ frameAt: now, patrolling: true }), now)).toBe('sweeping');
	});
	it('patrol not reported: dashed, as it may be moving (MAPFRESH1)', () => {
		expect(wedgeState(cam({ frameAt: now, patrolling: null }), now)).toBe('sweeping');
	});
	it('not drawn when the frame is stale, unreported, or there is no heading or fov', () => {
		expect(wedgeState(cam({ frameAt: now - FRAME_FRESH_MS - 1 }), now)).toBeNull();
		expect(wedgeState(cam({ frameAt: null }), now)).toBeNull();
		expect(wedgeState(cam({ frameAt: now, az: null }), now)).toBeNull();
		expect(wedgeState(cam({ frameAt: now, fov: null }), now)).toBeNull();
	});
});

describe('noWedgeLine (CAMQUIET1)', () => {
	const now = 10_000_000;
	it('nothing to say while a wedge is drawn', () => {
		expect(noWedgeLine(cam({ frameAt: now - 60_000 }), now)).toBeNull();
		expect(noWedgeLine(cam({ frameAt: now, patrolling: true }), now)).toBeNull();
	});
	it("a stale frame: says how old, in minutes (Vision's 11)", () => {
		expect(noWedgeLine(cam({ frameAt: now - 11 * 60_000 }), now)).toBe(
			'No direction drawn: last frame 11 min ago'
		);
	});
	it('no read, no heading or no frame time: heading unavailable', () => {
		expect(noWedgeLine(undefined, now)).toBe('No direction drawn: heading unavailable');
		expect(noWedgeLine(cam({ frameAt: now, az: null }), now)).toBe(
			'No direction drawn: heading unavailable'
		);
		expect(noWedgeLine(cam({ frameAt: null }), now)).toBe(
			'No direction drawn: heading unavailable'
		);
	});
});

describe('sector', () => {
	const origin: [number, number] = [-122.5816, 37.9235];
	const bearing = ([lon, lat]: number[]) => {
		const φ1 = (origin[1] * Math.PI) / 180;
		const φ2 = (lat * Math.PI) / 180;
		const Δλ = ((lon - origin[0]) * Math.PI) / 180;
		const y = Math.sin(Δλ) * Math.cos(φ2);
		const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
		return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
	};
	const km = ([lon, lat]: number[]) => {
		const dφ = ((lat - origin[1]) * Math.PI) / 180;
		const dλ = ((lon - origin[0]) * Math.PI) / 180;
		const a =
			Math.sin(dφ / 2) ** 2 +
			Math.cos((origin[1] * Math.PI) / 180) *
				Math.cos((lat * Math.PI) / 180) *
				Math.sin(dλ / 2) ** 2;
		return 2 * 6371 * Math.asin(Math.sqrt(a));
	};
	const arc = (az: number, fov: number) => {
		const ring = sector(origin, az, fov, 6).coordinates[0];
		return { ring, arc: ring.slice(1, -1) };
	};

	it('is a closed ring from the camera out to the arc and back', () => {
		const { ring } = arc(90, 60);
		expect(ring[0]).toEqual(origin);
		expect(ring.at(-1)).toEqual(origin);
	});

	it.each([
		[0, 330, 30],
		[90, 60, 120],
		[359, 329, 29]
	])('az %s with a 60° fov spans %s° to %s° at 6 km', (az, from, to) => {
		const { arc: points } = arc(az, 60);
		expect(bearing(points[0])).toBeCloseTo(from, 1);
		expect(bearing(points.at(-1)!)).toBeCloseTo(to, 1);
		for (const p of points) expect(km(p)).toBeCloseTo(6, 2);
	});

	it('wraps through north without sweeping the long way round (az 359)', () => {
		const { arc: points } = arc(359, 60);
		const turns = points.slice(1).map((p, i) => {
			const d = bearing(p) - bearing(points[i]);
			return ((d + 540) % 360) - 180;
		});
		for (const t of turns) expect(t).toBeGreaterThan(0);
		expect(turns.reduce((a, b) => a + b, 0)).toBeCloseTo(60, 1);
	});
});

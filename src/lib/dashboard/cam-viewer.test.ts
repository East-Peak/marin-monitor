import { describe, expect, it } from 'vitest';
import { CAMERAS, type CameraConfig } from '$lib/config/cameras';
import { stripCameras } from './cam-strip';
import { camWallGroups } from './cam-wall';
import type { FrameSlot } from './cam-frame-window';
import {
	areaJump,
	camPosition,
	camSequence,
	camsInBounds,
	frameTimeLine,
	headingLines,
	mapSequence,
	sequenceAreas,
	stepIndex,
	viewerCameras
} from './cam-viewer';

const wallIds = camWallGroups(stripCameras()).flatMap((g) => g.cams.map((c) => c.id));

describe('camSequence', () => {
	it('with no ids is every viewer camera in wall order: ridge cams by area, then 101', () => {
		const seq = camSequence();
		expect(seq.map((s) => s.cam.id)).toEqual(wallIds);
		expect(seq[0].area).toBe('South Marin');
		expect(seq.at(-1)!.area).toBe('101 traffic');
	});

	it('puts given ids in wall order, drops duplicates and anything the viewer cannot show', () => {
		const seq = camSequence([
			'caltrans-spencer',
			'alert-tam-east',
			'abc7-tam', // scenic: not a viewer camera
			'windy-muir', // an embed: not a loadable image
			'nope',
			'alert-tam-east'
		]);
		expect(seq.map((s) => s.cam.id)).toEqual(['alert-tam-east', 'caltrans-spencer']);
	});

	it('is empty for no supported ids, and a single camera is a sequence of one', () => {
		expect(camSequence(['nope', 'abc7-tam'])).toEqual([]);
		expect(camSequence(['alert-bolinas']).map((s) => s.cam.id)).toEqual(['alert-bolinas']);
	});

	it('validates against its own list, not all of CAMERAS', () => {
		const ids = new Set(viewerCameras().map((c) => c.id));
		expect(CAMERAS.some((c) => !ids.has(c.id))).toBe(true);
		for (const c of viewerCameras()) {
			expect(c.type).toBe('image');
			expect(c.url).toMatch(/^https:\/\//);
		}
	});
});

describe('stepIndex', () => {
	it('steps one either way and stops at the ends (no wrap)', () => {
		expect(stepIndex(5, 0, 1)).toBe(1);
		expect(stepIndex(5, 1, -1)).toBe(0);
		expect(stepIndex(5, 0, -1)).toBe(0);
		expect(stepIndex(5, 4, 1)).toBe(4);
		expect(stepIndex(1, 0, 1)).toBe(0);
	});
});

describe('areaJump', () => {
	const seq = camSequence();
	const firstOf = (area: string) => seq.findIndex((s) => s.area === area);

	it('↓ goes to the first camera of the next area, ↑ to the first of the previous', () => {
		const central = firstOf('Central Marin');
		const west = firstOf('West Marin');
		expect(areaJump(seq, 0, 1)).toBe(central);
		expect(areaJump(seq, central + 1, 1)).toBe(west);
		expect(areaJump(seq, west + 1, -1)).toBe(central);
		expect(areaJump(seq, west, -1)).toBe(central);
	});

	it('does nothing past the first or last area', () => {
		expect(areaJump(seq, 1, -1)).toBe(1);
		const last = seq.length - 1;
		expect(areaJump(seq, last, 1)).toBe(last);
	});
});

describe('sequenceAreas', () => {
	it('groups the sequence by area with each camera’s index', () => {
		const seq = camSequence(['alert-tam-east', 'alert-san-pedro', 'alert-tam-west']);
		expect(
			sequenceAreas(seq).map((a) => [a.label, a.items.map((i) => [i.cam.id, i.index])])
		).toEqual([
			[
				'South Marin',
				[
					['alert-tam-east', 0],
					['alert-tam-west', 1]
				]
			],
			['Central Marin', [['alert-san-pedro', 2]]]
		]);
	});
});

describe('camPosition', () => {
	it('is the config position for a ridge cam and D4’s placement for a Caltrans cam', () => {
		const tam = CAMERAS.find((c) => c.id === 'alert-tam-east')!;
		expect(camPosition(tam)).toEqual([tam.lon, tam.lat]);
		expect(camPosition(CAMERAS.find((c) => c.id === 'caltrans-spencer')!)).toEqual([
			-122.48975, 37.85081
		]);
		const nowhere: CameraConfig = { ...tam, id: 'x', lat: undefined, lon: undefined };
		expect(camPosition(nowhere)).toBeNull();
	});
});

describe('camsInBounds / mapSequence', () => {
	// Around Mt. Tam and Muir Beach only.
	const tam = { west: -122.62, east: -122.55, south: 37.85, north: 37.95 };

	it('lists the viewer cameras inside the bounds', () => {
		expect(camsInBounds(tam).sort()).toEqual(
			['alert-muir-beach', 'alert-tam-east', 'alert-tam-west'].sort()
		);
	});

	it('is the cameras in view in wall order, with a requested camera outside it added', () => {
		expect(mapSequence(tam).map((s) => s.cam.id)).toEqual([
			'alert-tam-east',
			'alert-tam-west',
			'alert-muir-beach'
		]);
		expect(mapSequence(tam, 'caltrans-ignacio').map((s) => s.cam.id)).toEqual([
			'alert-tam-east',
			'alert-tam-west',
			'alert-muir-beach',
			'caltrans-ignacio'
		]);
		expect(mapSequence(null, 'alert-bolinas').map((s) => s.cam.id)).toEqual(['alert-bolinas']);
	});
});

describe('frameTimeLine', () => {
	const NOW = 1_800_000_000_000;
	const frame = (capturedAt: number | null, receivedAt = NOW - 30_000) => ({
		img: {} as HTMLImageElement,
		capturedAt,
		receivedAt
	});
	const slot = (over: Partial<FrameSlot>): FrameSlot => ({
		frame: null,
		loading: false,
		failed: false,
		placeholder: false,
		...over
	});

	it('the source’s capture age, by the wall’s rule, where it exposes one', () => {
		expect(frameTimeLine(slot({ frame: frame(NOW - 3 * 60_000) }), NOW)).toEqual({
			text: 'Updated 3 min ago',
			warn: false
		});
		expect(frameTimeLine(slot({ frame: frame(NOW - 45 * 60_000) }), NOW).warn).toBe(true);
	});

	it('without one, says so: the heading feed’s frame time is not this frame’s', () => {
		expect(frameTimeLine(slot({ frame: frame(null) }), NOW)).toEqual({
			text: 'Capture time unavailable',
			warn: false
		});
	});

	it('a failed refresh keeps the frame and says when we last received one, not its age', () => {
		expect(
			frameTimeLine(slot({ frame: frame(NOW - 3 * 60_000, NOW - 2 * 60_000), failed: true }), NOW)
		).toEqual({ text: 'Last received 2 min ago, not updating', warn: true });
	});

	it('a frame that never loaded is unavailable; one still loading says so; a stand-in card is unavailable', () => {
		expect(frameTimeLine(slot({ failed: true }), NOW)).toEqual({
			text: 'Frame unavailable',
			warn: true
		});
		expect(frameTimeLine(slot({ loading: true }), NOW)).toEqual({
			text: 'Loading frame…',
			warn: false
		});
		expect(frameTimeLine(slot({ placeholder: true }), NOW)).toEqual({
			text: 'Camera temporarily unavailable',
			warn: true
		});
	});
});

describe('headingLines', () => {
	const NOW = 1_800_000_000_000;
	const read = {
		headingAt: NOW - 60_000,
		cams: [{ id: 'alert-muir-beach', az: 200, fov: 60, patrolling: false, frameAt: NOW - 60_000 }]
	};
	const muir = CAMERAS.find((c) => c.id === 'alert-muir-beach')!;

	it('a ridge cam says it as the map’s detail does: the heading with its time', () => {
		const lines = headingLines(muir, { state: 'ok', read }, NOW);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatch(/^Last reported heading: SSW \(200°\) · /);
	});

	it('with no usable heading, the map’s reason too; a failed read clears the heading', () => {
		const stale = { ...read, cams: [{ ...read.cams[0], frameAt: NOW - 20 * 60_000 }] };
		expect(headingLines(muir, { state: 'ok', read: stale }, NOW)[1]).toBe(
			'No direction drawn: last frame 20 min ago'
		);
		expect(headingLines(muir, { state: 'unavailable', read: null }, NOW)).toEqual([
			'Heading unavailable',
			'No direction drawn: heading unavailable'
		]);
	});

	it('a traffic cam faces its road, approximately', () => {
		const spencer = CAMERAS.find((c) => c.id === 'caltrans-spencer')!;
		expect(headingLines(spencer, null, NOW)).toEqual(['Facing N · approximate (road direction)']);
	});
});

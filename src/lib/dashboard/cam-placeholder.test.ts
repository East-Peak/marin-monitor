import { describe, expect, it } from 'vitest';
import {
	PLACEHOLDER_FINGERPRINTS,
	frameFingerprint,
	isPlaceholderFingerprint
} from './cam-placeholder';

/** A width×height RGBA frame painted by `paint(x, y)` → grey level. */
function frame(width: number, height: number, paint: (x: number, y: number) => number) {
	const data = new Uint8ClampedArray(width * height * 4);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			data.set([paint(x, y), paint(x, y), paint(x, y), 255], i);
		}
	return { data, width, height };
}

describe('frameFingerprint', () => {
	it('is a 16×12 grid of mean luminance', () => {
		const fp = frameFingerprint(frame(320, 260, () => 255));
		expect(fp).toHaveLength(192);
		expect(new Set(fp)).toEqual(new Set([255]));
	});

	it("leaves out Caltrans' time bar along the bottom (its clock changes every frame)", () => {
		const fp = frameFingerprint(frame(320, 260, (_x, y) => (y >= 236 ? 0 : 255)));
		expect(new Set(fp)).toEqual(new Set([255]));
	});

	it('keeps where things are: a dark left half reads dark on the left', () => {
		const fp = frameFingerprint(frame(320, 260, (x) => (x < 160 ? 0 : 255)));
		expect(fp.slice(0, 16)).toEqual([...Array(8).fill(0), ...Array(8).fill(255)]);
	});

	it('weighs red, green and blue as luminance', () => {
		const data = new Uint8ClampedArray(320 * 260 * 4);
		for (let i = 0; i < data.length; i += 4) data.set([255, 0, 0, 255], i);
		expect(frameFingerprint({ data, width: 320, height: 260 })[0]).toBe(76);
	});
});

describe('isPlaceholderFingerprint', () => {
	it.each(Object.keys(PLACEHOLDER_FINGERPRINTS))('matches the captured %s card', (name) => {
		expect(isPlaceholderFingerprint(PLACEHOLDER_FINGERPRINTS[name])).toBe(true);
	});

	it('still matches with a few levels of decoder noise', () => {
		const noisy = PLACEHOLDER_FINGERPRINTS['Temporarily Unavailable'].map((v, i) =>
			Math.max(0, Math.min(255, v + (i % 2 ? 6 : -6)))
		);
		expect(isPlaceholderFingerprint(noisy)).toBe(true);
	});

	it('a picture is not a placeholder: grey fog, a dark night, a bright scene', () => {
		expect(isPlaceholderFingerprint(Array(192).fill(200))).toBe(false);
		expect(isPlaceholderFingerprint(Array(192).fill(30))).toBe(false);
		expect(isPlaceholderFingerprint(Array.from({ length: 192 }, (_, i) => (i % 16) * 16))).toBe(
			false
		);
	});

	it('a fingerprint of the wrong size never matches', () => {
		expect(isPlaceholderFingerprint([])).toBe(false);
	});
});

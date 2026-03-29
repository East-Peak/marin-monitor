// src/lib/config/fitness.test.ts

import { describe, it, expect } from 'vitest';
import {
	FITNESS_STUDIOS,
	FITNESS_BLOB_KEY,
	MAX_FITNESS_HISTORY,
	TYPE_ORDER,
	TYPE_LABELS,
	TYPE_COLORS,
	computeMedian,
	computeMedianByType
} from './fitness';

describe('fitness studio config', () => {
	it('has 16 studios', () => {
		expect(FITNESS_STUDIOS).toHaveLength(16);
	});

	it('every studio has a unique id', () => {
		const ids = FITNESS_STUDIOS.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('every studio has a valid type', () => {
		for (const studio of FITNESS_STUDIOS) {
			expect(TYPE_ORDER).toContain(studio.type);
		}
	});

	it('every studio has a positive drop-in price', () => {
		for (const studio of FITNESS_STUDIOS) {
			expect(studio.dropInPrice).toBeGreaterThan(0);
		}
	});

	it('every studio has valid coordinates in Marin County', () => {
		for (const studio of FITNESS_STUDIOS) {
			// Marin County lat range: ~37.8 to ~38.2
			expect(studio.lat).toBeGreaterThan(37.8);
			expect(studio.lat).toBeLessThan(38.2);
			// Marin County lon range: ~-122.3 to ~-122.8
			expect(studio.lon).toBeGreaterThan(-122.8);
			expect(studio.lon).toBeLessThan(-122.3);
		}
	});

	it('has 8 yoga studios', () => {
		const yoga = FITNESS_STUDIOS.filter((s) => s.type === 'yoga');
		expect(yoga).toHaveLength(8);
	});

	it('has 5 pilates studios', () => {
		const pilates = FITNESS_STUDIOS.filter((s) => s.type === 'pilates');
		expect(pilates).toHaveLength(5);
	});

	it('has 1 cycling studio', () => {
		const cycling = FITNESS_STUDIOS.filter((s) => s.type === 'cycling');
		expect(cycling).toHaveLength(1);
	});

	it('has 1 HIIT studio', () => {
		const hiit = FITNESS_STUDIOS.filter((s) => s.type === 'hiit');
		expect(hiit).toHaveLength(1);
	});

	it('has 1 CrossFit studio', () => {
		const crossfit = FITNESS_STUDIOS.filter((s) => s.type === 'crossfit');
		expect(crossfit).toHaveLength(1);
	});

	it('blob key is a valid string', () => {
		expect(FITNESS_BLOB_KEY).toBe('marin-fitness.json');
	});

	it('max history is 24 months (2 years)', () => {
		expect(MAX_FITNESS_HISTORY).toBe(24);
	});

	it('every type has a label', () => {
		for (const type of TYPE_ORDER) {
			expect(TYPE_LABELS[type]).toBeTruthy();
		}
	});

	it('every type has a pin color', () => {
		for (const type of TYPE_ORDER) {
			expect(TYPE_COLORS[type]).toMatch(/^#[0-9a-f]{6}$/i);
		}
	});
});

describe('computeMedian', () => {
	it('returns null for empty array', () => {
		expect(computeMedian([])).toBeNull();
	});

	it('returns the single value for one-element array', () => {
		expect(computeMedian([42])).toBe(42);
	});

	it('returns median of odd-length array', () => {
		expect(computeMedian([10, 20, 30])).toBe(20);
	});

	it('returns average of middle two for even-length array', () => {
		expect(computeMedian([10, 20, 30, 40])).toBe(25);
	});

	it('handles unsorted input', () => {
		expect(computeMedian([30, 10, 20])).toBe(20);
	});
});

describe('computeMedianByType', () => {
	it('computes medians for each type with studios', () => {
		const medians = computeMedianByType(FITNESS_STUDIOS);
		// All 5 types have at least one studio
		expect(Object.keys(medians).length).toBe(5);
	});

	it('yoga median is between cheapest and most expensive yoga', () => {
		const medians = computeMedianByType(FITNESS_STUDIOS);
		expect(medians.yoga).toBeGreaterThanOrEqual(27);
		expect(medians.yoga).toBeLessThanOrEqual(39);
	});

	it('pilates median is between cheapest and most expensive pilates', () => {
		const medians = computeMedianByType(FITNESS_STUDIOS);
		expect(medians.pilates).toBeGreaterThanOrEqual(45);
		expect(medians.pilates).toBeLessThanOrEqual(55);
	});

	it('returns empty for empty studio list', () => {
		const medians = computeMedianByType([]);
		expect(Object.keys(medians).length).toBe(0);
	});
});

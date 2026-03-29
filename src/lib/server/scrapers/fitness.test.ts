// src/lib/server/scrapers/fitness.test.ts

import { describe, it, expect } from 'vitest';
import { computeFitnessSnapshot } from './fitness';
import { FITNESS_STUDIOS, TYPE_ORDER } from '$lib/config/fitness';

describe('computeFitnessSnapshot', () => {
	it('returns a valid snapshot with all required fields', () => {
		const snapshot = computeFitnessSnapshot();

		expect(snapshot.timestamp).toBeTruthy();
		expect(snapshot.studioCount).toBe(FITNESS_STUDIOS.length);
		expect(snapshot.medianPrice).toBeGreaterThan(0);
		expect(snapshot.avgPrice).toBeGreaterThan(0);
		expect(snapshot.minPrice).toBeGreaterThan(0);
		expect(snapshot.maxPrice).toBeGreaterThan(0);
		expect(snapshot.studios).toHaveLength(FITNESS_STUDIOS.length);
	});

	it('min <= median <= max', () => {
		const snapshot = computeFitnessSnapshot();
		expect(snapshot.minPrice!).toBeLessThanOrEqual(snapshot.medianPrice!);
		expect(snapshot.medianPrice!).toBeLessThanOrEqual(snapshot.maxPrice!);
	});

	it('includes medianByType for all types with studios', () => {
		const snapshot = computeFitnessSnapshot();
		for (const type of TYPE_ORDER) {
			const hasStudios = FITNESS_STUDIOS.some((s) => s.type === type);
			if (hasStudios) {
				expect(snapshot.medianByType[type]).toBeDefined();
				expect(snapshot.medianByType[type]).toBeGreaterThan(0);
			}
		}
	});

	it('studios have correct properties', () => {
		const snapshot = computeFitnessSnapshot();
		for (const studio of snapshot.studios) {
			expect(studio.id).toBeTruthy();
			expect(studio.name).toBeTruthy();
			expect(studio.town).toBeTruthy();
			expect(studio.dropInPrice).toBeGreaterThan(0);
			expect(studio.lat).toBeGreaterThan(37);
			expect(studio.lon).toBeLessThan(-122);
		}
	});

	it('cheapest studio is Tamalpais CrossFit at $25', () => {
		const snapshot = computeFitnessSnapshot();
		expect(snapshot.minPrice).toBe(25);
		const cheapest = snapshot.studios.find((s) => s.dropInPrice === 25);
		expect(cheapest?.name).toBe('Tamalpais CrossFit');
	});

	it('most expensive studio is Internal Fire Pilates at $55', () => {
		const snapshot = computeFitnessSnapshot();
		expect(snapshot.maxPrice).toBe(55);
		const priciest = snapshot.studios.find((s) => s.dropInPrice === 55);
		expect(priciest?.name).toBe('Internal Fire Pilates');
	});
});

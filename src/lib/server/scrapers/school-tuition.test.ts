// src/lib/server/scrapers/school-tuition.test.ts

import { describe, it, expect } from 'vitest';
import { computeSchoolSnapshot } from './school-tuition';
import { SCHOOLS, LEVEL_ORDER, MEDIAN_HOUSEHOLD_INCOME } from '$lib/config/schools';

describe('computeSchoolSnapshot', () => {
	it('returns a valid snapshot with all required fields', () => {
		const snapshot = computeSchoolSnapshot();

		expect(snapshot.timestamp).toBeTruthy();
		expect(snapshot.medianHouseholdIncome).toBe(MEDIAN_HOUSEHOLD_INCOME);
		expect(snapshot.incomeSource).toBeTruthy();
		expect(snapshot.incomeYear).toBeTruthy();
		expect(snapshot.tiers.length).toBeGreaterThan(0);
		expect(snapshot.schools).toHaveLength(SCHOOLS.length);
		expect(snapshot.cumulativeK12).toBeGreaterThan(0);
	});

	it('includes all school levels that have schools', () => {
		const snapshot = computeSchoolSnapshot();
		const tierLevels = snapshot.tiers.map((t) => t.level);

		// We have at least one school per level
		for (const level of LEVEL_ORDER) {
			const hasSchoolsAtLevel = SCHOOLS.some((s) => s.level === level);
			if (hasSchoolsAtLevel) {
				expect(tierLevels).toContain(level);
			}
		}
	});

	it('schools have correct properties', () => {
		const snapshot = computeSchoolSnapshot();
		for (const school of snapshot.schools) {
			expect(school.id).toBeTruthy();
			expect(school.name).toBeTruthy();
			expect(school.town).toBeTruthy();
			expect(school.tuition).toBeGreaterThan(0);
			expect(school.url).toMatch(/^https:\/\//);
			expect(school.lat).toBeGreaterThan(37);
			expect(school.lon).toBeLessThan(-122);
		}
	});

	it('San Domenico has boarding tuition', () => {
		const snapshot = computeSchoolSnapshot();
		const sanDomenico = snapshot.schools.find((s) => s.id === 'san-domenico');
		expect(sanDomenico).toBeDefined();
		expect(sanDomenico!.boardingTuition).toBeGreaterThan(sanDomenico!.tuition);
	});

	it('Branson has total cost', () => {
		const snapshot = computeSchoolSnapshot();
		const branson = snapshot.schools.find((s) => s.id === 'branson');
		expect(branson).toBeDefined();
		expect(branson!.totalCost).toBeGreaterThan(branson!.tuition);
	});

	it('tier percentages are reasonable (20-60% of median income)', () => {
		const snapshot = computeSchoolSnapshot();
		for (const tier of snapshot.tiers) {
			expect(tier.pctOfMedianIncome).toBeGreaterThan(20);
			expect(tier.pctOfMedianIncome).toBeLessThan(60);
		}
	});

	it('cumulative K-12 is sum of tier averages times years', () => {
		const snapshot = computeSchoolSnapshot();
		// Manually verify: elementary(6yr) + middle(3yr) + high(4yr) = 13 years
		const elemTier = snapshot.tiers.find((t) => t.level === 'elementary');
		const middleTier = snapshot.tiers.find((t) => t.level === 'middle');
		const highTier = snapshot.tiers.find((t) => t.level === 'high');

		const expected =
			(elemTier?.avgTuition ?? 0) * 6 +
			(middleTier?.avgTuition ?? 0) * 3 +
			(highTier?.avgTuition ?? 0) * 4;

		expect(snapshot.cumulativeK12).toBe(expected);
	});
});

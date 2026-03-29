// src/lib/config/schools.test.ts

import { describe, it, expect } from 'vitest';
import {
	SCHOOLS,
	SCHOOL_TUITION_BLOB_KEY,
	MAX_SCHOOL_HISTORY,
	MEDIAN_HOUSEHOLD_INCOME,
	INCOME_SOURCE,
	INCOME_YEAR,
	LEVEL_ORDER,
	LEVEL_LABELS,
	YEARS_PER_LEVEL,
	computeTiers,
	computeCumulativeK12
} from './schools';

describe('school tuition config', () => {
	it('has 7 schools', () => {
		expect(SCHOOLS).toHaveLength(7);
	});

	it('every school has a unique id', () => {
		const ids = SCHOOLS.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('every school has a valid level', () => {
		for (const school of SCHOOLS) {
			expect(LEVEL_ORDER).toContain(school.level);
		}
	});

	it('every school has a positive tuition', () => {
		for (const school of SCHOOLS) {
			expect(school.tuition).toBeGreaterThan(0);
		}
	});

	it('every school has a URL starting with https', () => {
		for (const school of SCHOOLS) {
			expect(school.url).toMatch(/^https:\/\//);
		}
	});

	it('every school has valid coordinates in Marin County', () => {
		for (const school of SCHOOLS) {
			// Marin County lat range: ~37.8 to ~38.1
			expect(school.lat).toBeGreaterThan(37.8);
			expect(school.lat).toBeLessThan(38.2);
			// Marin County lon range: ~-122.3 to ~-122.8
			expect(school.lon).toBeGreaterThan(-122.8);
			expect(school.lon).toBeLessThan(-122.3);
		}
	});

	it('does not include Ring Mountain Day School (closed)', () => {
		const names = SCHOOLS.map((s) => s.name.toLowerCase());
		expect(names.some((n) => n.includes('ring mountain'))).toBe(false);
	});

	it('blob key is a valid string', () => {
		expect(SCHOOL_TUITION_BLOB_KEY).toBe('marin-school-tuition.json');
	});

	it('max history is 24 months (2 years)', () => {
		expect(MAX_SCHOOL_HISTORY).toBe(24);
	});

	it('median household income is a reasonable value', () => {
		expect(MEDIAN_HOUSEHOLD_INCOME).toBeGreaterThan(100_000);
		expect(MEDIAN_HOUSEHOLD_INCOME).toBeLessThan(300_000);
	});

	it('income source and year are defined', () => {
		expect(INCOME_SOURCE).toBeTruthy();
		expect(INCOME_YEAR).toBeTruthy();
	});

	it('K-12 years sum to 13', () => {
		const totalYears = Object.values(YEARS_PER_LEVEL).reduce((a, b) => a + b, 0);
		expect(totalYears).toBe(13);
	});
});

describe('computeTiers', () => {
	it('produces tiers for levels that have schools', () => {
		const tiers = computeTiers(SCHOOLS, MEDIAN_HOUSEHOLD_INCOME);
		// We have preschool (Montessori), elementary (MCDS, Horizon), middle (MP&MS), high (Branson, SD, MA)
		expect(tiers.length).toBeGreaterThanOrEqual(4);
	});

	it('every tier has a positive average tuition', () => {
		const tiers = computeTiers(SCHOOLS, MEDIAN_HOUSEHOLD_INCOME);
		for (const tier of tiers) {
			expect(tier.avgTuition).toBeGreaterThan(0);
		}
	});

	it('every tier has a positive pctOfMedianIncome', () => {
		const tiers = computeTiers(SCHOOLS, MEDIAN_HOUSEHOLD_INCOME);
		for (const tier of tiers) {
			expect(tier.pctOfMedianIncome).toBeGreaterThan(0);
		}
	});

	it('tier labels match LEVEL_LABELS', () => {
		const tiers = computeTiers(SCHOOLS, MEDIAN_HOUSEHOLD_INCOME);
		for (const tier of tiers) {
			expect(tier.label).toBe(LEVEL_LABELS[tier.level]);
		}
	});

	it('returns empty array for no schools', () => {
		const tiers = computeTiers([], MEDIAN_HOUSEHOLD_INCOME);
		expect(tiers).toEqual([]);
	});

	it('computes correct average for two elementary schools', () => {
		const elementarySchools = SCHOOLS.filter((s) => s.level === 'elementary');
		expect(elementarySchools).toHaveLength(2);
		const expectedAvg = Math.round(
			elementarySchools.reduce((sum, s) => sum + s.tuition, 0) / elementarySchools.length
		);
		const tiers = computeTiers(SCHOOLS, MEDIAN_HOUSEHOLD_INCOME);
		const elemTier = tiers.find((t) => t.level === 'elementary');
		expect(elemTier?.avgTuition).toBe(expectedAvg);
	});
});

describe('computeCumulativeK12', () => {
	it('computes cumulative cost from tiers', () => {
		const tiers = computeTiers(SCHOOLS, MEDIAN_HOUSEHOLD_INCOME);
		const cumulative = computeCumulativeK12(tiers);
		// Should be > 0 and a large number (hundreds of thousands)
		expect(cumulative).toBeGreaterThan(500_000);
		expect(cumulative).toBeLessThan(2_000_000);
	});

	it('excludes preschool from K-12 total (0 years)', () => {
		const preschoolOnly = computeTiers(
			SCHOOLS.filter((s) => s.level === 'preschool'),
			MEDIAN_HOUSEHOLD_INCOME
		);
		const cumulative = computeCumulativeK12(preschoolOnly);
		expect(cumulative).toBe(0);
	});

	it('returns 0 for empty tiers', () => {
		expect(computeCumulativeK12([])).toBe(0);
	});
});

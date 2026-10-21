import { describe, expect, it } from 'vitest';
import { priceAnchors } from './anchors';

const NOW = new Date('2026-10-20T18:00:00.000Z');

describe('priceAnchors', () => {
	it('pre-assigns three anchors, each with its units', () => {
		const anchors = priceAnchors(NOW);
		expect(anchors.map((a) => [a.id, a.units])).toEqual([
			['medianHouseholdIncome', 'gross household'],
			['minimumWageTakeHome', 'net individual'],
			['teacherSalary', 'gross individual']
		]);
	});

	it('reads the Census median and the teacher’s salary step as cited figures', () => {
		const [median, , teacher] = priceAnchors(NOW);
		expect(median).toMatchObject({ value: 147017, availability: 'ok' });
		expect(median.inputs[0]).toMatchObject({ class: 'cited', asOf: '2026-10-20' });
		expect(teacher).toMatchObject({ value: 113029, availability: 'ok' });
	});

	it('computes the minimum-wage take-home with the single-filer engine (Case D)', () => {
		const [, minWage] = priceAnchors(NOW);
		expect(minWage.value).toBeCloseTo(29613.28, 1);
		expect(minWage.inputs.map((i) => [i.name, i.class, i.value])).toEqual([
			['hourly', 'cited', 16.9],
			['hours', 'persona', 2080]
		]);
	});

	it('goes stale with its sources', () => {
		const later = priceAnchors(new Date('2027-01-02T12:00:00Z'));
		expect(later[1].availability).toBe('stale');
	});
});

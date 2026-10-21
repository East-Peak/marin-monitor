import { describe, expect, it } from 'vitest';
import { CITED } from './sources';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('CITED', () => {
	it.each(Object.entries(CITED))(
		'%s carries its figure, source, period, scope and check date',
		(_id, s) => {
			expect(Number.isFinite(s.figure)).toBe(true);
			expect(s.label.length).toBeGreaterThan(0);
			expect(s.url).toMatch(/^https:\/\//);
			expect(s.period.length).toBeGreaterThan(0);
			expect(s.scope.length).toBeGreaterThan(0);
			expect(s.checkedAt).toMatch(DATE);
			expect(s.recheckDays).toBeGreaterThan(0);
			if ('validUntil' in s) expect(s.validUntil).toMatch(DATE);
		}
	);

	it('is frozen, so no caller can move a cited figure', () => {
		expect(Object.isFrozen(CITED)).toBe(true);
		expect(Object.isFrozen(CITED['redfin.larkspur.2024'])).toBe(true);
	});
});

import { describe, expect, it } from 'vitest';
import { safeEquals } from './request-security';

describe('safeEquals', () => {
	it('returns true for matching values', () => {
		expect(safeEquals('secret', 'secret')).toBe(true);
	});

	it('returns false for different values', () => {
		expect(safeEquals('secret', 'secrex')).toBe(false);
	});

	it('returns false when either side is missing', () => {
		expect(safeEquals('secret', null)).toBe(false);
		expect(safeEquals(undefined, 'secret')).toBe(false);
	});
});

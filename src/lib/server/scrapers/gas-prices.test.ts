import { describe, it, expect } from 'vitest';
import { parseGoogleMoney } from './gas-prices';

describe('parseGoogleMoney', () => {
	it('parses units and nanos into a dollar float', () => {
		expect(parseGoogleMoney({ units: '4', nanos: 599000000 })).toBe(4.599);
	});

	it('parses units only', () => {
		expect(parseGoogleMoney({ units: '5', nanos: 0 })).toBe(5);
	});

	it('parses nanos only', () => {
		expect(parseGoogleMoney({ units: '0', nanos: 990000000 })).toBe(0.99);
	});

	it('returns null for undefined input', () => {
		expect(parseGoogleMoney(undefined)).toBeNull();
	});

	it('returns null for zero price', () => {
		expect(parseGoogleMoney({ units: '0', nanos: 0 })).toBeNull();
	});

	it('handles missing units field', () => {
		expect(parseGoogleMoney({ nanos: 450000000 })).toBe(0.45);
	});

	it('handles missing nanos field', () => {
		expect(parseGoogleMoney({ units: '3' })).toBe(3);
	});

	it('rounds to 3 decimal places', () => {
		expect(parseGoogleMoney({ units: '4', nanos: 599999999 })).toBe(4.6);
	});
});

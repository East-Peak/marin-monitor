import { describe, expect, it } from 'vitest';
import { parseIkonAdultPrice } from '../../../scripts/shared/ikon-pass.mjs';

// Rendered innerText of ikonpass.com/en/shop-passes/ikon-pass (2026-09-29, 26/27 season).
const LIVE = [
	'26/27 Ikon Pass | Ikon Pass',
	'IKON PASS',
	'Your Ikon Pass unlocks adventure across 70+ destinations worldwide.',
	'From $1,449',
	'USD',
	'(Age 23+)',
	'',
	'As low as',
	'',
	' ',
	'$131',
	'',
	'USD/month with',
	'Save up to $100 USD on every Child Pass (ages 5-12) with purchase of on Adult Ikon Pass.'
].join('\n');

describe('parseIkonAdultPrice', () => {
	it('reads the adult season price from the rendered pass page', () => {
		expect(parseIkonAdultPrice(LIVE)).toBe(1449);
	});

	it('ignores monthly-payment and discount amounts when the headline price is missing', () => {
		expect(parseIkonAdultPrice(LIVE.replace('From $1,449', ''))).toBeNull();
	});

	it('rejects an implausible season price (a broken page, not a real price)', () => {
		expect(parseIkonAdultPrice(LIVE.replace('$1,449', '$14'))).toBeNull();
		expect(parseIkonAdultPrice(LIVE.replace('$1,449', '$14,490'))).toBeNull();
	});

	it('returns null for the bot wall / app shell', () => {
		expect(parseIkonAdultPrice('Please enable JavaScript to continue.')).toBeNull();
	});
});

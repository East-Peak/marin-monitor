import { describe, expect, it } from 'vitest';
import { frozenBasketNote } from './grocery-basket';

describe('frozenBasketNote', () => {
	it('dates the last real read in Pacific time', () => {
		expect(frozenBasketNote({ asOf: '2026-11-01T17:11:00.558Z', noLongerUpdated: true })).toBe(
			'Prices as of Nov 1, 2026, no longer updated'
		);
	});
	it('says no longer updated when there is no real read', () => {
		expect(frozenBasketNote({ asOf: null, noLongerUpdated: true })).toBe('No longer updated');
	});
	it('is nothing for a basket that is not frozen', () => {
		expect(frozenBasketNote(undefined)).toBeNull();
	});
});

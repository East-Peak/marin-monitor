import { afterEach, describe, expect, it } from 'vitest';
import { claimSharedStores, mayWrite, type StoreClaim } from './ownership';

const held: StoreClaim[] = [];
const claim = () => {
	const c = claimSharedStores();
	held.push(c);
	return c;
};
afterEach(() => held.splice(0).forEach((c) => c.release()));

describe('shared-store ownership', () => {
	it('unclaimed: the default owner (untokened) writes; no token does', () => {
		expect(mayWrite(undefined)).toBe(true);
		expect(mayWrite(Symbol('stray'))).toBe(false);
	});

	it('claimed: only the claim token writes — the dashboard (untokened) cannot', () => {
		const tv = claim();
		expect(mayWrite(tv.token)).toBe(true);
		expect(mayWrite(undefined)).toBe(false);
		expect(mayWrite(Symbol('other'))).toBe(false);
	});

	it('release returns the stores to the default owner; the released token never writes again', () => {
		const tv = claim();
		tv.release();
		expect(mayWrite(undefined)).toBe(true);
		expect(mayWrite(tv.token)).toBe(false);
	});

	it('a stale release never unclaims a newer owner', () => {
		const first = claim();
		const second = claim();
		first.release();
		expect(mayWrite(second.token)).toBe(true);
		expect(mayWrite(first.token)).toBe(false);
		expect(mayWrite(undefined)).toBe(false);
	});
});

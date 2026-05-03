import { describe, it, expect } from 'vitest';
import { createRequestGuard } from './request-guard';

describe('createRequestGuard', () => {
	it('issues monotonically increasing request IDs', () => {
		const guard = createRequestGuard();
		expect(guard.next()).toBe(1);
		expect(guard.next()).toBe(2);
		expect(guard.next()).toBe(3);
	});

	it('isLatest returns true only for the most recent ID', () => {
		const guard = createRequestGuard();
		const first = guard.next();
		const second = guard.next();
		expect(guard.isLatest(first)).toBe(false);
		expect(guard.isLatest(second)).toBe(true);
	});

	it('isLatest stays true for the latest ID across multiple checks', () => {
		const guard = createRequestGuard();
		const id = guard.next();
		expect(guard.isLatest(id)).toBe(true);
		expect(guard.isLatest(id)).toBe(true);
	});

	it('isLatest returns false for IDs that were never issued', () => {
		const guard = createRequestGuard();
		guard.next();
		expect(guard.isLatest(0)).toBe(false);
		expect(guard.isLatest(99)).toBe(false);
	});

	it('separate guards have independent counters', () => {
		const a = createRequestGuard();
		const b = createRequestGuard();
		expect(a.next()).toBe(1);
		expect(a.next()).toBe(2);
		expect(b.next()).toBe(1);
		expect(a.isLatest(2)).toBe(true);
		expect(b.isLatest(1)).toBe(true);
	});
});

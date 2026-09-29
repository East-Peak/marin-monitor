import { describe, expect, it } from 'vitest';
import { compareByTimestamp, compareNewest, hasKnownPublicationTime } from './order';

const t = (id: string, timestamp: number | null | undefined) => ({ id, timestamp });

describe('compareByTimestamp', () => {
	it.each([
		['unknown first', [t('u', NaN), t('old', 1), t('new', 3)]],
		['unknown in the middle', [t('old', 1), t('u', NaN), t('new', 3)]],
		['unknown last', [t('new', 3), t('old', 1), t('u', NaN)]]
	])('sorts dated newest first and NaN last (%s)', (_label, items) => {
		expect([...items].sort(compareByTimestamp).map((i) => i.id)).toEqual(['new', 'old', 'u']);
	});

	it('keeps several unknowns (NaN, null, undefined, Infinity) after all dated items, in input order', () => {
		const items = [
			t('n1', NaN),
			t('d1', 5),
			t('nul', null),
			t('d2', 9),
			t('und', undefined),
			t('inf', Infinity)
		];
		expect(items.sort(compareByTimestamp).map((i) => i.id)).toEqual([
			'd2',
			'd1',
			'n1',
			'nul',
			'und',
			'inf'
		]);
	});

	it('shows the bug it replaces: a subtraction comparator leaves NaN ahead of dated items', () => {
		const items = [t('u', NaN), t('dated', 5)];
		expect(
			[...items].sort((a, b) => (b.timestamp as number) - (a.timestamp as number)).map((i) => i.id)
		).toEqual(['u', 'dated']);
		expect([...items].sort(compareByTimestamp).map((i) => i.id)).toEqual(['dated', 'u']);
	});
});

describe('compareNewest', () => {
	it('orders ISO publication times newest first with null and garbage last', () => {
		const items = [
			{ id: 'none', publishedAt: null },
			{ id: 'old', publishedAt: '2026-09-27T00:00:00.000Z' },
			{ id: 'bad', publishedAt: 'garbage' },
			{ id: 'new', publishedAt: '2026-09-28T00:00:00.000Z' }
		];
		expect(items.sort(compareNewest).map((i) => i.id)).toEqual(['new', 'old', 'none', 'bad']);
	});
});

describe('hasKnownPublicationTime', () => {
	it.each([
		[{ publishedAtStatus: 'valid' as const, timestamp: 5 }, true],
		[{ publishedAtStatus: 'missing' as const, timestamp: NaN }, false],
		[{ publishedAtStatus: 'future' as const, timestamp: NaN }, false],
		[{ publishedAtStatus: 'invalid' as const, timestamp: NaN }, false],
		[{ timestamp: 5 }, true], // non-RSS adapter with a real timestamp
		[{ timestamp: NaN }, false]
	])('%o → %s', (item, expected) => {
		expect(hasKnownPublicationTime(item)).toBe(expected);
	});
});

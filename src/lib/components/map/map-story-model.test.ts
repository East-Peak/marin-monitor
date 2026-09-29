import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewsItem } from '$lib/types';
import { pinAgeLabel, townTooltipItems, visibleMapItems } from './map-story-model';

const NOW = Date.parse('2026-09-28T20:00:00.000Z');
const item = (
	id: string,
	category: NewsItem['category'],
	timestamp: number,
	townSlug = 'novato'
): NewsItem => ({
	id,
	title: id,
	link: '',
	timestamp,
	source: 's',
	category,
	verification: 'local_media',
	townSlug
});
const everyLayer = () => true;

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('visibleMapItems', () => {
	it('orders mixed categories globally — dated newest first, undated last', () => {
		// The concatenation order a category-by-category store produces:
		const items = [
			item('local-old', 'local', NOW - 5 * 3_600_000),
			item('local-undated', 'local', NaN),
			item('safety-new', 'safety', NOW - 3_600_000)
		];
		expect(visibleMapItems(items, everyLayer).map((i) => i.id)).toEqual([
			'safety-new',
			'local-old',
			'local-undated'
		]);
	});
	it('drops items whose layer is off', () => {
		const items = [item('a', 'local', NOW), item('b', 'safety', NOW)];
		expect(visibleMapItems(items, (i) => i.category === 'safety').map((i) => i.id)).toEqual(['b']);
	});
});

describe('townTooltipItems', () => {
	it("lists only the town's items, undated last", () => {
		const items = [
			item('u', 'civic', NaN),
			item('other-town', 'local', NOW, 'sausalito'),
			item('d', 'local', NOW - 60_000)
		];
		expect(townTooltipItems(items, 'novato', everyLayer).map((i) => i.id)).toEqual(['d', 'u']);
	});
});

describe('pinAgeLabel', () => {
	it.each([
		['missing', undefined],
		['null', null],
		['an empty string', ''],
		['non-numeric', 'abc'],
		['NaN', NaN],
		['zero (epoch placeholder)', 0]
	])('reads "undated" for %s', (_l, raw) => {
		expect(pinAgeLabel(raw)).toBe('undated');
	});
	it('formats a real timestamp with the shared timeAgo (number or string property)', () => {
		expect(pinAgeLabel(NOW - 2 * 3_600_000)).toBe('2h');
		expect(pinAgeLabel(String(NOW - 3 * 86_400_000))).toBe('3d');
	});
});

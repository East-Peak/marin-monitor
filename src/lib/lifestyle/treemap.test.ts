import { describe, expect, it } from 'vitest';
import type { Section } from './model';
import {
	labelFit,
	mapCaption,
	planMap,
	sectionAnchor,
	squarify,
	TILE_INK,
	tileWords,
	type Tile
} from './treemap';
import { SECTION_COLOR, type SectionShare } from './view';

const share = (section: Section, monthly: number | null, partial = false): SectionShare => ({
	section,
	monthly,
	share: monthly === null ? null : monthly / 100,
	partial
});
const items = (...values: number[]) => values.map((value, i) => ({ id: `s${i}`, value }));
const area = (b: { w: number; h: number }) => b.w * b.h;

describe('squarify', () => {
	it('gives each item an area in proportion to its value, inside the box', () => {
		const out = squarify(items(50, 25, 12, 8, 5), 640, 300);
		const total = 640 * 300;
		for (const b of out) {
			expect(Math.abs(area(b) - (b.value / 100) * total)).toBeLessThanOrEqual(1);
			expect(b.x).toBeGreaterThanOrEqual(-1e-6);
			expect(b.y).toBeGreaterThanOrEqual(-1e-6);
			expect(b.x + b.w).toBeLessThanOrEqual(640 + 1e-6);
			expect(b.y + b.h).toBeLessThanOrEqual(300 + 1e-6);
		}
		expect(out.reduce((a, b) => a + area(b), 0)).toBeCloseTo(total, 3);
	});

	it('is deterministic', () => {
		const input = items(40, 30, 20, 10);
		expect(squarify(input, 500, 200)).toEqual(squarify(input, 500, 200));
	});

	it('one item fills the box', () => {
		const [b] = squarify(items(7), 300, 200);
		expect([b.x, b.y]).toEqual([0, 0]);
		expect(b.w).toBeCloseTo(300, 6);
		expect(b.h).toBeCloseTo(200, 6);
	});

	it('equal items get equal areas', () => {
		const out = squarify(items(1, 1, 1, 1), 400, 400);
		for (const b of out) expect(area(b)).toBeCloseTo(40_000, 6);
	});

	it.each([
		[2000, 40],
		[40, 2000]
	])('holds in a very wide or very tall box (%i×%i)', (W, H) => {
		const out = squarify(items(60, 30, 10), W, H);
		expect(out).toHaveLength(3);
		expect(out.reduce((a, b) => a + area(b), 0)).toBeCloseTo(W * H, 3);
	});

	it('nothing to lay out is no boxes', () => {
		expect(squarify([], 300, 200)).toEqual([]);
	});
});

describe('planMap', () => {
	const big = (...rest: SectionShare[]) => [
		share('housing', 500),
		share('kids', 300),
		share('food', 170),
		...rest
	];

	it('leaves out a section at $0 and one that could not be priced', () => {
		const m = planMap(big(share('help', 0), share('cars', null)), 640, 300, 24);
		expect(m.tiles.map((t) => t.id)).toEqual(['housing', 'kids', 'food']);
	});

	it('shares are of spending: a negative section has no area and no effect', () => {
		const m = planMap(big(share('business', -400)), 640, 300, 24);
		expect(m.total).toBe(970);
		expect(m.tiles.some((t) => t.id === 'business')).toBe(false);
	});

	it('groups what is under 3% into "The rest", and keeps exactly 3% out of it', () => {
		const m = planMap(
			[
				share('housing', 900),
				share('kids', 30),
				share('food', 30),
				share('giving', 20),
				share('wellness', 20)
			],
			640,
			300,
			24
		);
		expect(m.tiles.map((t) => t.id)).toEqual(['housing', 'rest', 'kids', 'food']);
		expect(m.tiles.find((t) => t.id === 'rest')?.sections.map((s) => s.section)).toEqual([
			'giving',
			'wellness'
		]);
	});

	it('a lone small section keeps its own tile: a bucket of one says nothing', () => {
		const m = planMap(big(share('giving', 10)), 1000, 1000, 24);
		expect(m.tiles.map((t) => t.id)).toContain('giving');
		expect(m.tiles.map((t) => t.id)).not.toContain('rest');
	});

	it('raises the threshold until every tile clears the floor', () => {
		const sections = [
			share('housing', 800),
			share('kids', 50),
			share('food', 50),
			share('help', 50),
			share('cars', 50)
		];
		expect(planMap(sections, 640, 300, 24).threshold).toBe(3);
		const m = planMap(sections, 200, 120, 44);
		expect(m.threshold).toBeGreaterThan(3);
		for (const t of m.tiles) {
			expect(t.w).toBeGreaterThanOrEqual(44);
			expect(t.h).toBeGreaterThanOrEqual(44);
		}
	});

	it('orders tiles by size, so Tab does', () => {
		const m = planMap(big(), 640, 300, 24);
		const values = m.tiles.map((t) => t.value);
		expect(values).toEqual([...values].sort((a, z) => z - a));
	});

	it('nothing spent is an empty map', () => {
		expect(planMap([], 640, 300, 24)).toEqual({ tiles: [], total: 0, threshold: 3 });
		expect(planMap([share('help', 0, true)], 640, 300, 24).tiles).toEqual([]);
	});

	it('a tile is partial when any of its sections is', () => {
		const m = planMap(big(share('giving', 10, true), share('help', 10)), 640, 300, 24);
		expect(m.tiles.find((t) => t.id === 'rest')?.partial).toBe(true);
		expect(m.tiles.find((t) => t.id === 'housing')?.partial).toBe(false);
	});
});

describe('tileWords', () => {
	const tile = (over: Partial<Tile>): Tile => ({
		id: 'kids',
		sections: [{ section: 'kids', monthly: 2477 }],
		value: 2477,
		partial: false,
		anchor: 'kids',
		x: 0,
		y: 0,
		w: 10,
		h: 10,
		...over
	});

	it('names a section, its month and its share of spending', () => {
		expect(tileWords(tile({}), 42_560).full).toBe('Kids · $2,477 a month · 6% of spending');
	});

	it('says "so far" for a section with an unread line', () => {
		expect(tileWords(tile({ partial: true }), 42_560).full).toBe(
			'Kids · $2,477 a month so far · 6% of spending'
		);
	});

	it('"The rest" lists its sections', () => {
		const w = tileWords(
			tile({
				id: 'rest',
				value: 1699,
				sections: [
					{ section: 'health', monthly: 904 },
					{ section: 'utilities', monthly: 795 }
				]
			}),
			42_560
		);
		expect(w.name).toBe('The rest');
		expect(w.tail).toBe('Health $904 · Utilities $795');
		expect(w.full).toBe('The rest · $1,699 a month · 4% of spending: Health $904 · Utilities $795');
	});

	it('a sliver reads under 1%', () => {
		expect(tileWords(tile({ value: 8 }), 42_560).full).toContain('<1% of spending');
	});
});

describe('mapCaption', () => {
	it('says nothing when the whole month is on the map', () => {
		expect(mapCaption([share('housing', 500)], false)).toBeNull();
	});

	it('says what a negative section leaves out', () => {
		expect(mapCaption([share('housing', 500), share('business', -1200)], false)).toBe(
			'The business brings in $1,200 a month, not shown.'
		);
	});

	it('says "so far", grouped sections included', () => {
		expect(mapCaption([share('giving', 3, true)], true)).toBe('Spending so far.');
	});

	it('names a section with nothing priced, and one at $0 with an unread line', () => {
		expect(mapCaption([share('utilities', null, true), share('help', 0, true)], true)).toBe(
			'Spending so far. Can’t be read: utilities and help.'
		);
	});

	it('a section at $0 with its lines read is nothing to report', () => {
		expect(mapCaption([share('business', 0)], false)).toBeNull();
	});
});

describe('labelFit', () => {
	const px = (s: string) => s.length * 7;
	const fit = (name: string, amount: string, w: number, h: number) =>
		labelFit(name, amount, w, h, { measure: px, lineHeight: 19 });

	it('stacks name and amount when both fit', () => {
		expect(fit('Housing', '$18,673', 100, 60)).toBe('two');
	});
	it('runs them on one line in a short tile', () => {
		expect(fit('Food', '$3,072', 100, 24)).toBe('one');
	});
	it('wraps a two-word name at its space, never inside a word', () => {
		expect(fit('The rest', '$1,285', 54, 80)).toBe('wrap');
	});
	it('falls back to the name alone in a small tile', () => {
		expect(fit('Kids', '$2,477', 40, 24)).toBe('name');
	});
	it('shows nothing rather than truncate', () => {
		expect(fit('Belonging', '$8', 40, 60)).toBeNull();
		expect(fit('Kids', '$2,477', 60, 14)).toBeNull();
	});
});

describe('tiles', () => {
	const luminance = (hex: string) => {
		const [r, g, b] = [1, 3, 5]
			.map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
			.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};
	const contrast = (a: string, b: string) => {
		const [hi, lo] = [luminance(a), luminance(b)].sort((x, z) => z - x);
		return (hi + 0.05) / (lo + 0.05);
	};

	it.each(Object.entries(SECTION_COLOR))('%s’s ink reads on its fill', (section, fill) => {
		expect(contrast(fill, TILE_INK(section as Section))).toBeGreaterThanOrEqual(4.5);
	});

	it('anchors a section', () => {
		expect(sectionAnchor('kids')).toBe('section-kids');
	});
});

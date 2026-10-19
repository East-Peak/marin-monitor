import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matchHeadline } from './gazetteer';
import { PLACES } from '$lib/config/places';
import { LANDMARKS } from '$lib/config/map';
import { VENUES } from '$lib/config/venues';
import { TOWN_BY_SLUG } from '$lib/config/towns';

/** Today's real snapshot titles (2026-10-19), as the producer published them. */
const snapshot = JSON.parse(
	readFileSync(join(__dirname, '__fixtures__/snapshot-2026-10-19.json'), 'utf8')
) as { snapshot: { items: { title: string }[] } };
const real = (part: string) => {
	const hit = snapshot.snapshot.items.find((i) => i.title.includes(part));
	if (!hit) throw new Error(`no title with …${part}…`);
	return hit.title;
};
const placed = (title: string) => {
	const m = matchHeadline(title);
	return m && { id: m.id, precision: m.precision };
};

describe('the gazetteer', () => {
	it('holds every landmark, every reviewed venue and the reviewed areas, each with an id, a name and a point', () => {
		const names = PLACES.map((p) => p.name);
		for (const l of LANDMARKS) expect(names).toContain(l.name);
		for (const v of VENUES) expect(names).toContain(v.name);
		for (const area of ['Angel Island', 'Marin Headlands', 'Marin County Civic Center'])
			expect(names).toContain(area);
		expect(new Set(PLACES.map((p) => p.id)).size).toBe(PLACES.length);
		for (const p of PLACES) {
			expect(['area', 'venue']).toContain(p.precision);
			expect(p.lat).toBeGreaterThan(37.8);
			expect(p.lat).toBeLessThan(38.33);
			expect(p.lon).toBeGreaterThan(-123.1);
			expect(p.lon).toBeLessThan(-122.4);
			if (p.townSlug !== undefined) expect(TOWN_BY_SLUG[p.townSlug]).toBeDefined();
		}
	});

	it('a venue is placed at its reviewed point, never a stale landmark point', () => {
		const ferry = PLACES.find((p) => p.name === 'Sausalito Ferry Terminal')!;
		expect(ferry.precision).toBe('venue');
		// The landmark's point is 716 m off the terminal; the gazetteer carries the reviewed one.
		expect(ferry.lat).toBeCloseTo(37.8562, 3);
		expect(ferry.lon).toBeCloseTo(-122.4777, 3);
		const palace = PLACES.find((p) => p.name === 'Dance Palace')!;
		expect(palace).toMatchObject({ precision: 'venue', townSlug: 'point-reyes' });
	});
});

describe('matchHeadline: title only, whole phrase, longest match', () => {
	it.each([
		// Today's real titles.
		[real('canoers found dead in Tomales Bay'), { id: 'tomales-bay', precision: 'area' }],
		[real('kayak capsizes in Tomales Bay'), { id: 'tomales-bay', precision: 'area' }],
		[
			real('Westbound lanes on Richmond-San Rafael Bridge'),
			{ id: 'richmond-san-rafael-bridge', precision: 'area' }
		],
		[real('Why Angel Island Needs Fire'), { id: 'angel-island', precision: 'area' }],
		[real('Marin Headlands fire'), { id: 'marin-headlands', precision: 'area' }],
		[real('Richardson Bay Wildlife Sanctuary'), { id: 'richardson-bay', precision: 'area' }],
		// A town alone, a region, a street that shares a peak's name, a word inside a phrase.
		[real('San Rafael selects developer'), null],
		[real('North Bay race for Assembly'), null],
		[real('Road Closure Notification – Tamalpais Ave'), null],
		[real('Trying to Bridge Political Divide'), null],
		[real('rocks at seal at Marin County beach'), null]
	])('%s', (title, want) => {
		expect(placed(title)).toEqual(want);
	});

	// No title today names these; the rules are the plan's.
	it('"Point Reyes Station" is the town, not the Lighthouse', () => {
		expect(placed('Point Reyes Station market returns for the season')).toBeNull();
		expect(placed('Whale watchers crowd the Point Reyes Lighthouse')).toEqual({
			id: 'point-reyes-lighthouse',
			precision: 'venue'
		});
	});

	it('a title naming two places is placed at neither', () => {
		expect(placed('Kayakers paddle from Tomales Bay to Bolinas Lagoon')).toBeNull();
		// The same place twice, by name and alias, is still one place.
		expect(placed('Mt. Tam fire watch: Mount Tamalpais lookouts staffed')).toEqual({
			id: 'mt-tamalpais',
			precision: 'area'
		});
	});

	it('a venue must agree with the title’s town; an area stands alone', () => {
		expect(placed('Dance Palace hosts a Point Reyes Station harvest supper')).toEqual({
			id: 'dance-palace',
			precision: 'venue'
		});
		expect(placed('Dance Palace benefit moves to Mill Valley')).toBeNull();
		expect(placed('Inverness paddlers return to Tomales Bay')).toEqual({
			id: 'tomales-bay',
			precision: 'area'
		});
	});

	it('a service, a school or an agency named after a place is not the place (Codex NEWSPIN2 #1, #2)', () => {
		for (const title of [
			'Larkspur ferry fares rise next month',
			'Mount Tam School announces new campus',
			'Mt. Tam School parents rally for crossing guard',
			'Mount Tamalpais College opens enrollment',
			'Golden Gate Bridge District raises bus fares',
			'Golden Gate Bridge, Highway and Transportation District board meets',
			'Richardson Bay Regional Agency adopts anchor-out plan'
		])
			expect(placed(title), title).toBeNull();
		// The place itself, by its own name, still is.
		expect(placed('Larkspur Ferry Terminal parking lot to close')?.id).toBe(
			'larkspur-ferry-terminal'
		);
		expect(placed('Fog closes the Golden Gate Bridge sidewalk')?.id).toBe('golden-gate-bridge');
	});

	it('matches whole words in any case and spelling of punctuation', () => {
		expect(placed('TOMALES BAY oyster farms reopen')?.id).toBe('tomales-bay');
		expect(placed('Tomales Bayside cafe closes')).toBeNull();
		expect(placed('Richmond–San Rafael Bridge lane closures')?.id).toBe(
			'richmond-san-rafael-bridge'
		);
	});
});

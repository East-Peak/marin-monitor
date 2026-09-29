import { describe, expect, it } from 'vitest';
import {
	SECTION_IDS,
	defaultSectionOpen,
	emptySectionPrefs,
	isPhoneViewport,
	parseSectionPrefs,
	resolveSectionOpen,
	sectionFromHash,
	serializeSectionPrefs,
	withSectionOpen,
	type SectionPrefs
} from './section-prefs';

const DESKTOP = 1440;
const PHONE = 390;

describe('parseSectionPrefs', () => {
	it('returns empty prefs for missing, malformed or wrong-version values', () => {
		for (const raw of [
			null,
			'',
			'{oops',
			'[]',
			'null',
			'"x"',
			'{"version":1,"open":{"news":false}}',
			'{"version":2}',
			'{"version":2,"open":[]}'
		]) {
			expect(parseSectionPrefs(raw)).toEqual(emptySectionPrefs());
		}
	});
	it('keeps valid entries and drops unknown ids and non-boolean values one by one', () => {
		const raw = JSON.stringify({
			version: 2,
			open: { news: false, cost: true, bogus: true, strava: 'yes', outdoors: 0 }
		});
		expect(parseSectionPrefs(raw)).toEqual({ version: 2, open: { news: false, cost: true } });
	});
	it('ignores v1 panel flags entirely (old disabled panels never hide v2 sections)', () => {
		const v1Panels = JSON.stringify({ outdoors: false, cameras: false, housing: false });
		expect(parseSectionPrefs(v1Panels)).toEqual(emptySectionPrefs());
	});
});

describe('serializeSectionPrefs', () => {
	it('is idempotent: parse(serialize(p)) round-trips and re-serializes byte-identically', () => {
		const samples: SectionPrefs[] = [
			emptySectionPrefs(),
			{ version: 2, open: { strava: true, news: false } },
			{ version: 2, open: { cost: false, 'getting-around': true, outdoors: true } }
		];
		for (const p of samples) {
			const once = serializeSectionPrefs(p);
			expect(parseSectionPrefs(once)).toEqual(p);
			expect(serializeSectionPrefs(parseSectionPrefs(once))).toBe(once);
		}
	});
	it('writes keys in SECTION_IDS order regardless of insertion order', () => {
		expect(serializeSectionPrefs({ version: 2, open: { strava: true, news: false } })).toBe(
			'{"version":2,"open":{"news":false,"strava":true}}'
		);
	});
});

describe('defaults and precedence', () => {
	it('phone (< 768px) starts every section closed', () => {
		expect(isPhoneViewport(767)).toBe(true);
		expect(isPhoneViewport(768)).toBe(false);
		for (const id of SECTION_IDS) expect(defaultSectionOpen(id, PHONE)).toBe(false);
	});
	it('desktop starts every section open except Strava', () => {
		for (const id of SECTION_IDS) expect(defaultSectionOpen(id, DESKTOP)).toBe(id !== 'strava');
	});
	it('hash target > explicit saved choice > viewport default', () => {
		const savedClosed = withSectionOpen(emptySectionPrefs(), 'news', false);
		expect(
			resolveSectionOpen('news', { hashTarget: 'news', prefs: savedClosed, viewportWidth: DESKTOP })
		).toBe(true);
		expect(
			resolveSectionOpen('news', { hashTarget: null, prefs: savedClosed, viewportWidth: DESKTOP })
		).toBe(false);
		expect(
			resolveSectionOpen('news', {
				hashTarget: null,
				prefs: emptySectionPrefs(),
				viewportWidth: DESKTOP
			})
		).toBe(true);
		const savedOpen = withSectionOpen(emptySectionPrefs(), 'cost', true);
		expect(
			resolveSectionOpen('cost', { hashTarget: null, prefs: savedOpen, viewportWidth: PHONE })
		).toBe(true);
		expect(
			resolveSectionOpen('strava', {
				hashTarget: 'news',
				prefs: emptySectionPrefs(),
				viewportWidth: DESKTOP
			})
		).toBe(false);
	});
	it('withSectionOpen does not mutate its input', () => {
		const before = emptySectionPrefs();
		withSectionOpen(before, 'news', false);
		expect(before).toEqual(emptySectionPrefs());
	});
});

describe('sectionFromHash', () => {
	it('maps stable fragments to sections and rejects everything else', () => {
		expect(sectionFromHash('#news')).toBe('news');
		expect(sectionFromHash('#cost')).toBe('cost');
		expect(sectionFromHash('#strava')).toBe('strava');
		expect(sectionFromHash('#getting-around')).toBe('getting-around');
		expect(sectionFromHash('')).toBeNull();
		expect(sectionFromHash('#')).toBeNull();
		expect(sectionFromHash('#NEWS')).toBeNull();
		expect(sectionFromHash('#map')).toBeNull();
	});
});

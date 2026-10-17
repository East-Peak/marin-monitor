import { describe, expect, it } from 'vitest';
import {
	SECTION_IDS,
	withLayerOn,
	defaultSectionOpen,
	emptySectionPrefs,
	isDesktopViewport,
	isPhoneViewport,
	parseSectionPrefs,
	resolveSectionOpen,
	sectionFromHash,
	serializeSectionPrefs,
	withSectionOpen,
	type SectionPrefs
} from './section-prefs';

const DESKTOP = 1440;
const TABLET = 900;
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
		expect(parseSectionPrefs(raw)).toEqual({
			version: 3,
			open: { news: false, cost: true },
			layers: {}
		});
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
			{ version: 3, open: { strava: true, news: false }, layers: {} },
			{ version: 3, open: { cost: false, 'getting-around': true, outdoors: true }, layers: {} },
			{ version: 3, open: {}, layers: { traffic: false, ev: true, satire: true } }
		];
		for (const p of samples) {
			const once = serializeSectionPrefs(p);
			expect(parseSectionPrefs(once)).toEqual(p);
			expect(serializeSectionPrefs(parseSectionPrefs(once))).toBe(once);
		}
	});
	it('writes keys in SECTION_IDS order regardless of insertion order', () => {
		expect(
			serializeSectionPrefs({ version: 3, open: { strava: true, news: false }, layers: {} })
		).toBe('{"version":3,"open":{"news":false,"strava":true},"layers":{}}');
	});
});

describe('map layer choices (MAPX2b, version 3)', () => {
	it('migrates stored version 2 prefs: section choices kept, no layer choices yet', () => {
		expect(parseSectionPrefs('{"version":2,"open":{"news":false}}')).toEqual({
			version: 3,
			open: { news: false },
			layers: {}
		});
	});
	it('keeps known layer choices and drops unknown ids and non-booleans one by one', () => {
		const raw = JSON.stringify({
			version: 3,
			open: {},
			layers: { traffic: false, coffee: true, airports: true, gas: 'no' }
		});
		expect(parseSectionPrefs(raw).layers).toEqual({ traffic: false, coffee: true });
	});
	it('a version 3 value with a malformed layers field keeps its section choices', () => {
		expect(parseSectionPrefs('{"version":3,"open":{"cost":true},"layers":[]}')).toEqual({
			version: 3,
			open: { cost: true },
			layers: {}
		});
	});
	it('withLayerOn records one explicit choice', () => {
		expect(withLayerOn(emptySectionPrefs(), 'ev', true).layers).toEqual({ ev: true });
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
	it('hash target > explicit saved choice > viewport default (phone and tablet)', () => {
		const savedClosed = withSectionOpen(emptySectionPrefs(), 'news', false);
		expect(
			resolveSectionOpen('news', { hashTarget: 'news', prefs: savedClosed, viewportWidth: TABLET })
		).toBe(true);
		expect(
			resolveSectionOpen('news', { hashTarget: null, prefs: savedClosed, viewportWidth: TABLET })
		).toBe(false);
		expect(
			resolveSectionOpen('news', {
				hashTarget: null,
				prefs: emptySectionPrefs(),
				viewportWidth: TABLET
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
	it('desktop (≥1024) opens every non-Strava section even when the user saved it closed', () => {
		expect(isDesktopViewport(1023)).toBe(false);
		expect(isDesktopViewport(1024)).toBe(true);
		const prefs = withSectionOpen(emptySectionPrefs(), 'news', false);
		const at = (viewportWidth: number) =>
			resolveSectionOpen('news', { hashTarget: null, prefs, viewportWidth });
		expect(at(DESKTOP)).toBe(true);
		expect(at(PHONE)).toBe(false);
		expect(at(TABLET)).toBe(false);
		expect(
			resolveSectionOpen('strava', {
				hashTarget: null,
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

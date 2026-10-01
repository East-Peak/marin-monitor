import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STRAVA_ENABLED } from './strava';
import { TV_SCREENS, tvScreens } from './tv';
import { DEFAULT_PANEL_ORDER, defaultPanelOrder, listedPanels } from './panels';
import { V2_SECTIONS, v2Sections } from '$lib/dashboard/v2-sections';

// Strava is mothballed (2026-10-01): scrapers, scripts, data and docs stay in
// the repo, and one switch takes every surface off the site. Each surface is
// pinned both ways, so turning the switch back on restores what was there.

describe('the Strava switch', () => {
	it('is off', () => {
		expect(STRAVA_ENABLED).toBe(false);
	});
});

describe('TV rotation', () => {
	it('skips the leaderboards screen when Strava is off, leaving no gap', () => {
		const ids = tvScreens(false).map((s) => s.id);
		expect(ids).not.toContain('leaderboards');
		expect(ids).toEqual(
			tvScreens(true)
				.map((s) => s.id)
				.filter((id) => id !== 'leaderboards')
		);
	});

	it('keeps the leaderboards screen between Community and Conditions when Strava is on', () => {
		const ids = tvScreens(true).map((s) => s.id);
		expect(ids.slice(ids.indexOf('community'), ids.indexOf('community') + 3)).toEqual([
			'community',
			'leaderboards',
			'conditions'
		]);
	});

	it('follows the switch', () => {
		expect(TV_SCREENS).toEqual(tvScreens(STRAVA_ENABLED));
	});
});

describe('panel registry', () => {
	it('drops the leaderboards panel when Strava is off', () => {
		expect(defaultPanelOrder(false)).not.toContain('leaderboards');
		expect(defaultPanelOrder(false)).toEqual(
			defaultPanelOrder(true).filter((id) => id !== 'leaderboards')
		);
	});

	it('keeps it after cycling when Strava is on', () => {
		const order = defaultPanelOrder(true);
		expect(order[order.indexOf('cycling') + 1]).toBe('leaderboards');
	});

	it('follows the switch', () => {
		expect(DEFAULT_PANEL_ORDER).toEqual(defaultPanelOrder(STRAVA_ENABLED));
	});
});

describe('dashboard v2 sections', () => {
	it('has no Strava section when Strava is off', () => {
		expect(v2Sections(false).map((s) => s.id)).toEqual(['outdoors', 'news', 'cost', 'events']);
	});

	it('ends with the Strava section when Strava is on', () => {
		expect(v2Sections(true).at(-1)).toEqual({ id: 'strava', title: 'Strava' });
	});

	it('follows the switch', () => {
		expect(V2_SECTIONS).toEqual(v2Sections(STRAVA_ENABLED));
	});
});

describe('vercel.json crons', () => {
	const STRAVA_CRONS = ['/api/cron/sync-strava-segments', '/api/cron/sync-strava-leaderboards'];
	const paths = (
		JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons: { path: string }[] }
	).crons.map((c) => c.path);

	it('schedule the Strava syncs only while Strava is on', () => {
		for (const path of STRAVA_CRONS) expect(paths.includes(path)).toBe(STRAVA_ENABLED);
	});
});

describe('settings panel list', () => {
	it('lists the leaderboards panel only while Strava is on', () => {
		expect(listedPanels(false).map(([id]) => id)).not.toContain('leaderboards');
		expect(listedPanels(true).map(([id]) => id)).toContain('leaderboards');
		expect(listedPanels(false)).toHaveLength(listedPanels(true).length - 1);
	});
});

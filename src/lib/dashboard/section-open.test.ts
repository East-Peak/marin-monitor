import { describe, expect, it, vi } from 'vitest';
import { get, writable } from 'svelte/store';
import {
	emptySectionPrefs,
	withSectionOpen,
	type SectionId,
	type SectionPrefs
} from './section-prefs';
import { createSectionOpenState } from './section-open';

function prefsStore(initial: SectionPrefs = emptySectionPrefs()) {
	const store = writable(initial);
	const setOpen = vi.fn((id: SectionId, open: boolean) =>
		store.update((p) => withSectionOpen(p, id, open))
	);
	return { subscribe: store.subscribe, setOpen, set: store.set };
}
const openIds = (map: Record<string, boolean>) => Object.keys(map).filter((k) => map[k]);

describe('createSectionOpenState', () => {
	it('everything is closed until the viewport is known (SSR and first render agree)', () => {
		const s = createSectionOpenState(prefsStore());
		expect(openIds(get(s.open))).toEqual([]);
	});
	it('desktop opens all but Strava; phone opens none', () => {
		const desk = createSectionOpenState(prefsStore());
		desk.resolve('', 1440);
		expect(openIds(get(desk.open))).toEqual([
			'getting-around',
			'outdoors',
			'news',
			'cost',
			'events'
		]);
		const phone = createSectionOpenState(prefsStore());
		phone.resolve('', 390);
		expect(openIds(get(phone.open))).toEqual([]);
	});
	it('a hash target opens, beats a saved "closed", and is never saved', () => {
		const prefs = prefsStore(withSectionOpen(emptySectionPrefs(), 'news', false));
		const s = createSectionOpenState(prefs);
		s.resolve('#news', 1440);
		expect(get(s.open).news).toBe(true);
		expect(prefs.setOpen).not.toHaveBeenCalled();
	});
	it('nav opens are transient too', () => {
		const prefs = prefsStore();
		const s = createSectionOpenState(prefs);
		s.resolve('', 390);
		s.openTransient('cost');
		expect(get(s.open).cost).toBe(true);
		expect(prefs.setOpen).not.toHaveBeenCalled();
	});
	it('a toggle saves an explicit choice and wins over a transient open', () => {
		const prefs = prefsStore();
		const s = createSectionOpenState(prefs);
		s.resolve('#strava', 1440);
		s.toggle('strava');
		expect(prefs.setOpen).toHaveBeenCalledWith('strava', false);
		expect(get(s.open).strava).toBe(false);
		s.toggle('news');
		expect(prefs.setOpen).toHaveBeenLastCalledWith('news', false);
	});
	it('Reset sections also ends transient opens (nav-open → reset → phone default closed)', () => {
		const prefs = prefsStore();
		const s = createSectionOpenState(prefs);
		s.resolve('#news', 390);
		s.openTransient('cost');
		prefs.set(emptySectionPrefs());
		s.clearTransient();
		expect(openIds(get(s.open))).toEqual([]);
	});
	it('transient opens last for the page view: a later hash opens its section and keeps the earlier one', () => {
		const s = createSectionOpenState(prefsStore());
		s.resolve('#news', 390);
		s.openTransient('cost'); // hashchange to #cost
		s.openTransient('news'); // back to #news: idempotent
		expect(openIds(get(s.open))).toEqual(['news', 'cost']);
	});
	it('Reset sections (prefs emptied) returns to the viewport defaults', () => {
		const prefs = prefsStore();
		const s = createSectionOpenState(prefs);
		s.resolve('', 1440);
		s.toggle('news');
		prefs.set(emptySectionPrefs());
		expect(get(s.open).news).toBe(true);
	});

	it('Reset sections uses the current viewport, not the one at load (Codex PR 7 #4)', () => {
		const prefs = prefsStore();
		const s = createSectionOpenState(prefs);
		s.resolve('', 1440); // loaded on desktop
		prefs.set(emptySectionPrefs());
		s.clearTransient(390); // reset after resizing to a phone
		expect(openIds(get(s.open))).toEqual([]);
		s.clearTransient(1440);
		expect(openIds(get(s.open))).toEqual(['getting-around', 'outdoors', 'news', 'cost', 'events']);
	});
});

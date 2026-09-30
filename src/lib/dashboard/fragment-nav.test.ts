import { beforeEach, describe, expect, it } from 'vitest';
import { JUMP_TARGETS, openAndFocus } from './fragment-nav';

beforeEach(() => {
	document.body.innerHTML = `
		<div id="top" tabindex="-1"></div>
		<section id="map" tabindex="-1"></section>
		<section id="news" tabindex="-1"><h2><button data-section-toggle="news" aria-expanded="false">News</button></h2></section>
		<div id="sections" tabindex="-1"></div>`;
});

describe('openAndFocus (spec §8)', () => {
	it('opens a collapsed section BEFORE focusing its toggle', async () => {
		const toggle = document.querySelector<HTMLElement>('[data-section-toggle="news"]')!;
		const expandedAtFocus: (string | null)[] = [];
		toggle.addEventListener('focus', () =>
			expandedAtFocus.push(toggle.getAttribute('aria-expanded'))
		);
		const opened: string[] = [];
		const found = await openAndFocus('#news', (id) => {
			opened.push(id);
			toggle.setAttribute('aria-expanded', 'true');
		});
		expect(found).toBe(true);
		expect(opened).toEqual(['news']);
		expect(document.activeElement).toBe(toggle);
		expect(expandedAtFocus).toEqual(['true']);
	});
	it('focuses plain regions without opening anything', async () => {
		const opened: string[] = [];
		expect(await openAndFocus('#map', (id) => opened.push(id))).toBe(true);
		expect(document.activeElement?.id).toBe('map');
		expect(opened).toEqual([]);
	});
	it('ignores empty and unknown hashes', async () => {
		expect(await openAndFocus('', () => {})).toBe(false);
		expect(await openAndFocus('#nope', () => {})).toBe(false);
	});
	it('the jump targets are Top · Map · News · Sections', () => {
		expect(JUMP_TARGETS.map((t) => t.label)).toEqual(['Top', 'Map', 'News', 'Sections']);
	});
});

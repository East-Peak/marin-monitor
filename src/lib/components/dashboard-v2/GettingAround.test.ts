import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { LINKS, type GettingAroundView, type Part } from '$lib/dashboard/getting-around';
import GettingAround from './GettingAround.svelte';

const part = (over: Partial<Part> = {}): Part => ({
	lines: [],
	rows: [],
	more: 0,
	note: null,
	meta: null,
	scope: null,
	state: null,
	...over
});
const SCOPE =
	'Marin roads; 101, 19th Ave, 280 and 380 to SFO; 580, 80 and 880 to OAK. Long-term construction not shown.';
const VIEW: GettingAroundView = {
	airports: part({
		lines: [
			{ id: 'SFO', label: 'SFO', text: 'Ground delay, avg 45 min', state: 'ok', url: null },
			{ id: 'OAK', label: 'OAK', text: 'FAA status unavailable', state: 'unavailable', url: null }
		],
		meta: 'FAA · checked 3 min ago'
	}),
	roads: part({ note: 'Traffic incidents unavailable', scope: SCOPE, state: 'unavailable' }),
	transit: part({
		lines: [
			{
				id: 'GG',
				label: 'Golden Gate Transit',
				text: 'See goldengate.org',
				state: 'reference',
				url: 'https://www.goldengate.org/service-alerts/'
			},
			{ id: 'MA', label: 'Marin Transit', text: '4 alerts listed', state: 'ok', url: null }
		],
		rows: [
			{
				id: 'r1',
				title: 'Route 35 detour',
				url: 'https://marintransit.gov/35',
				meta: 'Marin Transit'
			},
			{ id: 'r2', title: 'Stop moved', url: null, meta: 'Marin Transit' }
		],
		more: 2,
		meta: '511 · updated 2 min ago'
	}),
	status: { state: 'partial', failing: [], asOf: null }
};
const show = (view = VIEW, onopen = () => {}) =>
	render(GettingAround, { props: { view, onopen } }).container;

describe('GettingAround', () => {
	it('mounting is opening: it asks for its details once', () => {
		const onopen = vi.fn();
		show(VIEW, onopen);
		expect(onopen).toHaveBeenCalledTimes(1);
	});

	it('airports, then roads, then transit, each line with its own words and state', () => {
		const c = show();
		expect([...c.querySelectorAll('[data-ga]')].map((p) => p.getAttribute('data-ga'))).toEqual([
			'airports',
			'roads',
			'transit'
		]);
		const oak = c.querySelector('[data-line="OAK"]')!;
		expect([oak.textContent, oak.getAttribute('data-state')]).toEqual([
			'OAK · FAA status unavailable',
			'unavailable'
		]);
		expect(c.querySelector('[data-ga="roads"] [data-ga-note]')!.textContent).toBe(
			'Traffic incidents unavailable'
		);
		// What the roads part covers is on screen (Codex r1 #6); the other parts carry no scope line.
		expect(c.querySelector('[data-ga="roads"] [data-ga-scope]')!.textContent).toBe(SCOPE);
		expect(c.querySelectorAll('[data-ga-scope]')).toHaveLength(1);
		expect(c.querySelector('[data-ga="roads"]')!.getAttribute('data-part-state')).toBe(
			'unavailable'
		);
		// A linked agency's line makes no claim; it opens the agency's page (Decision 6).
		const gg = c.querySelector('[data-line="GG"]')!;
		expect(gg.textContent).toBe('Golden Gate Transit · See goldengate.org ↗');
		expect([
			gg.querySelector('a')!.getAttribute('href'),
			gg.querySelector('a')!.getAttribute('target')
		]).toEqual(['https://www.goldengate.org/service-alerts/', '_blank']);
		expect(c.querySelector('[data-line="MA"] a')).toBeNull();
	});

	it("a row links only to the item's own page, in a new tab; without one it is plain text", () => {
		const c = show();
		const linked = c.querySelector('[data-row="r1"] a')!;
		expect([
			linked.getAttribute('href'),
			linked.getAttribute('target'),
			linked.getAttribute('rel')
		]).toEqual(['https://marintransit.gov/35', '_blank', 'noopener noreferrer']);
		expect(c.querySelector('[data-row="r2"] a')).toBeNull();
		expect(c.querySelector('[data-row="r2"]')!.textContent).toContain('Stop moved');
	});

	it('each part ends with its source time and one bounded way to see more', () => {
		const c = show();
		const foot = (k: string) => c.querySelector(`[data-ga="${k}"] [data-ga-foot]`)!;
		expect(foot('transit').textContent).toBe(
			'511 · updated 2 min ago · 2 more · All transit alerts (511) ↗'
		);
		expect(foot('roads').textContent).toBe('Traffic map (511) ↗'); // never "live": the spec bans it unless an observation time justifies it
		expect(foot('airports').textContent).toBe('FAA · checked 3 min ago · FAA status ↗');
		expect(
			['transit', 'roads', 'airports'].map((k) => foot(k).querySelector('a')!.getAttribute('href'))
		).toEqual([LINKS.transit, LINKS.traffic, LINKS.faa]);
	});

	it('every text node carries a type role (§13.4)', () => {
		const c = show();
		const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
		const bare: string[] = [];
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			if (n.textContent?.trim() && !n.parentElement?.closest('[data-text-role]'))
				bare.push(n.textContent);
		}
		expect(bare).toEqual([]);
	});
});

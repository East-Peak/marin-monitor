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
	link: null,
	scope: null,
	state: null,
	...over
});
const SCOPE =
	'Marin roads; 101, 19th Ave, 280 and 380 to SFO; 580, 80 and 880 to OAK. Long-term construction shown only when it closes a road.';
const VIEW: GettingAroundView = {
	airports: part({
		lines: [
			{
				id: 'SFO',
				label: 'SFO',
				text: 'Ground delay, avg 45 min',
				state: 'ok',
				url: null,
				links: []
			},
			{
				id: 'OAK',
				label: 'OAK',
				text: 'FAA status unavailable',
				state: 'unavailable',
				url: null,
				links: []
			}
		],
		meta: 'FAA · checked 3 min ago'
	}),
	roads: part({ note: 'Traffic incidents unavailable', scope: SCOPE, state: 'unavailable' }),
	transit: part({
		lines: [
			{
				id: 'no-511',
				label: 'Golden Gate Transit, Golden Gate Ferry, SMART',
				text: 'No alerts on 511; check the agencies',
				state: 'reference',
				url: null,
				links: [
					{ label: 'goldengate.org', url: 'https://www.goldengate.org/service-alerts/' },
					{ label: 'sonomamarintrain.org', url: 'https://www.sonomamarintrain.org/' }
				]
			},
			{
				id: 'AF',
				label: 'Angel Island Ferry',
				text: 'Alerts unavailable',
				state: 'unavailable',
				url: 'https://angelislandferry.com/',
				links: []
			}
		],
		rows: [
			{
				id: 'r1',
				title: 'Route 35 detour',
				url: 'https://marintransit.gov/35',
				meta: 'Marin Transit',
				tags: [],
				tone: null
			},
			{ id: 'r2', title: 'Stop moved', url: null, meta: 'Marin Transit', tags: [], tone: null }
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

	it('roads, then transit, then airports (design: road problems first), each line with its own words and state', () => {
		const c = show();
		expect([...c.querySelectorAll('[data-ga]')].map((p) => p.getAttribute('data-ga'))).toEqual([
			'roads',
			'transit',
			'airports'
		]);
		expect([...c.querySelectorAll('.ga-title')].map((t) => t.textContent)).toEqual([
			'Roads: Marin & the airport routes',
			'Transit',
			'Airports'
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
		// A failed agency read keeps its own line, linking to the agency's page.
		const af = c.querySelector('[data-line="AF"]')!;
		expect([af.textContent, af.getAttribute('data-state')]).toEqual([
			'Angel Island Ferry · Alerts unavailable ↗',
			'unavailable'
		]);
		expect(af.querySelector('a')!.getAttribute('href')).toBe('https://angelislandferry.com/');
	});

	it('no-511 line lists each agency link once, inline after its words', () => {
		const line = show().querySelector('[data-line="no-511"]')!;
		expect(line.textContent).toBe(
			'Golden Gate Transit, Golden Gate Ferry, SMART · No alerts on 511; check the agencies: goldengate.org ↗, sonomamarintrain.org ↗'
		);
		expect([...line.querySelectorAll('a')].map((a) => [a.getAttribute('href'), a.target])).toEqual([
			['https://www.goldengate.org/service-alerts/', '_blank'],
			['https://www.sonomamarintrain.org/', '_blank']
		]);
	});

	it('renders tag chip and data-tone: the dot only adds to the severity the meta says in words', () => {
		const c = show({
			...VIEW,
			roads: part({
				scope: SCOPE,
				state: 'ok',
				rows: [
					{
						id: 'e1',
						tags: ['Marin', 'to SFO'],
						title: 'US-101 Southbound between I-580 W and Tamalpais Dr',
						url: null,
						meta: 'Roadwork · some lanes closed · Major · reported 25 min ago',
						tone: 'major'
					},
					{ id: 'e2', tags: [], title: 'I-580', url: null, meta: 'Roadwork', tone: null }
				]
			})
		});
		const row = c.querySelector('[data-row="e1"]')!;
		expect(row.getAttribute('data-tone')).toBe('major');
		expect([...row.querySelectorAll('[data-ga-tag]')].map((t) => t.textContent)).toEqual([
			'Marin',
			'to SFO'
		]);
		expect(row.querySelector('[data-ga-dot]')!.getAttribute('aria-hidden')).toBe('true');
		expect(row.textContent).toContain('Major');
		const plain = c.querySelector('[data-row="e2"]')!;
		expect([
			plain.hasAttribute('data-tone'),
			plain.querySelector('[data-ga-tag], [data-ga-dot]')
		]).toEqual([false, null]);
		// Transit's meta (the alert's own words) is clamped to two lines; roads' isn't.
		expect(c.querySelectorAll('[data-ga="transit"] .ga-meta[data-clamp]')).toHaveLength(2);
		expect(c.querySelectorAll('[data-ga="roads"] [data-clamp]')).toHaveLength(0);
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

	it("a part's own link replaces its default: transit's hidden rows all Golden Gate's go to goldengate.org", () => {
		const { container } = render(GettingAround, {
			view: {
				...VIEW,
				transit: part({
					more: 1,
					meta: 'goldengate.org · checked 7:40 AM',
					link: {
						url: 'https://www.goldengate.org/alerts/',
						label: 'All Golden Gate alerts (goldengate.org)'
					}
				})
			},
			onopen: vi.fn()
		});
		const foot = container.querySelector('[data-ga="transit"] [data-ga-foot]')!;
		expect(foot.textContent).toBe(
			'goldengate.org · checked 7:40 AM · 1 more · All Golden Gate alerts (goldengate.org) ↗'
		);
		expect(foot.querySelector('a')!.getAttribute('href')).toBe(
			'https://www.goldengate.org/alerts/'
		);
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

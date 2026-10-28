import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { LINKS, type GettingAroundView, type Part, type Row } from '$lib/dashboard/getting-around';
import GettingAround from './GettingAround.svelte';

const part = (over: Partial<Part> = {}): Part => ({
	lines: [],
	rows: [],
	more: 0,
	note: null,
	noteMeta: [],
	meta: null,
	sources: {},
	link: null,
	scope: null,
	state: null,
	...over
});
const row = (over: Partial<Row> & Pick<Row, 'id' | 'body'>): Row => ({
	tags: [],
	label: 'Marin Transit',
	original: null,
	url: null,
	source: '511',
	meta: [],
	tone: null,
	full: null,
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
				links: [],
				source: null
			},
			{
				id: 'OAK',
				label: 'OAK',
				text: 'FAA status unavailable',
				state: 'unavailable',
				url: null,
				links: [],
				source: null
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
				text: 'No alerts on 511',
				state: 'reference',
				url: null,
				links: [
					{
						label: 'Golden Gate Transit, Golden Gate Ferry',
						url: 'https://www.goldengate.org/service-alerts/'
					},
					{ label: 'SMART', url: 'https://www.sonomamarintrain.org/' }
				],
				source: '511'
			},
			{
				id: 'AF',
				label: 'Angel Island Ferry',
				text: 'Alerts unavailable',
				state: 'unavailable',
				url: 'https://angelislandferry.com/',
				links: [],
				source: '511'
			}
		],
		rows: [
			row({
				id: 'r1',
				body: 'Route 35 detour',
				url: 'https://marintransit.gov/35',
				full: ['Route 35 detour', 'Route 35 detours via 4th St until Friday.']
			}),
			row({
				id: 'gg-1',
				label: 'Golden Gate',
				body: 'Manzanita Park & Ride may flood',
				original: 'ALERT MANZANITA PARK & RIDE MAY FLOOD',
				url: 'https://www.goldengate.org/alerts/#1',
				source: 'goldengate.org',
				tags: ['Route 114']
			})
		],
		more: 2,
		sources: {
			'511': '511 · updated 2 min ago',
			'goldengate.org': 'goldengate.org · checked 7:00 AM'
		}
	}),
	status: { state: 'partial', failing: [], asOf: null, entries: [] }
};
const show = (view = VIEW, onopen = () => {}) =>
	render(GettingAround, { props: { view, onopen } }).container;
const at = (c: HTMLElement, id: string) =>
	c.querySelector(`[data-row="${id}"], [data-line="${id}"]`)!;

describe('GettingAround', () => {
	it('mounting is opening: it asks for its details once', () => {
		const onopen = vi.fn();
		show(VIEW, onopen);
		expect(onopen).toHaveBeenCalledTimes(1);
	});

	it('roads, then transit, then airports, each a list of StatusRows, label above body', () => {
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
		const oak = at(c, 'OAK');
		expect(oak.getAttribute('data-state')).toBe('unavailable');
		expect(oak.querySelector('[data-kind]')!.getAttribute('data-kind')).toBe('static');
		expect(oak.querySelector('[data-text-role="label"]')!.textContent).toBe('OAK');
		expect(oak.querySelector('[data-text-role="body"]')!.textContent).toBe(
			'FAA status unavailable'
		);
		expect(oak.querySelector('.sr-attention')).not.toBeNull(); // the status colour, for status
		expect(c.querySelector('[data-ga="roads"] [data-ga-note]')!.textContent!.trim()).toBe(
			'Traffic incidents unavailable'
		);
		expect(c.querySelector('[data-ga="roads"] [data-ga-scope]')!.textContent).toBe(SCOPE);
		expect(c.querySelectorAll('[data-ga-scope]')).toHaveLength(1);
		expect(c.querySelector('[data-ga="roads"]')!.getAttribute('data-part-state')).toBe(
			'unavailable'
		);
	});

	it('a link row is one anchor to one page: the whole row, nothing interactive inside it', () => {
		const c = show();
		const af = at(c, 'AF');
		const a = af.querySelector('a[data-kind="link"]')!;
		expect([a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')]).toEqual([
			'https://angelislandferry.com/',
			'_blank',
			'noopener noreferrer'
		]);
		expect(af.querySelectorAll('a, button')).toHaveLength(1);
		expect(a.textContent!.replace(/\s+/g, ' ').trim()).toBe(
			'Angel Island Ferry Alerts unavailable 511'
		);
	});

	it('goldengate.org: chips in the label slot, sentence case on screen, the original in the title, its own source', () => {
		const gg = at(show(), 'gg-1');
		expect(gg.querySelector('[data-sr-chip]')!.textContent).toBe('Route 114');
		const body = gg.querySelector('[data-text-role="body"]')!;
		expect([body.textContent, body.getAttribute('title')]).toEqual([
			'Manzanita Park & Ride may flood',
			'ALERT MANZANITA PARK & RIDE MAY FLOOD'
		]);
		expect(gg.querySelector('.sr-meta')!.textContent).toBe('goldengate.org · checked 7:00 AM');
	});

	it('the quiet agencies share one detail row; its panel opens with a link to each agency', async () => {
		const c = show();
		const quiet = at(c, 'no-511');
		const button = quiet.querySelector('button[data-kind="detail"]')!;
		expect(button.getAttribute('aria-haspopup')).toBe('dialog');
		expect(quiet.querySelectorAll('a')).toHaveLength(0);
		await fireEvent.click(button);
		const dialog = screen.getByRole('dialog');
		expect(dialog.querySelector('h2')!.textContent).toBe(
			'Golden Gate Transit, Golden Gate Ferry, SMART'
		);
		expect([...dialog.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
			'https://www.goldengate.org/service-alerts/',
			'https://www.sonomamarintrain.org/'
		]);
	});

	it('a panel whose row leaves the list closes, and stays closed when the row comes back (Codex 1b #3)', async () => {
		const { rerender } = render(GettingAround, { props: { view: VIEW, onopen: () => {} } });
		await fireEvent.click(document.querySelector('[data-line="no-511"] button')!);
		expect(screen.queryByRole('dialog')).not.toBeNull();
		const quietless = { ...VIEW, transit: { ...VIEW.transit, lines: VIEW.transit.lines.slice(1) } };
		await rerender({ view: quietless, onopen: () => {} });
		expect(screen.queryByRole('dialog')).toBeNull();
		await rerender({ view: VIEW, onopen: () => {} });
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('a 511 alert row clamps its headline; its panel has the full words and the links', async () => {
		const c = show();
		const r1 = at(c, 'r1');
		expect(r1.querySelector('.sr-clamp')).not.toBeNull();
		expect(
			c.querySelectorAll('[data-ga="roads"] .sr-clamp, [data-kind="static"] .sr-clamp')
		).toHaveLength(0);
		await fireEvent.click(r1.querySelector('button')!);
		const dialog = screen.getByRole('dialog');
		expect(dialog.textContent).toContain('Route 35 detours via 4th St until Friday.');
		expect([...dialog.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
			'https://marintransit.gov/35',
			LINKS.transit
		]);
	});

	it('a road row: chips and the severity dot in the label slot, qualifications in meta', () => {
		const c = show({
			...VIEW,
			roads: part({
				scope: SCOPE,
				state: 'ok',
				rows: [
					row({
						id: 'e1',
						tags: ['Marin', 'to SFO'],
						label: 'US-101 SB between I-580 W and Tamalpais Dr',
						body: 'Roadwork',
						source: null,
						meta: [
							{ text: 'some lanes closed', attention: false },
							{ text: 'Major', attention: false }
						],
						tone: 'major'
					})
				]
			})
		});
		const e1 = at(c, 'e1');
		expect(e1.getAttribute('data-tone')).toBe('major');
		expect([...e1.querySelectorAll('[data-sr-chip]')].map((t) => t.textContent)).toEqual([
			'Marin',
			'to SFO'
		]);
		expect(e1.querySelector('[data-sr-dot]')!.getAttribute('aria-hidden')).toBe('true');
		expect(e1.querySelector('.sr-meta')!.textContent).toBe('some lanes closed · Major');
		expect(e1.querySelector('[data-kind]')!.getAttribute('data-kind')).toBe('static');
	});

	it('a one-source part gathers its time at the foot; mixed transit carries none there', () => {
		const c = show();
		const foot = (k: string) => c.querySelector(`[data-ga="${k}"] [data-ga-foot]`)!;
		expect(foot('transit').textContent).toBe('2 more · All transit alerts (511) ↗');
		expect(foot('roads').textContent).toBe('Traffic map (511) ↗');
		expect(foot('airports').textContent).toBe('FAA · checked 3 min ago' + 'FAA status ↗');
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

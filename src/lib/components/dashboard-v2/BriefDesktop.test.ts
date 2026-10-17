import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { BriefCard, BriefState } from '$lib/dashboard/brief-store';
import { HOURLY_STRIP_HOURS } from '$lib/dashboard/brief-desktop';
import {
	measuredLoading,
	measuredUnavailable,
	measuredValue,
	type Measured
} from '$lib/dashboard/measured';
import { surfView } from '$lib/dashboard/outdoors';
import type { MarineForecastRead } from '$lib/api/marin/marine';
import type { CardItem } from '$lib/dashboard/getting-around';
import BriefDesktop from './BriefDesktop.svelte';

const H = 3_600_000;
const MIN = 60_000;
const NOW = Date.parse('2026-10-17T15:20:00Z'); // 8:20 AM PDT
const HOUR = Date.parse('2026-10-17T15:00:00Z');
const MIDNIGHT = Date.parse('2026-10-17T07:00:00Z');

const card = <T>(over: Partial<BriefCard<T>>): BriefCard<T> => ({
	value: null,
	scope: null,
	observedAt: null,
	maxAgeMs: null,
	state: 'loading',
	detail: null,
	updatingFor: null,
	...over
});

function state(over: Partial<BriefState> = {}): BriefState {
	return {
		observed: card({
			value: {
				stationName: 'Gnoss Field (Novato)',
				observedAt: NOW - 5 * MIN,
				listNewestAt: NOW - 5 * MIN,
				tempF: 58,
				text: 'Clear'
			},
			scope: 'Gnoss Field (Novato)',
			observedAt: NOW - 5 * MIN,
			maxAgeMs: 90 * MIN,
			state: 'ok'
		}),
		forecast: card({
			value: {
				updatedAt: NOW - H,
				periods: Array.from({ length: 30 }, (_, i) => ({
					startMs: HOUR - 2 * H + i * H,
					endMs: HOUR - H + i * H,
					pop: i === 4 ? 30 : 0,
					temperatureF: 55 + i
				}))
			},
			scope: 'Central Marin forecast',
			observedAt: NOW - H,
			maxAgeMs: 6 * H,
			state: 'ok'
		}),
		tides: card({
			value: [
				{ atMs: Date.parse('2026-10-17T11:41:00Z'), heightFt: 0.4, type: 'L' },
				{ atMs: Date.parse('2026-10-17T18:03:00Z'), heightFt: 5.1, type: 'H' }
			],
			scope: 'Point Reyes',
			state: 'ok'
		}),
		history: card({
			value: Array.from({ length: 36 }, (_, i) => ({
				atMs: NOW - 12 * H + i * 20 * MIN,
				tempF: 50 + (i % 6)
			})),
			scope: 'Gnoss Field (Novato)',
			observedAt: NOW - 20 * MIN,
			state: 'ok'
		}),
		tideHourly: card({
			value: Array.from({ length: 30 }, (_, i) => ({
				atMs: MIDNIGHT + i * H,
				heightFt: 3 + 2 * Math.sin(i / 3)
			})),
			scope: 'Point Reyes',
			state: 'ok'
		}),
		...over
	};
}

const marine = (m: Measured<MarineForecastRead>) => ({ measured: m, view: surfView(m) });
const READ: MarineForecastRead = {
	checkedAt: NOW - 2 * MIN,
	points: Array.from({ length: 48 }, (_, i) => ({
		atMs: HOUR + i * H,
		waveFt: 4 + i / 10,
		periodS: 12,
		directionDeg: 250
	}))
};

function renderBrief(
	s: BriefState,
	ocean = marine(measuredValue(READ, 'Open-Meteo marine forecast', READ.checkedAt))
) {
	return render(BriefDesktop, { props: { brief: s, now: NOW, ocean, around: AROUND } });
}
const q = (sel: string) => document.querySelector(sel)!;
const AROUND: CardItem[] = [
	{ text: 'SFO no delays', state: 'ok' },
	{ text: 'OAK no delays', state: 'ok' },
	{ text: '3 incidents on Marin roads', state: 'ok' },
	{ text: 'Marin Transit: 511 lists no alerts', state: 'reference' }
];

describe('BriefDesktop (MAPX1)', () => {
	it('weather: hero temperature, station and time, and today’s rain chance', () => {
		renderBrief(state());
		const weather = q('[data-card="weather"]');
		expect(q('[data-card="weather"] [data-text-role="value"]').textContent).toBe('58°F');
		expect(weather.textContent).toContain('Observed at Gnoss Field (Novato) · 8:15 AM');
		expect(weather.textContent).toContain('Rain today: 30%');
	});

	it(`the hourly strip has ${HOURLY_STRIP_HOURS} periods from this hour, temperature and rain chance each`, () => {
		renderBrief(state());
		const hours = document.querySelectorAll('[data-strip="hourly"] li');
		expect(hours).toHaveLength(HOURLY_STRIP_HOURS);
		expect(hours[0].textContent).toContain('8 AM');
		expect(hours[0].textContent).toContain('57°');
		expect(hours[2].textContent).toContain('30%');
	});

	it('the 12-hour trace is drawn from the observations, labelled with its source', () => {
		renderBrief(state());
		expect(q('[data-chart="trace"] path[data-line]').getAttribute('d')).toMatch(/^M/);
		expect(q('[data-card="weather"]').textContent).toContain('Last 12 h at Gnoss Field (Novato)');
	});

	it('a failed history read says so; the hero and strip still show', () => {
		renderBrief(
			state({ history: card({ state: 'unavailable', detail: 'Temperature history unavailable' }) })
		);
		expect(document.querySelector('[data-chart="trace"]')).toBeNull();
		expect(q('[data-card="weather"]').textContent).toContain('Last 12 hours unavailable');
		expect(document.querySelectorAll('[data-strip="hourly"] li')).toHaveLength(HOURLY_STRIP_HOURS);
	});

	it('the tide curve passes through each of today’s hi/lo events, marked on it', () => {
		renderBrief(state());
		const d = q('[data-chart="tide"] path[data-line]').getAttribute('d')!;
		const marks = document.querySelectorAll('[data-chart="tide"] circle[data-event]');
		expect(marks).toHaveLength(2);
		// d3-path writes 3 decimals: each mark is a vertex the curve passes through.
		const at = (m: Element, k: string) => +Number(m.getAttribute(k)).toFixed(3);
		for (const m of marks) expect(d).toContain(`${at(m, 'cx')},${at(m, 'cy')}`);
		const tide = q('[data-card="tide"]');
		expect(tide.textContent).toContain('High 5.1 ft · 11:03 AM');
		expect(tide.textContent).toContain('NOAA prediction');
	});

	it('without NOAA hourly heights there is no curve (never our own), and the card says so', () => {
		renderBrief(state({ tideHourly: card({ state: 'unavailable' }) }));
		expect(document.querySelector('[data-chart="tide"]')).toBeNull();
		expect(q('[data-card="tide"]').textContent).toContain('Tide curve unavailable');
		expect(q('[data-card="tide"]').textContent).toContain('High 5.1 ft');
	});

	it('ocean: the marine forecast’s current hour, labelled a forecast', () => {
		renderBrief(state());
		const ocean = q('[data-card="ocean"]');
		expect(ocean.getAttribute('data-state')).toBe('ok');
		expect(ocean.textContent).toContain('4.0 ft @ 12 s');
		expect(ocean.textContent).toContain('Open-Meteo marine forecast');
	});

	it('missing marine data reads "unavailable", never blank; loading says loading', () => {
		const { unmount } = renderBrief(
			state(),
			marine(measuredUnavailable('Open-Meteo marine forecast', 'HTTP 503'))
		);
		const ocean = q('[data-card="ocean"]');
		expect(ocean.getAttribute('data-state')).toBe('unavailable');
		expect(ocean.textContent).toContain('Ocean forecast unavailable');
		expect(ocean.textContent).not.toMatch(/\b0(\.0)? ft\b/);
		unmount();
		renderBrief(state(), marine(measuredLoading('Open-Meteo marine forecast')));
		expect(q('[data-card="ocean"]').textContent).toContain('Loading ocean forecast…');
	});

	it('Getting around is a status card, not a link: each part with its state, the whole card a jump', async () => {
		const onjump = vi.fn();
		render(BriefDesktop, {
			props: {
				brief: state(),
				now: NOW,
				ocean: marine(measuredLoading('x')),
				around: AROUND,
				onjump
			}
		});
		const card = q('[data-card="getting-around"]');
		expect(card.tagName).toBe('A');
		expect(card.getAttribute('href')).toBe('#getting-around');
		expect([...card.querySelectorAll('li')].map((li) => li.getAttribute('data-state'))).toEqual([
			'ok',
			'ok',
			'ok',
			'reference'
		]);
		expect(card.textContent).toContain('SFO no delays');
		expect(card.textContent).toContain('3 incidents on Marin roads');
		expect(document.querySelector('[data-brief-link]')).toBeNull();
		await fireEvent.click(card);
		expect(onjump).toHaveBeenCalledWith('#getting-around');
	});
});

describe('BriefDesktop honesty (MAPX1, Codex #1, #3)', () => {
	it('never merges two stations: hourly heights for the old town draw no curve under the new one', () => {
		const s = state();
		renderBrief({ ...s, tides: { ...s.tides, scope: 'San Francisco' } });
		expect(document.querySelector('[data-chart="tide"]')).toBeNull();
		expect(q('[data-card="tide"]').textContent).toContain('Tide curve unavailable');
	});
	it('a retained trace or curve after a failed refresh says it is out of date', () => {
		const s = state();
		renderBrief({
			...s,
			history: { ...s.history, state: 'stale', detail: 'Temperature history unavailable' },
			tideHourly: {
				...s.tideHourly,
				state: 'stale',
				detail: "Couldn't load Point Reyes hourly tides"
			}
		});
		expect(q('[data-card="weather"]').textContent).toContain(
			'Last 12 h at Gnoss Field (Novato) · out of date'
		);
		expect(q('[data-card="tide"]').textContent).toContain('curve out of date');
	});
});

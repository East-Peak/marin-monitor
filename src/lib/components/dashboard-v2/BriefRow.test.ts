import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { writable } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import type { BriefCard, BriefState } from '$lib/dashboard/brief-store';
import type { CardItem } from '$lib/dashboard/getting-around';
import BriefRow from './BriefRow.svelte';

const NOW = Date.parse('2026-09-29T15:00:00Z'); // 8:00 AM PDT
const H = 3_600_000;
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
function periods(pops: (number | null)[]) {
	const start = Date.parse('2026-09-29T14:00:00Z');
	return pops.map((pop, i) => ({
		startMs: start + i * H,
		endMs: start + (i + 1) * H,
		pop,
		temperatureF: null
	}));
}
function state(over: Partial<BriefState> = {}): BriefState {
	return {
		history: card({}),
		tideHourly: card({}),
		observed: card({
			value: {
				stationName: 'Gnoss Field (Novato)',
				observedAt: Date.parse('2026-09-29T14:55:00Z'),
				listNewestAt: Date.parse('2026-09-29T14:55:00Z'),
				tempF: 60,
				text: 'Clear'
			},
			scope: 'Gnoss Field (Novato)',
			observedAt: Date.parse('2026-09-29T14:55:00Z'),
			maxAgeMs: 90 * 60_000,
			state: 'ok'
		}),
		forecast: card({
			value: {
				updatedAt: Date.parse('2026-09-29T14:30:00Z'),
				periods: periods(Array.from({ length: 24 }, (_, i) => (i === 5 ? 40 : 10)))
			},
			scope: 'Central Marin forecast',
			observedAt: Date.parse('2026-09-29T14:30:00Z'),
			maxAgeMs: 6 * H,
			state: 'ok'
		}),
		tides: card({
			value: [
				{ atMs: Date.parse('2026-09-29T19:41:00Z'), heightFt: 6.287, type: 'H' },
				{ atMs: Date.parse('2026-09-30T02:48:00Z'), heightFt: -0.202, type: 'L' }
			],
			scope: 'Point Reyes',
			state: 'ok'
		}),
		...over
	};
}

function renderRow(
	s: BriefState,
	now = NOW,
	onjump?: (hash: string) => void,
	around: CardItem[] = []
) {
	const brief = writable(s);
	const clock = writable(now);
	const result = render(BriefRow, { props: { brief, now: clock, around, onjump } });
	return { ...result, brief, clock };
}

describe('BriefRow', () => {
	it('weather: observed value with station and time; rain with scope and issue time', () => {
		renderRow(state());
		const weather = document.querySelector('[data-card="weather"]')!;
		expect(weather.textContent).toContain('60°F');
		expect(weather.textContent).toContain('Observed at Gnoss Field (Novato) · 7:55 AM');
		const rain = document.querySelector('[data-card="rain"]')!;
		expect(rain.textContent).toContain('Rain today: 40%');
		expect(rain.textContent).toContain('Central Marin forecast · issued 7:30 AM');
		expect(document.body.textContent).not.toMatch(/\bLIVE\b|just now/i);
	});
	it('a missing probability reads unknown, never 0%', () => {
		const s = state();
		s.forecast = {
			...s.forecast,
			value: {
				updatedAt: s.forecast.observedAt,
				periods: periods(Array.from({ length: 24 }, (_, i) => (i === 3 ? null : 0)))
			}
		};
		renderRow(s);
		expect(document.querySelector('[data-card="rain"]')!.textContent).toContain(
			'Rain chance unknown'
		);
		expect(document.querySelector('[data-card="rain"]')!.textContent).not.toContain('0%');
	});
	it('the observation turns stale by the clock alone', async () => {
		const { clock } = renderRow(state());
		expect(document.querySelector('[data-card="weather"]')!.getAttribute('data-state')).toBe('ok');
		clock.set(NOW + 2 * H);
		await tick();
		const weather = document.querySelector('[data-card="weather"]')!;
		expect(weather.getAttribute('data-state')).toBe('stale');
		expect(weather.textContent).toContain('out of date');
	});
	it('a retained forecast keeps its label, and says what is updating or what failed', async () => {
		const s = state();
		const { brief } = renderRow({ ...s, forecast: { ...s.forecast, updatingFor: 'Mill Valley' } });
		expect(document.querySelector('[data-card="rain"]')!.textContent).toContain(
			'Central Marin forecast'
		);
		expect(document.querySelector('[data-card="rain"]')!.textContent).toContain(
			'Updating for Mill Valley…'
		);
		brief.set({
			...s,
			forecast: { ...s.forecast, state: 'stale', detail: "Couldn't load the Mill Valley forecast" }
		});
		await tick();
		const rain = document.querySelector('[data-card="rain"]')!;
		expect(rain.textContent).toContain('Central Marin forecast');
		expect(rain.textContent).toContain("Couldn't load the Mill Valley forecast");
	});
	it('tide: the next tide with its named station, advancing with the clock', async () => {
		const { clock } = renderRow(state());
		const tide = () => document.querySelector('[data-card="tide"]')!.textContent;
		expect(tide()).toContain('High 6.3 ft · 12:41 PM');
		expect(tide()).toContain('Point Reyes · NOAA prediction');
		clock.set(Date.parse('2026-09-29T20:00:00Z'));
		await tick();
		expect(tide()).toContain('Low -0.2 ft · 7:48 PM');
	});
	it('no future tide in hand reads unavailable, not a past tide', async () => {
		renderRow(state(), Date.parse('2026-09-30T03:00:00Z'));
		expect(document.querySelector('[data-card="tide"]')!.textContent).toContain(
			'Tide predictions unavailable'
		);
	});
	it('loading reads as loading, never as a value or "unavailable"', () => {
		renderRow({
			observed: card({}),
			forecast: card({}),
			tides: card({}),
			history: card({}),
			tideHourly: card({})
		});
		expect(document.querySelector('[data-card="weather"]')!.getAttribute('data-state')).toBe(
			'loading'
		);
		expect(document.body.textContent).not.toMatch(/unavailable/);
	});
	it('answers only: no navigation card (decision 5a; the Cams strip sits directly below)', () => {
		renderRow(state());
		expect(document.querySelector('[data-card="getting-around"]')).toBeNull();
		expect(screen.queryByRole('link', { name: /Traffic cams/ })).toBeNull();
	});

	it('the Getting around line puts qualified items first, so its clip only ever hides plain ones (HARMONIZE1, Codex #2)', () => {
		renderRow(state(), NOW, undefined, [
			{ text: 'SFO no delays', state: 'ok' },
			{ text: 'Traffic out of date', state: 'stale' },
			{ text: 'Marin Transit: 511 lists no alerts', state: 'reference' },
			{ text: 'Airport status unavailable', state: 'unavailable' }
		]);
		const parts = document.querySelectorAll('[data-brief-link="getting-around"] [data-state]');
		expect([...parts].map((e) => e.textContent)).toEqual([
			'Traffic out of date',
			'Airport status unavailable',
			'SFO no delays',
			'Marin Transit: 511 lists no alerts'
		]);
	});
	it('the Getting around line: the status card items on one line, a link that opens its section (HARMONIZE1)', async () => {
		const onjump = vi.fn();
		renderRow(state(), NOW, onjump, [
			{ text: 'SFO no delays', state: 'ok' },
			{ text: '511 lists no incidents on Marin roads', state: 'ok' },
			{ text: 'Marin Transit: 511 lists no alerts', state: 'reference' }
		]);
		const link = screen.getByRole('link', { name: /^Getting around/ });
		expect(link.getAttribute('href')).toBe('#getting-around');
		expect(link.closest('[data-card]')).toBeNull();
		expect(link.textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Getting around SFO no delays · 511 lists no incidents on Marin roads · Marin Transit: 511 lists no alerts →'
		);
		expect(
			[...link.querySelectorAll('[data-state]')].map((e) => e.getAttribute('data-state'))
		).toEqual(['ok', 'ok', 'reference']);
		await fireEvent.click(link);
		expect(onjump).toHaveBeenCalledWith('#getting-around');
	});
});

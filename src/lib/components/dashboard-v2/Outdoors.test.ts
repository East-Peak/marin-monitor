import type { TempReport } from '$lib/api/marin/nws-observation';
import type { TideHeight } from '$lib/api/marin/tides';
import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { BriefCard, BriefState } from '$lib/dashboard/brief-store';
import { outdoorsView, type OutdoorsInput } from '$lib/dashboard/outdoors';
import type { HourlyForecast, ObservedNow, TideEvent } from '$lib/weather/brief';
import Outdoors from './Outdoors.svelte';

const H = 3_600_000;
const NOW = Date.parse('2026-10-15T15:20:00Z');
const HOUR0 = Date.parse('2026-10-15T15:00:00Z');

function card<T>(value: T | null, over: Partial<BriefCard<T>> = {}): BriefCard<T> {
	return {
		value,
		scope: null,
		observedAt: null,
		maxAgeMs: null,
		state: value === null ? 'unavailable' : 'ok',
		detail: value === null ? 'HTTP 503' : null,
		updatingFor: null,
		...over
	};
}

const forecast: HourlyForecast = {
	updatedAt: NOW - 30 * 60_000,
	periods: Array.from({ length: 48 }, (_, i) => ({
		startMs: HOUR0 + i * H,
		endMs: HOUR0 + (i + 1) * H,
		temperatureF: 55 + (i % 24),
		pop: 0
	}))
};
const tides: TideEvent[] = [
	{ atMs: HOUR0 - 2 * H, heightFt: 1.2, type: 'L' },
	{ atMs: HOUR0 + 4 * H, heightFt: 5.1, type: 'H' },
	{ atMs: HOUR0 + 10 * H, heightFt: 0.4, type: 'L' }
];
const brief: BriefState = {
	forecast: card(forecast, {
		scope: 'Central Marin forecast',
		observedAt: forecast.updatedAt,
		maxAgeMs: 6 * H
	}),
	observed: card<ObservedNow>(null),
	tides: card(tides, { scope: 'Point Reyes' }),
	history: card<TempReport[]>(null),
	tideHourly: card<TideHeight[]>(null)
};

function input(over: Partial<OutdoorsInput> = {}): OutdoorsInput {
	return {
		brief,
		marine: {
			points: [{ atMs: HOUR0, waveFt: 4.3, periodS: 12, directionDeg: 250 }],
			checkedAt: NOW - 60_000
		},
		fires: { fires: [], hidden: [], checkedAt: NOW - 60_000 },
		quakes: { quakes: [], observedAt: NOW - 120_000 },
		air: {
			reading: {
				aqi: 14,
				category: 'Good',
				color: '#00e400',
				pollutant: 'OZONE',
				area: 'San Rafael',
				observedAt: Date.parse('2026-10-15T14:00:00Z'),
				timestamp: NOW - 60_000
			},
			checkedAt: NOW - 60_000
		},
		outcomes: {
			'air-quality': { kind: 'live', observedAt: Date.parse('2026-10-15T14:00:00Z') },
			marine: { kind: 'live', observedAt: NOW - 60_000 },
			fires: { kind: 'live', observedAt: NOW - 60_000 },
			'quakes-week': { kind: 'live', observedAt: NOW - 120_000 }
		},
		now: NOW,
		...over
	};
}

describe('Outdoors', () => {
	it('every card names its source and time: once at the foot, or on each row of the three-source card', () => {
		const { container } = render(Outdoors, {
			view: outdoorsView(input()),
			now: NOW,
			onopen: vi.fn()
		});
		const cards = container.querySelectorAll('[data-card]');
		expect(cards.length).toBe(4);
		const footed = [...cards].filter((c) => c.getAttribute('data-card') !== 'ground');
		for (const c of footed) expect(c.querySelector('[data-card-source]')).not.toBeNull();
		const forecastSource = container.querySelector('[data-card="forecast"] [data-card-source]');
		expect(forecastSource?.textContent).toMatch(/NWS hourly forecast · issued 7:50 AM/);
		expect(container.querySelector('[data-card="surf"] [data-card-source]')?.textContent).toMatch(
			/Open-Meteo marine forecast · checked 8:19 AM/
		);
		expect(
			container.querySelector('[data-card="forecast"] svg path')?.getAttribute('d')
		).toBeTruthy();
		expect(container.textContent).toContain('No rain expected in the next 24 h (peak 0%)');
		expect(container.textContent).toContain('None near');
		expect(container.textContent).toContain('None in 7 days');
		const air = container.querySelector('[data-card="ground"] [data-row="air"]');
		expect(air?.textContent).toContain('14 · Good');
		expect(air?.textContent).toContain('OZONE · San Rafael');
		expect(air?.querySelector('.sr-meta')?.textContent).toBe(
			'OZONE · San Rafael · AirNow · as of 7:00 AM'
		);
		expect(container.querySelector('[data-row="wildfire"] .sr-meta')?.textContent).toMatch(
			/^CAL FIRE \+ NIFC · checked /
		);
		// No colour on a current reading's provenance (Stuart 2026-10-28), nor on an all-clear.
		expect(container.querySelector('[data-card="ground"] .sr-attention')).toBeNull();
	});

	it('the tide card keeps today’s single extremes line (rule 1’s named exception, Stuart 2026-10-28)', () => {
		const { container } = render(Outdoors, {
			view: outdoorsView(input()),
			now: NOW,
			onopen: vi.fn()
		});
		const line = container.querySelector('[data-card="tides"] [data-tide-line]')!;
		expect(line.getAttribute('data-text-role')).toBe('meta');
		expect(line.children).toHaveLength(0); // one line of text, no figure/time spans
		expect(line.textContent!.trim()).toMatch(
			/^(Hi|Lo) -?\d+\.\d′ \d{1,2}(:\d{2})? [AP]M( · (Hi|Lo) -?\d+\.\d′ \d{1,2}(:\d{2})? [AP]M)*$/
		);
	});

	it('a failed air read says unavailable with its reason, never an AQI', () => {
		const { container } = render(Outdoors, {
			view: outdoorsView(
				input({
					air: null,
					outcomes: {
						...input().outcomes,
						'air-quality': {
							kind: 'failed',
							error: 'AirNow failed: 502',
							retained: false,
							observedAt: null
						}
					}
				})
			),
			now: NOW,
			onopen: vi.fn()
		});
		const air = container.querySelector('[data-card="ground"] [data-row="air"]')!;
		expect(air.querySelector('[data-text-role="body"]')!.textContent).toBe('Unavailable');
		expect(air.querySelector('[data-attention]')).not.toBeNull(); // the status colour, for status
		// Why, in reader words (rule 7), and the row's own source (rule 3): never the diagnostic.
		expect(air.querySelector('.sr-meta')!.textContent).toBe(
			"we couldn't check this source · AirNow"
		);
		expect(air.textContent).not.toMatch(/\d+ · Good|AirNow failed/);
		expect(container.querySelector('[data-card="ground"] [data-card-source]')).toBeNull();
	});

	it('a failed read shows its reason in the source line and never a 0', () => {
		const { container } = render(Outdoors, {
			view: outdoorsView(
				input({
					quakes: null,
					fires: null,
					outcomes: {
						fires: {
							kind: 'failed',
							error: 'NIFC API failed: 503',
							retained: false,
							observedAt: null
						},
						'quakes-week': { kind: 'failed', error: 'HTTP 500', retained: false, observedAt: null }
					}
				})
			),
			now: NOW,
			onopen: vi.fn()
		});
		const ground = container.querySelector('[data-card="ground"]')!;
		expect(ground.querySelector('[data-row="quakes"]')?.textContent).toContain('Unknown');
		expect(ground.querySelector('[data-row="quakes"]')?.textContent).not.toMatch(/\b0\b/);
		expect(ground.querySelector('[data-row="wildfire"]')?.textContent).toContain('Unavailable');
		// Each row names its own source; no footer gathers three (rule 3).
		expect(ground.querySelector('[data-row="quakes"] .sr-meta')?.textContent).toContain(
			'USGS, within 100 km'
		);
		expect(ground.querySelector('[data-card-source]')).toBeNull();
	});

	it('a rain window with a missing hour never says "dry all day" (Codex desk2 #3)', () => {
		const periods = forecast.periods.map((p, i) => (i === 1 ? { ...p, pop: null } : p));
		const gappy: BriefState = {
			...brief,
			forecast: { ...brief.forecast, value: { ...forecast, periods } }
		};
		const { container } = render(Outdoors, {
			view: outdoorsView(input({ brief: gappy })),
			now: NOW,
			onopen: vi.fn()
		});
		expect(container.textContent).not.toContain('dry all day');
		expect(container.textContent).not.toContain('No rain expected');
	});

	it('a missing temperature breaks the line; the high marker sits at its own hour (Codex desk2 #4)', () => {
		const periods = forecast.periods.map((p, i) => (i === 3 ? { ...p, temperatureF: null } : p));
		const gappy: BriefState = {
			...brief,
			forecast: { ...brief.forecast, value: { ...forecast, periods } }
		};
		const { container } = render(Outdoors, {
			view: outdoorsView(input({ brief: gappy })),
			now: NOW,
			onopen: vi.fn()
		});
		const line = container.querySelector('[data-card="forecast"] [data-temp-line]')!;
		expect(line.getAttribute('d')!.match(/M/g)).toHaveLength(2);
	});

	it('a dry day draws no rain bars: 0% sits on a labelled baseline (RAIN1)', () => {
		// NWS for Novato, 6:45 pm 2026-10-17: 0 ×21, then 1, 1, 4.
		const pops = [...Array(21).fill(0), 1, 1, 4];
		const periods = forecast.periods.map((p, i) => ({ ...p, pop: pops[i] ?? 0 }));
		const dry: BriefState = {
			...brief,
			forecast: { ...brief.forecast, value: { ...forecast, periods } }
		};
		const { container } = render(Outdoors, {
			view: outdoorsView(input({ brief: dry })),
			now: NOW,
			onopen: vi.fn()
		});
		const chart = container.querySelector('[data-chart="rain"]')!;
		// Only the 4% hour draws: 1% is half a pixel at this height, and 0% is nothing.
		expect(chart.querySelectorAll('rect')).toHaveLength(1);
		expect(chart.querySelector('[data-baseline]')).not.toBeNull();
		const labels = [...chart.querySelectorAll('text')].map((t) => t.textContent);
		expect(labels).toEqual(expect.arrayContaining(['0%', '50%', '100%']));
		expect(container.querySelector('[data-rain-meta]')?.textContent).toBe('peak 4%');
	});

	it('an all-dry forecast says so in words, with its as-of, instead of bars (RAIN1)', () => {
		const { container } = render(Outdoors, {
			view: outdoorsView(input()),
			now: NOW,
			onopen: vi.fn()
		});
		const card = container.querySelector('[data-card="forecast"]')!;
		expect(card.textContent).toContain('Chance of rain, hourly');
		expect(card.querySelector('[data-chart="rain"]')).toBeNull();
		expect(card.querySelector('[data-rain-dry]')?.textContent).toMatch(
			/No rain expected in the next 24 h \(peak 0%\) · NWS, issued 7:50 AM/
		);
	});

	it('tide and surf charts give their scale in feet (RAIN1 chart rule)', () => {
		const marine = {
			points: [
				{ atMs: HOUR0, waveFt: 4.3, periodS: 12, directionDeg: 250 },
				{ atMs: HOUR0 + H, waveFt: 2.1, periodS: 12, directionDeg: 250 }
			],
			checkedAt: NOW - 60_000
		};
		const { container } = render(Outdoors, {
			view: outdoorsView(input({ marine })),
			now: NOW,
			onopen: vi.fn()
		});
		const tide = [...container.querySelectorAll('[data-card="tides"] svg text')].map(
			(t) => t.textContent
		);
		expect(tide.length).toBe(2);
		expect(container.querySelector('[data-card="tides"] svg')?.getAttribute('aria-label')).toMatch(
			/, -?\d+\.\d to -?\d+\.\d ft$/
		);
		for (const t of tide) expect(t).toMatch(/^-?\d+\.\d ft$/);
		expect(container.querySelector('[data-card="surf"]')?.textContent).toContain('2.1–4.3 ft');
	});

	it('mounting is opening: it asks its owner for the detail reads', () => {
		const onopen = vi.fn();
		render(Outdoors, { view: outdoorsView(input()), now: NOW, onopen });
		expect(onopen).toHaveBeenCalledTimes(1);
	});
});

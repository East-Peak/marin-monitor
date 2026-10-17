import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
	const data = new Map<string, string>();
	Object.defineProperty(globalThis, 'localStorage', {
		configurable: true,
		writable: true,
		value: {
			getItem: (k: string) => data.get(k) ?? null,
			setItem: (k: string, v: string) => void data.set(k, String(v)),
			removeItem: (k: string) => void data.delete(k),
			clear: () => data.clear()
		}
	});
});
vi.mock('$app/environment', () => ({ browser: true, dev: true, building: false, version: 'test' }));
// MapLibre needs WebGL, which jsdom lacks: the map is proven in the built app (Task 6).
vi.mock('./V2Map.svelte', async () => ({
	default: (await import('./__test__/MapStub.svelte')).default
}));
// jsdom has no IntersectionObserver, so every strip tile would be active: nothing may load.
vi.mock('$lib/dashboard/cam-frame-loader', () => ({
	loadFrame: vi.fn(() => new Promise(() => {})),
	releaseFrame: vi.fn()
}));
/** After vi.resetModules the stub must load against the fresh Svelte runtime, not the cached one. */
const remockMap = () =>
	vi.doMock('./V2Map.svelte', async () => ({
		default: (await import('./__test__/MapStub.svelte')).default
	}));
// These tests pin the mothballed state; v2Sections(true) pins the Strava section.
vi.mock('$lib/config/strava', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/config/strava')>()),
	STRAVA_ENABLED: false
}));

const { loadAllNews, loadStravaData } = vi.hoisted(() => ({
	loadAllNews: vi.fn(),
	loadStravaData: vi.fn()
}));
vi.mock('$lib/api/marin/load-all', () => ({ loadAllNews }));
vi.mock('$lib/stores/strava', () => ({ loadStravaData }));
const controller = vi.hoisted(() => ({
	seededEntries: (() => []) as (v: NewsSnapshotView) => unknown[],
	start: vi.fn(async () => {}),
	refresh: vi.fn(async () => {}),
	ensure: vi.fn(async () => {}),
	setLocation: vi.fn(),
	created: [] as AbortSignal[],
	EMPTY_BRIEF: Object.fromEntries(
		['forecast', 'observed', 'tides'].map((k) => [
			k,
			{
				value: null,
				scope: null,
				observedAt: null,
				maxAgeMs: null,
				state: 'loading',
				detail: null,
				updatingFor: null
			}
		])
	)
}));
/** jsdom's window is 1024 wide (desktop); a test that needs another width sets it first. */
const atWidth = (w: number) =>
	Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w });
// Earlier tests in this file render DashboardV2 too: reset every captured call per test (Codex r1 #11).
beforeEach(() => {
	atWidth(1024);
	controller.start.mockClear();
	controller.setLocation.mockClear();
	controller.refresh.mockClear();
	controller.ensure.mockClear();
	controller.created.length = 0;
});
vi.mock('$lib/dashboard/v2-controller', async () => ({
	V2_REFRESH_MS: 300_000,
	createDashboardV2Controller: ({
		signal,
		initialSnapshot
	}: {
		signal: AbortSignal;
		initialSnapshot?: NewsSnapshotView | null;
	}) => {
		controller.created.push(signal);
		// The real controller's seeded contract: the view, and its read ok as of generatedAt.
		const seeded = initialSnapshot ? controller.seededEntries(initialSnapshot) : null;
		return {
			start: controller.start,
			refresh: controller.refresh,
			ensure: controller.ensure,
			earthquakes: { subscribe: (fn: (v: unknown[]) => void) => (fn([]), () => {}) },
			sources: {
				subscribe: (fn: (v: unknown[]) => void) => (
					fn(
						seeded ?? [
							{
								id: 'part:snapshot',
								name: 'News snapshot',
								state: 'loading',
								observedAt: null,
								maxAgeMs: null,
								detail: null
							}
						]
					),
					() => {}
				)
			},
			snapshot: {
				subscribe: (fn: (v: unknown) => void) => (fn(initialSnapshot ?? null), () => {})
			},
			fixIt: { subscribe: (fn: (v: unknown) => void) => (fn(null), () => {}) },
			transit: {
				subscribe: (fn: (v: unknown) => void) => (fn({ reads: null, error: null }), () => {})
			},
			airport: { subscribe: (fn: (v: unknown) => void) => (fn(null), () => {}) },
			traffic: { subscribe: (fn: (v: unknown) => void) => (fn(null), () => {}) },
			brief: { subscribe: (fn: (v: unknown) => void) => (fn(controller.EMPTY_BRIEF), () => {}) },
			advisories: {
				subscribe: (fn: (v: unknown) => void) => (
					fn({
						advisories: [],
						unreadable: 0,
						lastAttemptAt: null,
						lastSuccessAt: null,
						lastError: null
					}),
					() => {}
				)
			},
			setLocation: controller.setLocation,
			healthReport: { subscribe: (fn: (v: unknown) => void) => (fn(null), () => {}) },
			datasetOutcomes: { subscribe: (fn: (v: unknown) => void) => (fn({}), () => {}) }
		};
	}
}));

import DashboardV2 from './DashboardV2.svelte';
import type { NewsSnapshotView } from '$lib/news/snapshot';
import { seededSnapshotEntries } from '$lib/dashboard/source-adapters';
import { snapshotView, story } from '$lib/dashboard/__fixtures__/snapshot-view';
controller.seededEntries = seededSnapshotEntries;

describe('DashboardV2 preview shell', () => {
	it('Getting Around shows its parts, not a placeholder, and asks for its details when open', async () => {
		const { container } = render(DashboardV2);
		await tick();
		const ga = container.querySelector('section#getting-around')!;
		expect(ga.textContent).not.toContain('later release');
		expect(ga.querySelector('[data-slot="getting-around"]')).toBeTruthy();
		expect(controller.ensure).toHaveBeenCalledWith('airport');
		expect(controller.ensure).toHaveBeenCalledWith('traffic');
	});

	it('fills the map region: the map and Latest reporting, loading honestly, no placeholder (PR 9)', async () => {
		const { container } = render(DashboardV2);
		await tick();
		const region = container.querySelector('section#map')!;
		expect(region.querySelector('[data-map-stub]')).toBeTruthy();
		expect(region.querySelector('[data-slot="latest-reporting"]')).toBeTruthy();
		expect(region.textContent).not.toContain('later release');
		expect(region.textContent).toContain('Loading…');
	});

	it('renders exactly one v2 root with the preview badge and a labelled town picker', async () => {
		const { container } = render(DashboardV2);
		await tick();
		expect(container.querySelectorAll('[data-layout]')).toHaveLength(1);
		const root = container.querySelector('[data-layout="v2"]');
		expect(root?.getAttribute('data-hydrated')).toBe('true');
		expect(screen.getByText('v2 preview')).toBeTruthy();
		expect(screen.getByText('Showing:')).toBeTruthy();
		expect(screen.getByRole('button', { name: /All of Marin/ })).toBeTruthy();
	});

	it('offers a way back to the current dashboard', () => {
		render(DashboardV2);
		expect(screen.getByRole('link', { name: 'Leave preview' }).getAttribute('href')).toBe('/');
	});

	it('never starts the legacy news or Strava loaders', async () => {
		render(DashboardV2);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(loadAllNews).not.toHaveBeenCalled();
		expect(loadStravaData).not.toHaveBeenCalled();
	});

	it('puts the ⚙ settings menu in the v2 header', () => {
		render(DashboardV2);
		expect(screen.getByRole('button', { name: 'Dashboard settings' })).toBeTruthy();
	});

	it('owns exactly one v2 controller: started on mount, aborted on destroy', async () => {
		const { unmount } = render(DashboardV2);
		await tick();
		expect(controller.created).toHaveLength(1);
		expect(controller.start).toHaveBeenCalledTimes(1);
		unmount();
		expect(controller.created[0].aborted).toBe(true);
	});

	it('renders the shell: map region, Getting Around under it, then four sections in order (tablet 900)', async () => {
		atWidth(900);
		const { container } = render(DashboardV2);
		await tick();
		expect(container.querySelector('section#map')).toBeTruthy();
		const order = [...container.querySelectorAll('[data-section]')].map((s) =>
			s.getAttribute('data-section')
		);
		expect(order).toEqual(['getting-around', 'outdoors', 'news', 'cost', 'events']);
		expect(container.querySelector('#sections [data-section="getting-around"]')).toBeNull();
		expect(screen.getByRole('navigation', { name: 'Jump to' })).toBeTruthy();
	});

	it('desktop (1440) follows the mockup: Cost, the Lately band, then News beside Events (Goal 4)', async () => {
		atWidth(1440);
		const now = Date.now();
		const recent = story(now, {
			sourceId: 'marin-lately',
			source: 'Marin Lately',
			category: 'satire',
			categories: ['satire'],
			verification: 'satire',
			hoursAgo: 24
		});
		const snapshot = snapshotView(now, [story(now), recent]);
		const order = (c: HTMLElement) =>
			[...c.querySelectorAll('#sections [data-section], #sections [data-slot="lately"]')].map(
				(el) => el.getAttribute('data-section') ?? el.getAttribute('data-slot')
			);
		const { container } = render(DashboardV2, { props: { snapshot, renderedAt: now } });
		await tick();
		expect(order(container)).toEqual(['cost', 'lately', 'news', 'events']);
		// With nothing recent the featured band is absent: no heading, no "quiet" text (DASH-FLIP1).
		const quiet = render(DashboardV2);
		await tick();
		expect(order(quiet.container)).toEqual(['cost', 'news', 'events']);
	});

	it('shows nothing of Strava while it is mothballed', async () => {
		const { container } = render(DashboardV2);
		await tick();
		expect(container.querySelector('[data-section="strava"]')).toBeNull();
		expect(container.textContent).not.toMatch(/strava|segment leaderboard/i);
	});

	it('tablet (900): every section toggle is a real disclosure button', async () => {
		atWidth(900);
		render(DashboardV2);
		await tick();
		for (const name of [
			'Getting Around',
			'Outdoors & Conditions',
			'News & Civic',
			'Cost & Character',
			'Events & Sports'
		]) {
			const button = screen.getByRole('button', { name: new RegExp(name) });
			expect(button.getAttribute('aria-expanded')).toMatch(/^(true|false)$/);
			expect(button.getAttribute('aria-controls')).toMatch(/^section-.+-body$/);
		}
	});

	it('desktop (1440): sections are always open, with headings and no disclosure buttons', async () => {
		atWidth(1440);
		const { container } = render(DashboardV2);
		await tick();
		expect(container.querySelectorAll('[data-section] [aria-expanded]')).toHaveLength(0);
		for (const name of [
			'Getting Around',
			'Outdoors & Conditions',
			'News & Civic',
			'Cost & Character',
			'Events & Sports'
		]) {
			expect(screen.getByRole('heading', { level: 2, name })).toBeTruthy();
		}
		expect(container.querySelectorAll('[data-section][data-open="false"]')).toHaveLength(0);
	});

	it('tells the controller where the brief is for: the current town preset, on mount', async () => {
		render(DashboardV2);
		await tick();
		expect(controller.setLocation).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'central-marin' })
		);
		expect(document.querySelector('[data-slot="brief"]')).toBeTruthy();
	});

	it('shows the source-health indicator in the header', async () => {
		render(DashboardV2);
		await tick();
		expect(screen.getByRole('button', { name: 'Checking sources…' })).toBeTruthy();
	});

	it('tablet (900): the Cams strip sits right after the brief and right before the map; no Getting Around card', async () => {
		atWidth(900);
		const { container } = render(DashboardV2);
		await tick();
		const main = container.querySelector('.v2-main')!;
		const order = [...main.children].map((el) => el.id || el.getAttribute('data-slot') || '');
		const cams = order.indexOf('cams');
		expect(cams).toBeGreaterThan(0);
		expect(order[cams - 1]).toBe('brief');
		expect(order[cams + 1]).toBe('map');
		expect(container.querySelector('[data-card="getting-around"]')).toBeNull();
	});

	it('desktop (1440): no strip; the cam wall sits right after the map', async () => {
		atWidth(1440);
		const { container } = render(DashboardV2);
		await tick();
		const main = container.querySelector('.v2-main')!;
		const order = [...main.children].map((el) => el.getAttribute('data-slot') || el.id || '');
		expect(container.querySelector('.cams-row')).toBeNull();
		expect(order[order.indexOf('map') + 1]).toBe('cam-wall');
		expect(order.indexOf('brief') + 1).toBe(order.indexOf('map'));
	});
});

describe('DashboardV2 town display across hydration', () => {
	/** The markup of the first client render, before any effect (onMount) runs — what hydration adopts. */
	async function firstRenderHtml(storedTown: string | null): Promise<string> {
		localStorage.clear();
		if (storedTown) localStorage.setItem('mm_town', storedTown);
		vi.resetModules();
		remockMap();
		const [{ mount, unmount }, { default: Component }] = await Promise.all([
			import('svelte'),
			import('./DashboardV2.svelte')
		]);
		const target = document.body.appendChild(document.createElement('div'));
		const app = mount(Component, { target });
		const html = target.querySelector('.picker-trigger')!.outerHTML;
		await unmount(app);
		target.remove();
		return html;
	}

	it('first renders the server markup ("All of Marin") even with a saved town, then shows it after mount', async () => {
		// SSR never reads storage, so the server always renders the no-town picker.
		const server = await firstRenderHtml(null);
		expect(server).toContain('All of Marin');
		expect(await firstRenderHtml('mill-valley')).toBe(server);

		localStorage.setItem('mm_town', 'mill-valley');
		vi.resetModules();
		remockMap();
		const [{ flushSync }, { render: renderFresh }, { default: Fresh }] = await Promise.all([
			import('svelte'),
			import('@testing-library/svelte'),
			import('./DashboardV2.svelte')
		]);
		const { container } = renderFresh(Fresh);
		flushSync();
		expect(container.querySelector('.picker-label')?.textContent).toBe('Mill Valley');
		localStorage.clear();
	});
});

describe('server-rendered first paint (DASH-FLIP1)', () => {
	const R = Date.parse('2026-10-17T18:00:00Z');
	const DAY = 86_400_000;
	afterEach(() => vi.useRealTimers());

	it('Latest reporting renders from the server snapshot, county-wide', async () => {
		const view = snapshotView(
			R,
			[1, 2, 3].map((h) => story(R, { hoursAgo: h }))
		);
		const { container } = render(DashboardV2, { props: { snapshot: view, renderedAt: R } });
		await tick();
		expect(container.querySelectorAll('[data-reporting-row]')).toHaveLength(3);
	});

	it('one clock: Lately 30 days minus 1 minute old at renderedAt is shown though the browser is 3 min later; the first tick moves to real time', async () => {
		vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
		vi.setSystemTime(R + 3 * 60_000);
		const lately = story(R, {
			sourceId: 'marin-lately',
			source: 'Marin Lately',
			category: 'satire',
			categories: ['satire'],
			verification: 'satire',
			title: 'Edge Satire',
			hoursAgo: (30 * DAY - 60_000) / 3_600_000
		});
		const view = snapshotView(
			R,
			[story(R), lately],
			[{}, { id: 'marin-lately', name: 'Marin Lately', category: 'satire', verification: 'satire' }]
		);
		const { container } = render(DashboardV2, { props: { snapshot: view, renderedAt: R } });
		await tick();
		expect(container.querySelector('[data-slot="lately"]')?.textContent).toContain('Edge Satire');
		vi.advanceTimersByTime(30_000);
		await tick();
		expect(container.querySelector('[data-slot="lately"]')).toBeNull();
	});
});

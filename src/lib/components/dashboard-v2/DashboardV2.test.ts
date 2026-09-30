import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const { loadAllNews, loadStravaData } = vi.hoisted(() => ({
	loadAllNews: vi.fn(),
	loadStravaData: vi.fn()
}));
vi.mock('$lib/api/marin/load-all', () => ({ loadAllNews }));
vi.mock('$lib/stores/strava', () => ({ loadStravaData }));
const controller = vi.hoisted(() => ({
	start: vi.fn(async () => {}),
	refresh: vi.fn(async () => {}),
	ensure: vi.fn(async () => {}),
	created: [] as AbortSignal[]
}));
// Earlier tests in this file render DashboardV2 too: reset every captured call per test (Codex r1 #11).
beforeEach(() => {
	controller.start.mockClear();
	controller.refresh.mockClear();
	controller.ensure.mockClear();
	controller.created.length = 0;
});
vi.mock('$lib/dashboard/v2-controller', () => ({
	V2_REFRESH_MS: 300_000,
	createDashboardV2Controller: ({ signal }: { signal: AbortSignal }) => {
		controller.created.push(signal);
		return {
			start: controller.start,
			refresh: controller.refresh,
			ensure: controller.ensure,
			earthquakes: { subscribe: (fn: (v: unknown[]) => void) => (fn([]), () => {}) },
			sources: { subscribe: (fn: (v: unknown[]) => void) => (fn([]), () => {}) }
		};
	}
}));

import DashboardV2 from './DashboardV2.svelte';

describe('DashboardV2 preview shell', () => {
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

	it('renders the shell: map region, Getting Around under it, then five sections in order', async () => {
		const { container } = render(DashboardV2);
		await tick();
		expect(container.querySelector('section#map')).toBeTruthy();
		const order = [...container.querySelectorAll('[data-section]')].map((s) =>
			s.getAttribute('data-section')
		);
		expect(order).toEqual(['getting-around', 'outdoors', 'news', 'cost', 'events', 'strava']);
		expect(container.querySelector('#sections [data-section="getting-around"]')).toBeNull();
		expect(screen.getByRole('navigation', { name: 'Jump to' })).toBeTruthy();
	});

	it('every section toggle is a real disclosure button', async () => {
		render(DashboardV2);
		await tick();
		for (const name of [
			'Getting Around',
			'Outdoors & Conditions',
			'News & Civic',
			'Cost & Character',
			'Events & Sports',
			'Strava'
		]) {
			const button = screen.getByRole('button', { name: new RegExp(name) });
			expect(button.getAttribute('aria-expanded')).toMatch(/^(true|false)$/);
			expect(button.getAttribute('aria-controls')).toMatch(/^section-.+-body$/);
		}
	});
});

describe('DashboardV2 town display across hydration', () => {
	/** The markup of the first client render, before any effect (onMount) runs — what hydration adopts. */
	async function firstRenderHtml(storedTown: string | null): Promise<string> {
		localStorage.clear();
		if (storedTown) localStorage.setItem('mm_town', storedTown);
		vi.resetModules();
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

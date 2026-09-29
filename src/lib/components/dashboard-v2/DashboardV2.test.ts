import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

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
});

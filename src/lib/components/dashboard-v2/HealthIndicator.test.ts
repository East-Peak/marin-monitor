import { fireEvent, render, screen } from '@testing-library/svelte';
import { writable } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import type { HealthReportJson } from '$lib/api/marin/health-report';
import type { DatasetFetch } from '$lib/dashboard/source-adapters';
import HealthIndicator from './HealthIndicator.svelte';

const NOW = Date.parse('2026-09-29T15:00:00Z');
const REPORT: HealthReportJson = {
	status: 'degraded',
	sources: [
		{
			name: 'Wine Index',
			status: 'stale',
			reason: 'older than 10d',
			maxAgeDays: 10,
			observedAt: '2026-09-09T15:00:00.000Z'
		},
		{
			name: 'Strava Events',
			status: 'stale',
			reason: 'older than 2d',
			maxAgeDays: 2,
			observedAt: null,
			accepted: { reason: 'GS: waiting on Strava', expiresAt: '2026-12-31T23:59:59.000Z' }
		}
	],
	subsources: []
};

describe('HealthIndicator', () => {
	it('a disclosure button labelled by the summary opens a readable list of degraded sources', async () => {
		render(HealthIndicator, {
			props: {
				report: writable(REPORT),
				outcomes: writable<Record<string, DatasetFetch>>({
					health: { kind: 'live', observedAt: null }
				}),
				now: writable(NOW)
			}
		});
		const button = screen.getByRole('button', { name: 'Sources: 2 degraded' });
		expect(button.getAttribute('aria-expanded')).toBe('false');
		await fireEvent.click(button);
		expect(button.getAttribute('aria-expanded')).toBe('true');
		const list = document.querySelector('[data-health-list]')!;
		expect(list.textContent).toContain('Wine Index');
		expect(list.textContent).toContain('out of date · as of Sep 9, 8:00 AM · older than 10d');
		expect(list.textContent).toContain('Known issue until Dec 31: GS: waiting on Strava');
	});
});

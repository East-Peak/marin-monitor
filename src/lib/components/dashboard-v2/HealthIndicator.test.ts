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
	it('a button labelled by the summary opens a dialog listing every monitored source, in reader words (rule 6)', async () => {
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
		expect(button.getAttribute('aria-haspopup')).toBe('dialog');
		await fireEvent.click(button);
		const dialog = screen.getByRole('dialog', { name: 'Source health' });
		expect(dialog.textContent).toContain('Wine Index');
		expect(dialog.textContent).toContain('Out of date');
		expect(dialog.textContent).toContain('last updated Sep 9, 8:00 AM');
		expect(dialog.textContent).toContain('Known issue until Dec 31');
		// The evaluator's reason and a maintainer's note are diagnostics: /api/health only (rule 7).
		expect(dialog.textContent).not.toContain('older than 10d');
		expect(dialog.textContent).not.toContain('GS: waiting on Strava');
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('a refresh that failed over a kept report says so inside the dialog, not only on the button (Codex 1c #5)', async () => {
		render(HealthIndicator, {
			props: {
				report: writable(REPORT),
				outcomes: writable<Record<string, DatasetFetch>>({
					health: { kind: 'failed', error: 'HTTP 502', retained: true, observedAt: null }
				}),
				now: writable(NOW)
			}
		});
		const button = screen.getByRole('button');
		await fireEvent.click(button);
		const dialog = screen.getByRole('dialog', { name: 'Source health' });
		const note = dialog.querySelector('[data-source-note]')!;
		expect(note.textContent).toBe(button.textContent!.trim());
		expect(note.hasAttribute('data-attention')).toBe(true);
	});
});

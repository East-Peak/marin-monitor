import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import LatestReporting from './LatestReporting.svelte';
import type { LatestReportingView, ReportingRow } from '$lib/dashboard/latest-reporting';
import { measuredLoading, measuredUnavailable, measuredValue } from '$lib/dashboard/measured';

const NOW = Date.parse('2026-10-01T15:00:00Z');
const row = (over: Partial<ReportingRow> = {}): ReportingRow => ({
	id: 'city-of-san-rafael:p',
	title: 'To report a parking violation (red zone, fire lane), call the police',
	link: 'https://news.example/p',
	source: 'City of San Rafael',
	age: '2 h ago',
	scope: 'San Rafael',
	publishedAt: NOW - 7_200_000,
	retained: null,
	...over
});
// Complete, typed views (Codex r2 #2): coverage is required and holds the rows.
const okView = (rows: ReportingRow[]): LatestReportingView => ({
	coverage: measuredValue(rows, 'Reporting feeds', NOW - 60_000),
	empty: null,
	presentation: { state: 'ok', failing: [], asOf: null },
	shownIds: new Set(rows.map((r) => r.id))
});

describe('LatestReporting', () => {
	it('renders each row as a link with one source · age · scope line, and no alert affordance', () => {
		const { container } = render(LatestReporting, { props: { view: okView([row()]), now: NOW } });
		const link = screen.getByRole('link', { name: /parking violation/ });
		expect(link.getAttribute('target')).toBe('_blank');
		expect(link.getAttribute('rel')).toBe('noopener noreferrer');
		expect(
			container.querySelector('[data-reporting-row="city-of-san-rafael:p"]')?.textContent
		).toContain('City of San Rafael · 2 h ago · San Rafael');
		expect(container.querySelector('[data-alert], .alert, .alert-tag, [role="alert"]')).toBeNull();
		expect(
			[...container.querySelectorAll('*')].some((el) => el.textContent?.trim() === 'ALERT')
		).toBe(false);
	});

	it('a row from a feed the snapshot only kept says so (Codex r3 #2)', () => {
		const { container } = render(LatestReporting, {
			props: { view: okView([row({ retained: 'Feed not updated since 5:00 AM' })]), now: NOW }
		});
		expect(container.querySelector('[data-retained]')?.textContent).toBe(
			'Feed not updated since 5:00 AM'
		);
	});

	it('rows are gated on coverage: loading or unavailable coverage renders no rows (Codex r3 #2)', () => {
		for (const coverage of [
			measuredLoading<readonly ReportingRow[]>('News snapshot'),
			measuredUnavailable<readonly ReportingRow[]>('Reporting feeds', 'every reporting feed failed')
		]) {
			const { container, unmount } = render(LatestReporting, {
				props: {
					view: {
						coverage,
						empty: null,
						presentation: {
							state: coverage.kind === 'loading' ? 'loading' : 'unavailable',
							failing: [],
							asOf: null
						},
						shownIds: new Set(['city-of-san-rafael:p'])
					},
					now: NOW
				}
			});
			expect(container.querySelectorAll('[data-reporting-row]')).toHaveLength(0);
			expect(container.textContent).not.toMatch(/no news|nothing new/i);
			unmount();
		}
	});

	it('the empty sentence appears only when the model authorizes it', () => {
		render(LatestReporting, {
			props: {
				view: {
					...okView([]),
					empty: 'No dated reporting right now',
					presentation: { state: 'empty', failing: [], asOf: null }
				},
				now: NOW
			}
		});
		expect(screen.getByText('No dated reporting right now')).toBeTruthy();
	});

	it('an item without a link is plain text, not a dead link', () => {
		render(LatestReporting, { props: { view: okView([row({ link: '' })]), now: NOW } });
		expect(screen.queryByRole('link')).toBeNull();
	});
});

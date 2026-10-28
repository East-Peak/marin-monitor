import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import Section from './Section.svelte';
import type { SectionPresentation } from '$lib/dashboard/source-status';

const body = createRawSnippet(() => ({ render: () => '<p data-testid="body">Body content</p>' }));
const NOW = Date.parse('2026-09-29T18:00:00Z');
const IJ = {
	id: 'news:ij',
	name: 'Marin IJ',
	state: 'unavailable' as const,
	observedAt: null,
	maxAgeMs: null,
	detail: 'HTTP 503',
	failure: 'http-error' as const
};
const partial: SectionPresentation = {
	state: 'partial',
	asOf: null,
	failing: [
		{
			id: 'news:ij',
			name: 'Marin IJ',
			state: 'unavailable',
			observedAt: null,
			maxAgeMs: null,
			detail: 'HTTP 503',
			failure: 'http-error'
		}
	],
	entries: [
		{
			...IJ,
			id: 'news:pt',
			name: 'Point Reyes Light',
			state: 'ok',
			observedAt: NOW - 60_000,
			detail: null,
			failure: undefined
		},
		IJ
	]
};

function renderSection(
	props: Partial<{
		open: boolean;
		status: SectionPresentation | null;
		collapsible: boolean;
		meta: string | null;
	}> = {}
) {
	const ontoggle = vi.fn();
	const result = render(Section, {
		props: {
			id: 'news',
			title: 'News & Civic',
			open: false,
			ontoggle,
			now: NOW,
			children: body,
			...props
		}
	});
	return { ...result, ontoggle, toggle: screen.queryByRole('button', { name: /News & Civic/ })! };
}

describe('Section', () => {
	it('closed: collapsed button that controls a hidden, unmounted body', () => {
		const { toggle } = renderSection();
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		const bodyEl = document.getElementById(toggle.getAttribute('aria-controls')!);
		expect(bodyEl?.hidden).toBe(true);
		expect(screen.queryByTestId('body')).toBeNull();
	});
	it('open: expanded, body mounted and visible', () => {
		const { toggle } = renderSection({ open: true });
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByTestId('body')).toBeTruthy();
		expect(document.getElementById('section-news-body')?.hidden).toBe(false);
	});
	it('a click asks the owner to toggle this section', async () => {
		const { toggle, ontoggle } = renderSection();
		await fireEvent.click(toggle);
		expect(ontoggle).toHaveBeenCalledWith('news');
	});
	it('is a fragment target: id is the section id, focusable, heading level 2', () => {
		const { container } = renderSection();
		const section = container.querySelector('section#news');
		expect(section?.getAttribute('tabindex')).toBe('-1');
		expect(screen.getByRole('heading', { level: 2, name: /News & Civic/ })).toBeTruthy();
	});
	it('keeps its coverage line visible whether open or closed (§3, rule 6), outside the header button', async () => {
		const { rerender, toggle } = renderSection({ status: partial });
		const line = screen.getByText('Partial coverage · Marin IJ unavailable');
		expect(toggle.contains(line)).toBe(false);
		await rerender({ open: true, status: partial });
		expect(screen.getByText('Partial coverage · Marin IJ unavailable')).toBeTruthy();
		expect(document.querySelector('details')).toBeNull(); // no disclosure pushes the content down
	});

	it('"Coverage details" opens a dialog listing every source of the section, in reader words (rules 6, 7)', async () => {
		const { toggle } = renderSection({ status: partial });
		const button = screen.getByRole('button', { name: 'Coverage details' });
		expect(toggle.contains(button)).toBe(false);
		expect(button.getAttribute('aria-haspopup')).toBe('dialog');
		await fireEvent.click(button);
		const dialog = screen.getByRole('dialog', { name: 'News & Civic sources' });
		expect(dialog.textContent).toContain('1 of 2 sources reporting');
		expect(dialog.textContent).toContain('Point Reyes Light');
		expect(dialog.textContent).toContain('Reporting');
		expect(dialog.textContent).toContain('Unavailable: the source returned an error');
		expect(dialog.textContent).not.toMatch(/HTTP 503/); // the diagnostic stays in /api/health
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('the header is one full-width button: title, a quiet count, a chevron at the trailing edge (rule 5)', () => {
		const { toggle } = renderSection({ meta: '9 of 10 feeds OK' });
		expect(toggle.getAttribute('data-section-toggle')).toBe('news');
		expect(toggle.querySelector('[data-text-role="section-title"]')!.textContent).toBe(
			'News & Civic'
		);
		expect(toggle.querySelector('[data-section-meta]')!.textContent).toBe('9 of 10 feeds OK');
		expect(toggle.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
		expect(toggle.textContent).not.toMatch(/[▸▾]/);
	});
	it('a header count (e.g. "9 of 10 feeds OK") shows open or closed, as meta', async () => {
		const { container, rerender } = renderSection({ meta: '9 of 10 feeds OK' });
		const meta = () => container.querySelector('[data-section-meta]');
		expect(meta()?.getAttribute('data-text-role')).toBe('meta');
		await rerender({ open: true, meta: '9 of 10 feeds OK' });
		expect(meta()?.textContent).toBe('9 of 10 feeds OK');
	});

	it('collapsible=false shows its count beside a plain heading', () => {
		const { container } = renderSection({
			open: true,
			collapsible: false,
			meta: '9 of 10 feeds OK'
		});
		expect(container.querySelector('h2 [data-section-meta]')!.textContent).toBe('9 of 10 feeds OK');
	});

	it('no meta, no meta line', () => {
		expect(renderSection().container.querySelectorAll('[data-section-meta]')).toHaveLength(0);
	});

	it('collapsible=false renders a heading, no toggle button, body mounted', () => {
		const { container } = renderSection({ open: true, collapsible: false });
		expect(screen.getByRole('heading', { level: 2, name: 'News & Civic' })).toBeTruthy();
		expect(screen.queryByRole('button')).toBeNull();
		expect(container.querySelector('[aria-expanded]')).toBeNull();
		expect(screen.getByTestId('body')).toBeTruthy();
		expect(document.getElementById('section-news-body')?.hidden).toBe(false);
	});
});

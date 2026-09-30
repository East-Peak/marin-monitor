import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import Section from './Section.svelte';
import type { SectionPresentation } from '$lib/dashboard/source-status';

const body = createRawSnippet(() => ({ render: () => '<p data-testid="body">Body content</p>' }));
const NOW = Date.parse('2026-09-29T18:00:00Z');
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
			detail: 'HTTP 503'
		}
	]
};

function renderSection(props: Partial<{ open: boolean; status: SectionPresentation | null }> = {}) {
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
	return { ...result, ontoggle, toggle: screen.getByRole('button', { name: /News & Civic/ }) };
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
	it('keeps its status line in the header whether open or closed (§3), with each failing source and its reason', async () => {
		const { rerender } = renderSection({ status: partial });
		expect(screen.getByText('Partial coverage · Marin IJ unavailable')).toBeTruthy();
		expect(screen.getByText('Marin IJ: unavailable (HTTP 503)')).toBeTruthy();
		await rerender({ open: true, status: partial });
		expect(screen.getByText('Partial coverage · Marin IJ unavailable')).toBeTruthy();
	});
});

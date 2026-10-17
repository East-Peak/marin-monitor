import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import JumpNav from './JumpNav.svelte';

describe('JumpNav', () => {
	it('is a labelled nav of real anchors that report the jump', async () => {
		const onjump = vi.fn();
		render(JumpNav, { props: { onjump } });
		const nav = screen.getByRole('navigation', { name: 'Jump to' });
		const links = [...nav.querySelectorAll('a')];
		expect(links.map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
			['Top', '#top'],
			['Map', '#map'],
			['News', '#news'],
			['Sections', '#sections']
		]);
		await fireEvent.click(screen.getByRole('link', { name: 'News' }));
		expect(onjump).toHaveBeenCalledWith('#news');
	});
});

describe('JumpNav on desktop (MAPX1)', () => {
	it('is a slim row of the page’s regions, real anchors that report the jump', async () => {
		const onjump = vi.fn();
		render(JumpNav, { props: { onjump, desktop: true } });
		const nav = screen.getByRole('navigation', { name: 'Jump to' });
		expect(nav.classList).toContain('v2-jump-desk');
		const links = [...nav.querySelectorAll('a')];
		expect(links.map((a) => [a.textContent?.trim(), a.getAttribute('href')])).toEqual([
			['Map', '#map'],
			['Getting around', '#getting-around'],
			['Outdoors', '#outdoors'],
			['News', '#news'],
			['Cost', '#cost'],
			['Events', '#events']
		]);
		await fireEvent.click(screen.getByRole('link', { name: 'Outdoors' }));
		expect(onjump).toHaveBeenCalledWith('#outdoors');
	});
});

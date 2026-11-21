import { render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
	page: {
		status: 404,
		url: new URL('http://localhost/cost/stinson'),
		error: { message: 'Not found' } as { message: string } | null
	}
}));
vi.mock('$app/state', () => state);
const { default: ErrorPage } = await import('./+error.svelte');

const LINKS = [
	['Dashboard', '/'],
	['Map', '/map'],
	['Cost of living', '/cost']
];

beforeEach(() => {
	state.page.status = 404;
	state.page.url = new URL('http://localhost/cost/stinson');
	state.page.error = { message: 'Not found' };
	document.head.innerHTML = '';
});

describe('+error.svelte', () => {
	it('a 404 names the path, says why, and offers the three places', () => {
		const { container } = render(ErrorPage);
		expect(container.querySelector('[data-wordmark]')?.textContent).toBe('Marin Monitor');
		expect(container.querySelector('[data-status]')?.textContent).toBe('404');
		expect(container.querySelector('h1')?.textContent).toMatch(
			/^There.s no page at \/cost\/stinson$/
		);
		expect(container.textContent).toContain(
			"The link may be old, or the town isn't one we cover yet."
		);
		const links = [...container.querySelectorAll('nav a')].map((a) => [
			a.textContent?.trim(),
			a.getAttribute('href')
		]);
		expect(links).toEqual(LINKS);
	});

	it('marks the page noindex and titles it', () => {
		render(ErrorPage);
		expect(document.title).toBe('Page not found · Marin Monitor');
		expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
			'noindex'
		);
	});

	it('any other status is a plain "Something went wrong" with the same links, and no message', () => {
		state.page.status = 500;
		state.page.error = { message: 'ECONNREFUSED 10.0.0.5:5432 secret-token' };
		const { container } = render(ErrorPage);
		expect(container.querySelector('h1')?.textContent).toBe('Something went wrong');
		expect(container.querySelector('[data-status]')?.textContent).toBe('500');
		expect(container.textContent).not.toContain('ECONNREFUSED');
		expect(container.textContent).not.toContain('/cost/stinson');
		expect(
			[...container.querySelectorAll('nav a')].map((a) => [
				a.textContent?.trim(),
				a.getAttribute('href')
			])
		).toEqual(LINKS);
		expect(document.title).toBe('Something went wrong · Marin Monitor');
		expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
			'noindex'
		);
	});
});

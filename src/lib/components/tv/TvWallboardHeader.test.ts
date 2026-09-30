import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { TV_SCREENS } from '$lib/config/tv';
import TvWallboardHeader from './TvWallboardHeader.svelte';

const props = {
	paused: false,
	currentTemp: null,
	stories24h: 0,
	alertCount: 0,
	clockText: '',
	degradedErrorCount: 0,
	onGoToScreen: () => {}
};

describe('TvWallboardHeader screen buttons', () => {
	it('carry a stable data-screen-id; the active one is aria-current', () => {
		const { container } = render(TvWallboardHeader, { props: { ...props, carouselIdx: 0 } });
		const ids = [...container.querySelectorAll('[data-screen-id]')].map((b) =>
			b.getAttribute('data-screen-id')
		);
		expect(ids).toEqual(TV_SCREENS.map((s) => s.id));
		expect(
			container
				.querySelector('[data-screen-id][aria-current="true"]')
				?.getAttribute('data-screen-id')
		).toBe('map-county');
	});

	it('the active id follows the carousel', () => {
		const idx = TV_SCREENS.findIndex((s) => s.id === 'news-wire');
		const { container } = render(TvWallboardHeader, { props: { ...props, carouselIdx: idx } });
		expect(
			container
				.querySelector('[data-screen-id][aria-current="true"]')
				?.getAttribute('data-screen-id')
		).toBe('news-wire');
	});
});

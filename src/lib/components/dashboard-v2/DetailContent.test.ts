import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DetailContent from './DetailContent.svelte';

const FRAME =
	'https://cameras.alertcalifornia.org/public-camera-data/Axis-TamEast/latest-frame.jpg';
const detail = (refreshS?: number) => ({
	title: 'Mt. Tam East',
	meta: [],
	image: { src: FRAME, alt: 'Latest frame from Mt. Tam East', ...(refreshS ? { refreshS } : {}) },
	paragraphs: [],
	source: null
});
const src = (c: HTMLElement) => c.querySelector('img')!.getAttribute('src')!;

beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }));
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('DetailContent image', () => {
	it('a still image is shown as given', async () => {
		const { container } = render(DetailContent, { detail: detail(), titleId: 't' });
		await vi.advanceTimersByTimeAsync(60_000);
		expect(src(container)).toBe(FRAME);
	});

	it('a live frame (MAPX4) reloads every refreshS seconds while shown, uncropped', async () => {
		const { container, unmount } = render(DetailContent, { detail: detail(15), titleId: 't' });
		const first = src(container);
		expect(first.startsWith(`${FRAME}?t=`)).toBe(true);
		await vi.advanceTimersByTimeAsync(15_000);
		await tick();
		const second = src(container);
		expect(second).not.toBe(first);
		expect(second.startsWith(`${FRAME}?t=`)).toBe(true);
		expect(container.querySelector('img')!.loading).not.toBe('lazy');
		unmount();
		expect(vi.getTimerCount()).toBe(0);
	});
});

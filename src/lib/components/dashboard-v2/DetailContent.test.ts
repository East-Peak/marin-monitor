import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
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

	it('a frame that fails to load says so, then tries again on the next refresh (Codex MAPX4 #5)', async () => {
		const { container } = render(DetailContent, { detail: detail(15), titleId: 't' });
		container.querySelector('img')!.dispatchEvent(new Event('error'));
		await tick();
		expect(container.textContent).toContain('Latest frame unavailable');
		expect(container.querySelector('img')!.hidden).toBe(true);
		await vi.advanceTimersByTimeAsync(15_000);
		await tick();
		expect(container.querySelector('img')!.hidden).toBe(false);
		expect(container.textContent).not.toContain('Latest frame unavailable');
	});
});

describe('DetailContent enlarged frame (CAMQUIET1)', () => {
	const cam = {
		...detail(15),
		title: 'Muir Beach',
		meta: ['ALERTCalifornia | UC San Diego', 'Last reported heading: SSW (200°) · 7:59 AM']
	};
	const enlarge = async () => {
		await fireEvent.click(screen.getByRole('button', { name: /^Enlarge/ }));
		await tick();
		return screen.getByRole('dialog', { name: 'Muir Beach' });
	};

	it('says why a camera shows no wedge, under its heading line', () => {
		const status = 'No direction drawn: last frame 11 min ago';
		const { container } = render(DetailContent, { detail: { ...cam, status }, titleId: 't' });
		expect(container.querySelector('[data-detail-status]')?.textContent).toBe(status);
	});

	it('the frame is a labelled button that opens the whole frame, credited below it', async () => {
		render(DetailContent, { detail: cam, titleId: 't' });
		expect(screen.getByRole('button', { name: /^Enlarge/ }).textContent).toContain('Enlarge');
		const dialog = await enlarge();
		const img = dialog.querySelector('img')!;
		expect(img.getAttribute('src')!.startsWith(`${FRAME}?t=`)).toBe(true);
		const caption = dialog.querySelector('figcaption')!;
		expect(caption.textContent).toContain('Muir Beach');
		expect(caption.textContent).toContain('ALERTCalifornia | UC San Diego');
		expect(caption.textContent).toContain('Last reported heading: SSW (200°) · 7:59 AM');
		// Below the frame, never over it (CAMBAR1).
		expect(img.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		await tick();
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('a failed frame says "Frame unavailable" in the dialog, never an empty box', async () => {
		render(DetailContent, { detail: cam, titleId: 't' });
		const dialog = await enlarge();
		dialog.querySelector('img')!.dispatchEvent(new Event('error'));
		await tick();
		expect(dialog.querySelector('img')).toBeNull();
		expect(dialog.textContent).toContain('Frame unavailable');
		// The next refresh tries the frame again.
		await vi.advanceTimersByTimeAsync(15_000);
		await tick();
		expect(dialog.querySelector('img')).not.toBeNull();
		expect(dialog.textContent).not.toContain('Frame unavailable');
	});
});

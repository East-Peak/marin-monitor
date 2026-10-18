import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import BottomSheet from './BottomSheet.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>the list</p>' }));
const props = (over: Record<string, unknown> = {}) => ({
	label: 'In view',
	summary: 'In view · 4',
	sheet: 'peek' as const,
	onsheet: vi.fn(),
	children,
	...over
});
const handle = () => screen.getByRole('button', { name: /In view · 4/ });
/** jsdom has no PointerEvent: a MouseEvent of the pointer type carries clientY. */
const drag = (type: string, clientY: number) =>
	fireEvent(handle(), new MouseEvent(type, { clientY, bubbles: true }));

describe('BottomSheet', () => {
	it('peek shows the summary only; its handle opens the list', async () => {
		const p = props();
		render(BottomSheet, p);
		expect(handle().getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByText('the list')).toBeNull();
		await fireEvent.click(handle());
		expect(p.onsheet).toHaveBeenCalledWith('half');
	});

	it('half shows the list; the handle, or ArrowDown, lowers it back to peek', async () => {
		const p = props({ sheet: 'half' });
		render(BottomSheet, p);
		expect(handle().getAttribute('aria-expanded')).toBe('true');
		expect(screen.getByText('the list')).toBeTruthy();
		await fireEvent.keyDown(handle(), { key: 'ArrowDown' });
		expect(p.onsheet).toHaveBeenLastCalledWith('peek');
		await fireEvent.click(handle());
		expect(p.onsheet).toHaveBeenLastCalledWith('peek');
	});

	it('ArrowUp raises peek to half', async () => {
		const p = props();
		render(BottomSheet, p);
		await fireEvent.keyDown(handle(), { key: 'ArrowUp' });
		expect(p.onsheet).toHaveBeenCalledWith('half');
	});

	it('a swipe up on the handle raises it; a short drag is a no-op', async () => {
		const p = props();
		render(BottomSheet, p);
		await drag('pointerdown', 500);
		await drag('pointerup', 490);
		expect(p.onsheet).not.toHaveBeenCalled();
		await drag('pointerdown', 500);
		await drag('pointerup', 400);
		expect(p.onsheet).toHaveBeenCalledWith('half');
	});

	it('a swipe down on the handle lowers half to peek', async () => {
		const p = props({ sheet: 'half' });
		render(BottomSheet, p);
		await drag('pointerdown', 400);
		await drag('pointerup', 500);
		expect(p.onsheet).toHaveBeenCalledWith('peek');
	});
});

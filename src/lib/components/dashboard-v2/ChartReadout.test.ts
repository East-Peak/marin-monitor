import { createRawSnippet } from 'svelte';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlotScale, ReadoutStop } from '$lib/dashboard/chart-readout';
import ChartReadout from './ChartReadout.svelte';

const words = (figure: string, tail: string) => ({ lead: '', figure, tail });
const STOPS: ReadoutStop[] = [
	{ at: 0, y: 0.5, words: words('50°', '1 PM') },
	{ at: 100, y: 0.2, words: words('55°', '2 PM') },
	{ at: 200, y: null, words: words('No readings 2–3 PM', ''), from: 150, to: 250 },
	{ at: 300, y: 0.9, words: words('60°', '4 PM') }
];
const PLOT: PlotScale = { domain: [0, 300], left: 0, right: 300, width: 300 };
const children = createRawSnippet(() => ({ render: () => '<svg></svg>' }));
const mount = (props: Record<string, unknown> = {}) => {
	const r = render(ChartReadout, {
		props: { label: 'Temperature', stops: STOPS, plot: PLOT, children, ...props }
	});
	const host = r.container.querySelector('[role="slider"]') as HTMLElement;
	const surface = r.container.querySelector('[data-readout-plot]') as HTMLElement;
	surface.getBoundingClientRect = () =>
		({ left: 0, top: 0, width: 300, height: 100, right: 300, bottom: 100 }) as DOMRect;
	Object.defineProperty(surface, 'clientWidth', { value: 300, configurable: true });
	return { ...r, host, surface };
};
const label = (c: HTMLElement) => c.querySelector('[data-readout]')?.textContent?.trim() ?? null;
const pointer = (el: Element, type: string, clientX: number, clientY = 10, pointerType = 'touch') =>
	fireEvent(
		el,
		Object.assign(new MouseEvent(type, { bubbles: true, clientX, clientY }), {
			pointerType,
			pointerId: 1
		})
	);

beforeEach(() => {
	Element.prototype.setPointerCapture = vi.fn();
});
afterEach(cleanup);

describe('ChartReadout', () => {
	it('is one slider named for the chart, with no live region', () => {
		const { host, container } = mount();
		expect(host.getAttribute('aria-label')).toBe('Temperature');
		expect(host.tabIndex).toBe(0);
		const hint = document.getElementById(host.getAttribute('aria-describedby')!);
		expect(hint?.textContent).toBe('Arrow keys read each value');
		expect(container.querySelector('[aria-live]')).toBeNull();
		expect(label(container)).toBeNull();
	});

	it('the mouse reads the nearest stop and leaves with the pointer', async () => {
		const { surface, container } = mount();
		await pointer(surface, 'pointermove', 80, 10, 'mouse');
		expect(label(container)).toBe('55° · 2 PM');
		await pointer(surface, 'pointerleave', 80, 10, 'mouse');
		expect(label(container)).toBeNull();
	});

	it('inside a silence it says the silence, with no dot', async () => {
		const { surface, container } = mount();
		await pointer(surface, 'pointermove', 210, 10, 'mouse');
		expect(label(container)).toBe('No readings 2–3 PM');
		expect(container.querySelector('[data-readout-dot]')).toBeNull();
		expect(container.querySelector('[data-readout-rule]')).not.toBeNull();
	});

	it('keys start on the given stop, step, jump, and Esc clears', async () => {
		const { host, container } = mount({ start: 1 });
		await fireEvent.keyDown(host, { key: 'ArrowRight' });
		expect(host.getAttribute('aria-valuetext')).toBe('No readings 2–3 PM');
		await fireEvent.keyDown(host, { key: 'ArrowRight' });
		await fireEvent.keyDown(host, { key: 'ArrowRight' });
		expect(label(container)).toBe('60° · 4 PM');
		await fireEvent.keyDown(host, { key: 'Home' });
		expect(label(container)).toBe('50° · 1 PM');
		await fireEvent.keyDown(host, { key: 'ArrowLeft' });
		expect(label(container)).toBe('50° · 1 PM');
		await fireEvent.keyDown(host, { key: 'End' });
		expect(host.getAttribute('aria-valuenow')).toBe('3');
		await fireEvent.keyDown(host, { key: 'Escape' });
		expect(label(container)).toBeNull();
	});

	it('blur clears', async () => {
		const { host, container } = mount();
		await fireEvent.keyDown(host, { key: 'Home' });
		await fireEvent.blur(host);
		expect(label(container)).toBeNull();
	});

	it('a tap reads and stays until a tap elsewhere', async () => {
		const { surface, container } = mount();
		await pointer(surface, 'pointerdown', 90);
		await pointer(surface, 'pointerup', 90);
		expect(label(container)).toBe('55° · 2 PM');
		await pointer(surface, 'pointerdown', 280);
		await pointer(surface, 'pointerup', 280);
		expect(label(container)).toBe('60° · 4 PM');
		await pointer(document.body, 'pointerdown', 0);
		expect(label(container)).toBeNull();
	});

	it('a sideways drag follows the finger and pins where it lifts', async () => {
		const { surface, container } = mount();
		await pointer(surface, 'pointerdown', 10);
		await pointer(surface, 'pointermove', 30);
		expect(label(container)).toBe('50° · 1 PM');
		await pointer(surface, 'pointermove', 95);
		expect(label(container)).toBe('55° · 2 PM');
		await pointer(surface, 'pointerup', 95);
		expect(label(container)).toBe('55° · 2 PM');
	});

	it('a vertical move past 10 px hands the gesture over and pins nothing', async () => {
		const { surface, container } = mount();
		await pointer(surface, 'pointerdown', 90, 10);
		await pointer(surface, 'pointermove', 92, 25);
		await pointer(surface, 'pointerup', 92, 25);
		expect(label(container)).toBeNull();
	});

	it('pointercancel clears', async () => {
		const { surface, container } = mount();
		await pointer(surface, 'pointerdown', 10);
		await pointer(surface, 'pointermove', 40);
		await pointer(surface, 'pointercancel', 40);
		expect(label(container)).toBeNull();
	});

	it('on a chart that scrolls, a tap reads and a swipe never does', async () => {
		const { surface, container } = mount({ scrollable: true, minWidth: 600 });
		expect(surface.classList.contains('pans')).toBe(true);
		await pointer(surface, 'pointerdown', 10);
		await pointer(surface, 'pointermove', 60);
		expect(label(container)).toBeNull();
		await pointer(surface, 'pointerup', 60);
		expect(label(container)).toBeNull();
		await pointer(surface, 'pointerdown', 95);
		await pointer(surface, 'pointerup', 95);
		expect(label(container)).toBe('55° · 2 PM');
	});

	it('clears when what it reads changes, not when the same stops arrive again', async () => {
		const { host, container, rerender } = mount();
		await fireEvent.keyDown(host, { key: 'Home' });
		await rerender({ stops: STOPS.map((s) => ({ ...s })) });
		expect(label(container)).toBe('50° · 1 PM');
		await rerender({
			stops: [{ ...STOPS[0], words: words('51°', '1 PM') }, ...STOPS.slice(1)]
		});
		expect(label(container)).toBeNull();
	});

	it('clears when told the data or town changed, though the words are the same', async () => {
		const { host, container, rerender } = mount({ resetKey: 'a' });
		await fireEvent.keyDown(host, { key: 'Home' });
		await rerender({ resetKey: 'a' });
		expect(label(container)).toBe('50° · 1 PM');
		await rerender({ resetKey: 'b' });
		expect(label(container)).toBeNull();
	});

	it('a screen reader gets a stop’s fuller words when it has them', async () => {
		const spoken = [{ ...STOPS[0], spoken: '50° · 1 PM · 10% chance of rain' }, ...STOPS.slice(1)];
		const { host, container } = mount({ stops: spoken });
		await fireEvent.keyDown(host, { key: 'Home' });
		expect(host.getAttribute('aria-valuetext')).toBe('50° · 1 PM · 10% chance of rain');
		expect(label(container)).toBe('50° · 1 PM');
	});

	describe('a destination', () => {
		it('opens on a tap on the point, a click and Enter, with the stop', async () => {
			const onpick = vi.fn();
			const { host, surface } = mount({ onpick });
			await pointer(surface, 'pointerdown', 95);
			await pointer(surface, 'pointerup', 95);
			await pointer(surface, 'pointerdown', 95, 10, 'mouse');
			await pointer(surface, 'pointerup', 95, 10, 'mouse');
			await fireEvent.keyDown(host, { key: 'Enter' });
			expect(onpick).toHaveBeenCalledTimes(3);
			expect(onpick).toHaveBeenCalledWith(STOPS[1]);
		});
		it('never opens after a move, or on a silence', async () => {
			const onpick = vi.fn();
			const { surface } = mount({ onpick });
			await pointer(surface, 'pointerdown', 10);
			await pointer(surface, 'pointermove', 95);
			await pointer(surface, 'pointerup', 95);
			await pointer(surface, 'pointerdown', 210);
			await pointer(surface, 'pointerup', 210);
			expect(onpick).not.toHaveBeenCalled();
		});
	});
});

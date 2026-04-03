import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import TvScrollerHarness from './__test__/TvScrollerHarness.svelte';
import { resetAllScrollPositions } from '$lib/stores/tv-scroll';

class ResizeObserverMock {
	static instances: ResizeObserverMock[] = [];

	private readonly callback: ResizeObserverCallback;
	private readonly observed = new Set<Element>();

	constructor(callback: ResizeObserverCallback) {
		this.callback = callback;
		ResizeObserverMock.instances.push(this);
	}

	observe(target: Element) {
		this.observed.add(target);
	}

	unobserve(target: Element) {
		this.observed.delete(target);
	}

	disconnect() {
		this.observed.clear();
	}

	static trigger(target: Element) {
		for (const instance of ResizeObserverMock.instances) {
			if (!instance.observed.has(target)) continue;
			instance.callback([{ target } as ResizeObserverEntry], instance as unknown as ResizeObserver);
		}
	}

	static reset() {
		ResizeObserverMock.instances = [];
	}
}

describe('TvScroller', () => {
	let rafNow = 0;
	let rafId = 0;
	let rafCallbacks = new Map<number, FrameRequestCallback>();

	beforeEach(() => {
		resetAllScrollPositions();
		ResizeObserverMock.reset();
		rafNow = 0;
		rafId = 0;
		rafCallbacks = new Map();

		vi.stubGlobal('ResizeObserver', ResizeObserverMock);
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			const id = ++rafId;
			rafCallbacks.set(id, callback);
			return id;
		});
		vi.stubGlobal('cancelAnimationFrame', (id: number) => {
			rafCallbacks.delete(id);
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	function runAnimationFrame(deltaMs: number) {
		rafNow += deltaMs;
		const callbacks = Array.from(rafCallbacks.values());
		rafCallbacks.clear();
		for (const callback of callbacks) {
			callback(rafNow);
		}
	}

	it('starts scrolling when the viewport shrinks and content now overflows', async () => {
		const { container } = render(TvScrollerHarness, {
			props: {
				active: true,
				itemCount: 10
			}
		});

		const contentWrapper = screen.getByTestId('scroll-content').parentElement as HTMLDivElement;
		const scrollContainer = contentWrapper.parentElement as HTMLDivElement;

		Object.defineProperty(scrollContainer, 'clientHeight', {
			configurable: true,
			value: 420
		});
		Object.defineProperty(contentWrapper, 'scrollHeight', {
			configurable: true,
			value: 420
		});

		ResizeObserverMock.trigger(contentWrapper);
		await tick();
		expect(container.querySelector('[data-testid="scroll-content"]')).not.toBeNull();
		runAnimationFrame(0);
		await tick();
		runAnimationFrame(1000);
		await tick();
		expect(scrollContainer.scrollTop).toBe(0);

		Object.defineProperty(scrollContainer, 'clientHeight', {
			configurable: true,
			value: 180
		});

		ResizeObserverMock.trigger(scrollContainer);
		await tick();
		await tick();

		runAnimationFrame(0);
		await tick();
		runAnimationFrame(1000);
		await tick();

		expect(scrollContainer.scrollTop).toBeGreaterThan(0);
	});

	it('accumulates fractional scroll deltas for slower screens like the leaderboards', async () => {
		render(TvScrollerHarness, {
			props: {
				active: true,
				itemCount: 10,
				speed: 16
			}
		});

		const contentWrapper = screen.getByTestId('scroll-content').parentElement as HTMLDivElement;
		const scrollContainer = contentWrapper.parentElement as HTMLDivElement;

		Object.defineProperty(scrollContainer, 'clientHeight', {
			configurable: true,
			value: 180
		});
		Object.defineProperty(contentWrapper, 'scrollHeight', {
			configurable: true,
			value: 420
		});

		ResizeObserverMock.trigger(contentWrapper);
		await tick();
		await tick();

		for (let frame = 0; frame < 10; frame += 1) {
			runAnimationFrame(16);
			await tick();
		}

		expect(scrollContainer.scrollTop).toBeGreaterThan(0);
	});
});

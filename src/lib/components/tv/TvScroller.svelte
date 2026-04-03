<!-- src/lib/components/tv/TvScroller.svelte -->
<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import type { Snippet } from 'svelte';
	import { saveScrollPosition, getScrollPosition } from '$lib/stores/tv-scroll';

	interface Props {
		screenId: string;
		active: boolean;
		speed?: number;
		children: Snippet;
	}

	let { screenId, active, speed = 30, children }: Props = $props();

	let containerEl: HTMLDivElement | null = $state(null);
	let contentEl: HTMLDivElement | null = $state(null);
	let needsScroll = $state(false);
	let rafId: number | null = null;
	let lastFrameTime: number | null = null;
	let pauseTimeout: ReturnType<typeof setTimeout> | null = null;
	let scrollPosition = 0;

	function getMaxScroll(): number {
		if (!containerEl || !contentEl) return 0;
		return Math.max(0, contentEl.scrollHeight - containerEl.clientHeight);
	}

	function checkOverflow(): void {
		const maxScroll = getMaxScroll();
		if (scrollPosition > maxScroll) {
			scrollPosition = maxScroll;
		}
		if (containerEl && containerEl.scrollTop > maxScroll) {
			containerEl.scrollTop = maxScroll;
		}
		needsScroll = maxScroll > 10;
	}

	function scheduleOverflowCheck(): void {
		void tick().then(() => {
			if (!containerEl || !contentEl) return;
			checkOverflow();
		});
	}

	function startScrolling(): void {
		if (rafId !== null) return;

		// Restore saved position (with content height sanity check)
		const saved = getScrollPosition(screenId);
		if (containerEl && saved) {
			const currentHeight = contentEl?.scrollHeight ?? 0;
			const heightChanged = saved.contentHeight > 0 &&
				Math.abs(currentHeight - saved.contentHeight) / saved.contentHeight > 0.2;

			if (heightChanged) {
				// Content changed significantly — start from top
				containerEl.scrollTop = 0;
			} else {
				const maxScroll = getMaxScroll();
				containerEl.scrollTop = Math.min(saved.scrollTop, maxScroll);
			}
		}
		scrollPosition = containerEl?.scrollTop ?? 0;

		lastFrameTime = null;

		function tick(now: number): void {
			if (!active) return;
			if (!containerEl) return;

			if (lastFrameTime === null) {
				lastFrameTime = now;
				rafId = requestAnimationFrame(tick);
				return;
			}

			const deltaMs = now - lastFrameTime;
			lastFrameTime = now;

			// Cap delta to prevent jumps after tab-switch
			const cappedDelta = Math.min(deltaMs, 100);
			const pxToScroll = speed * (cappedDelta / 1000);

			const maxScroll = getMaxScroll();
			if (maxScroll <= 0) {
				rafId = requestAnimationFrame(tick);
				return;
			}

			const newTop = scrollPosition + pxToScroll;

			if (newTop >= maxScroll) {
				scrollPosition = maxScroll;
				containerEl.scrollTop = maxScroll;
				// Cancel rAF during pause — restart after timeout
				if (rafId !== null) cancelAnimationFrame(rafId);
				rafId = null;
				pauseTimeout = setTimeout(() => {
					scrollPosition = 0;
					if (containerEl) containerEl.scrollTop = 0;
					lastFrameTime = null;
					if (active && needsScroll) {
						rafId = requestAnimationFrame(tick);
					}
				}, 2000);
				return; // Don't schedule another rAF
			} else {
				scrollPosition = newTop;
				containerEl.scrollTop = scrollPosition;
			}

			rafId = requestAnimationFrame(tick);
		}

		rafId = requestAnimationFrame(tick);
	}

	function stopScrolling(): void {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		if (pauseTimeout !== null) {
			clearTimeout(pauseTimeout);
			pauseTimeout = null;
		}
		lastFrameTime = null;
		scrollPosition = containerEl?.scrollTop ?? 0;

		// Save position with content height
		if (containerEl) {
			saveScrollPosition(screenId, containerEl.scrollTop, contentEl?.scrollHeight ?? 0);
		}
	}

	onDestroy(() => {
		// Save position before component is destroyed
		if (containerEl) {
			saveScrollPosition(screenId, containerEl.scrollTop, contentEl?.scrollHeight ?? 0);
		}
		// Clean up any pending animation frame or timeout
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
		if (pauseTimeout !== null) {
			clearTimeout(pauseTimeout);
			pauseTimeout = null;
		}
	});

	$effect(() => {
		if (active && needsScroll) {
			startScrolling();
		} else {
			stopScrolling();
		}
	});

	// Recalculate when either the content or viewport changes size.
	$effect(() => {
		if (!containerEl || !contentEl) return;

		const observer = new ResizeObserver(() => {
			scheduleOverflowCheck();
		});

		observer.observe(containerEl);
		observer.observe(contentEl);

		scheduleOverflowCheck();
		const frameId = requestAnimationFrame(() => {
			checkOverflow();
		});

		return () => {
			observer.disconnect();
			cancelAnimationFrame(frameId);
		};
	});

	$effect(() => {
		active;
		scheduleOverflowCheck();
	});

</script>

<div
	bind:this={containerEl}
	class="h-full w-full overflow-hidden"
>
	<div bind:this={contentEl}>
		{@render children()}
	</div>
</div>

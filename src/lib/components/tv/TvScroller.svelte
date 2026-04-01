<!-- src/lib/components/tv/TvScroller.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
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
	let pausedAtBottom = false;
	let pauseTimeout: ReturnType<typeof setTimeout> | null = null;

	function getMaxScroll(): number {
		if (!containerEl || !contentEl) return 0;
		return Math.max(0, contentEl.scrollHeight - containerEl.clientHeight);
	}

	function checkOverflow(): void {
		const maxScroll = getMaxScroll();
		needsScroll = maxScroll > 10;
	}

	function startScrolling(): void {
		if (rafId !== null) return;

		// Restore saved position
		const saved = getScrollPosition(screenId);
		if (containerEl && saved > 0) {
			const maxScroll = getMaxScroll();
			containerEl.scrollTop = Math.min(saved, maxScroll);
		}

		lastFrameTime = null;
		pausedAtBottom = false;

		function tick(now: number): void {
			if (!active) return;
			if (!containerEl) return;

			if (lastFrameTime === null) {
				lastFrameTime = now;
				rafId = requestAnimationFrame(tick);
				return;
			}

			if (pausedAtBottom) {
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

			const newTop = containerEl.scrollTop + pxToScroll;

			if (newTop >= maxScroll) {
				containerEl.scrollTop = maxScroll;
				pausedAtBottom = true;
				pauseTimeout = setTimeout(() => {
					if (containerEl) containerEl.scrollTop = 0;
					pausedAtBottom = false;
					lastFrameTime = null;
				}, 2000);
			} else {
				containerEl.scrollTop = newTop;
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
		pausedAtBottom = false;

		// Save position
		if (containerEl) {
			saveScrollPosition(screenId, containerEl.scrollTop);
		}
	}

	$effect(() => {
		if (active && needsScroll) {
			startScrolling();
		} else {
			stopScrolling();
		}
	});

	// Check overflow when content changes
	$effect(() => {
		if (!contentEl) return;

		const observer = new ResizeObserver(() => {
			const prevNeeded = needsScroll;
			checkOverflow();

			// If content height changed significantly while inactive, consider resetting
			if (active && needsScroll && !prevNeeded && containerEl) {
				containerEl.scrollTop = 0;
				saveScrollPosition(screenId, 0);
			}
		});

		observer.observe(contentEl);
		checkOverflow();

		return () => observer.disconnect();
	});

	onMount(() => {
		return () => stopScrolling();
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

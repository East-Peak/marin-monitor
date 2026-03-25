<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import EnvironmentPanel from '$lib/components/panels/EnvironmentPanel.svelte';
	import TidesPanel from '$lib/components/panels/TidesPanel.svelte';
	import ConditionsPanel from '$lib/components/panels/ConditionsPanel.svelte';

	let containerEl = $state<HTMLDivElement | null>(null);
	let scrollTimer: ReturnType<typeof setInterval> | null = null;

	onMount(() => {
		// Auto-scroll the left panel slowly so all content is visible over time
		// Scrolls down, then resets to top in a loop
		scrollTimer = setInterval(() => {
			if (!containerEl) return;
			const maxScroll = containerEl.scrollHeight - containerEl.clientHeight;
			if (maxScroll <= 0) return;

			if (containerEl.scrollTop >= maxScroll - 2) {
				// Reset to top
				containerEl.scrollTop = 0;
			} else {
				// Scroll down 1px per tick (60px/s at 60fps, but setInterval is ~every 50ms = ~20px/s)
				containerEl.scrollTop += 1;
			}
		}, 50);
	});

	onDestroy(() => {
		if (scrollTimer) clearInterval(scrollTimer);
	});
</script>

<div class="h-full flex gap-2 p-2">
	<div bind:this={containerEl} class="flex-1 min-w-0 min-h-0 overflow-hidden" style="scroll-behavior: smooth;">
		<div class="flex flex-col gap-2">
			<EnvironmentPanel />
			<TidesPanel />
		</div>
	</div>
	<div class="w-72 shrink-0 overflow-y-auto">
		<ConditionsPanel />
	</div>
</div>

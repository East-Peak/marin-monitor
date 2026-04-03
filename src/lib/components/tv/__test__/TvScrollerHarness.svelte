<script lang="ts">
	import TvScroller from '../TvScroller.svelte';

	interface Props {
		active?: boolean;
		itemCount?: number;
		speed?: number;
	}

	let { active = true, itemCount = 12, speed = 60 }: Props = $props();
</script>

<div class="h-full">
	<TvScroller screenId="tv-scroller-harness" {active} {speed}>
		<div data-testid="scroll-content">
			{#each Array.from({ length: itemCount }) as _, index}
				<div class="border-b border-zinc-800 py-4 text-sm text-white">Row {index + 1}</div>
			{/each}
		</div>
	</TvScroller>
</div>

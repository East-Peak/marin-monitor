<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		active: boolean;
		children: Snippet;
	}

	let { active, children }: Props = $props();
	let hasBeenActive = $state(false);

	// Once a screen has been active, keep it mounted forever (hidden via CSS)
	$effect(() => {
		if (active) hasBeenActive = true;
	});
</script>

{#if hasBeenActive}
	<div
		class="tv-screen absolute inset-0 flex flex-col"
		class:tv-screen-active={active}
		class:tv-screen-hidden={!active}
	>
		{@render children()}
	</div>
{/if}

<style>
	.tv-screen-active {
		visibility: visible;
		z-index: 1;
		animation: screen-fade-in 0.5s ease-out;
	}

	.tv-screen-hidden {
		visibility: hidden;
		z-index: 0;
	}

	@keyframes screen-fade-in {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>

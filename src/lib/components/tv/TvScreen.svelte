<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		active: boolean;
		children: Snippet;
	}

	let { active, children }: Props = $props();
</script>

{#if active}
	<div class="tv-screen absolute inset-0 flex flex-col">
		{@render children()}
	</div>
{/if}

<style>
	.tv-screen {
		animation: screen-fade-in 0.5s ease-out;
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

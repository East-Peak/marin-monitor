<script lang="ts">
	import { DESKTOP_JUMP_TARGETS, JUMP_TARGETS } from '$lib/dashboard/fragment-nav';

	let { onjump, desktop = false }: { onjump: (hash: string) => void; desktop?: boolean } = $props();
	const targets = $derived(desktop ? DESKTOP_JUMP_TARGETS : JUMP_TARGETS);
</script>

<nav class={desktop ? 'v2-jump-desk' : 'v2-jump-nav'} aria-label="Jump to">
	<ul>
		{#each targets as target (target.hash)}
			<li>
				<!-- A real anchor: the hash changes and history works; onjump opens a collapsed target
				     (also when the same item is tapped twice, which fires no hashchange). -->
				<a href={target.hash} data-text-role="label" onclick={() => onjump(target.hash)}
					>{target.label}</a
				>
			</li>
		{/each}
	</ul>
</nav>

<style>
	.v2-jump-nav {
		display: none;
	}
	.v2-jump-desk ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0 1.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.v2-jump-desk a {
		display: inline-flex;
		align-items: center;
		min-height: 2rem;
		color: var(--text-muted);
		text-decoration: none;
	}
	.v2-jump-desk a:hover,
	.v2-jump-desk a:focus-visible {
		color: var(--text-primary);
	}
	@media (max-width: 1023px) {
		/* The render boundary's CSS half: desktop only. */
		.v2-jump-desk {
			display: none;
		}
	}
	@media (max-width: 767px) {
		.v2-jump-nav {
			display: block;
			position: fixed;
			inset: auto 0 0 0;
			z-index: 40;
			padding: 0.25rem 0.5rem calc(0.25rem + env(safe-area-inset-bottom));
			border-top: 1px solid var(--border-light);
			background: var(--bg);
		}
		ul {
			display: flex;
			justify-content: space-around;
			margin: 0;
			padding: 0;
			list-style: none;
		}
		a {
			display: inline-flex;
			align-items: center;
			min-height: 2.75rem;
			padding: 0 0.75rem;
			color: var(--text-primary);
			text-decoration: none;
		}
	}
</style>

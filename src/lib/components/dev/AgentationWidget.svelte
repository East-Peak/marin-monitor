<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { dev } from '$app/environment';
	import type { ComponentType } from 'react';
	import type { Root } from 'react-dom/client';

	const ENDPOINT = 'http://localhost:4747';
	let container: HTMLDivElement;
	let root: Root | null = null;

	// Only load when ?agentation is in the URL (avoids ERR_CONNECTION_REFUSED spam)
	function isEnabled(): boolean {
		if (typeof window === 'undefined') return false;
		return new URL(window.location.href).searchParams.has('agentation');
	}

	onMount(async () => {
		if (!dev || !isEnabled()) return;

		try {
			const React = await import('react');
			const ReactDOM = await import('react-dom/client');
			const { Agentation } = (await import('agentation')) as {
				Agentation: ComponentType<{ endpoint: string }>;
			};

			root = ReactDOM.createRoot(container);
			root.render(
				React.createElement(Agentation, {
					endpoint: ENDPOINT
				})
			);
		} catch (e) {
			console.warn('[Agentation] Failed to load:', e);
		}
	});

	onDestroy(() => {
		root?.unmount();
	});
</script>

{#if dev}
	<div bind:this={container}></div>
{/if}

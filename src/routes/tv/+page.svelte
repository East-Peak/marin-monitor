<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { TvWallboard } from '$lib/components/tv';

	onMount(() => {
		document.body.style.overflow = 'hidden';
		document.body.style.margin = '0';
		document.body.style.padding = '0';
	});

	onDestroy(() => {
		document.body.style.overflow = '';
		document.body.style.margin = '';
		document.body.style.padding = '';
	});
</script>

<svelte:head>
	<title>Marin Monitor — TV</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<TvWallboard />

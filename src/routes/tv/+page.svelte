<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { TvWallboard } from '$lib/components/tv';

	let originalBodyStyles = {
		overflow: '',
		margin: '',
		padding: ''
	};

	onMount(() => {
		originalBodyStyles = {
			overflow: document.body.style.overflow,
			margin: document.body.style.margin,
			padding: document.body.style.padding
		};
		document.body.style.overflow = 'hidden';
		document.body.style.margin = '0';
		document.body.style.padding = '0';
	});

	onDestroy(() => {
		if (browser) {
			document.body.style.overflow = originalBodyStyles.overflow;
			document.body.style.margin = originalBodyStyles.margin;
			document.body.style.padding = originalBodyStyles.padding;
		}
	});
</script>

<svelte:head>
	<title>Marin Monitor — TV</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<TvWallboard />

<script lang="ts">
	import { TvWallboard } from '$lib/components/tv';
</script>

<svelte:head>
	<title>Marin Monitor — TV</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<TvWallboard />

<style>
	:global(body) {
		overflow: hidden;
		margin: 0;
		padding: 0;
	}
</style>

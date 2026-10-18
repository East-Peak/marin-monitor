<!-- src/routes/map/+page.svelte: Explore mode (MAPX3). -->
<script lang="ts">
	import ExploreMap from '$lib/components/dashboard-v2/ExploreMap.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<ExploreMap snapshot={data.snapshot} renderedAt={data.renderedAt} />

<!-- src/routes/+page.svelte -->
<script lang="ts">
	import DashboardHead from '$lib/components/dashboard/DashboardHead.svelte';
	import DashboardV2 from '$lib/components/dashboard-v2/DashboardV2.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<DashboardHead />

<DashboardV2
	snapshot={data.snapshot}
	advisories={data.advisories}
	renderedAt={data.renderedAt}
	lifestyle={data.lifestyle}
/>

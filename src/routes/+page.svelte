<!-- src/routes/+page.svelte -->
<script lang="ts">
	import DashboardHead from '$lib/components/dashboard/DashboardHead.svelte';
	import DashboardV2 from '$lib/components/dashboard-v2/DashboardV2.svelte';
	import type { PageData } from './$types';

	// The layout is resolved on the server (spec §13.6). Exactly one controller mounts,
	// so the legacy loaders (onMount in LegacyDashboard) never start under v2.
	let { data }: { data: PageData } = $props();
</script>

<DashboardHead choice={{ layout: data.layout, explicit: data.explicit }} />

{#if data.layout === 'v2'}
	<DashboardV2
		snapshot={data.snapshot}
		advisories={data.advisories}
		renderedAt={data.renderedAt}
		lifestyle={data.lifestyle}
	/>
{:else if data.LegacyDashboard}
	<data.LegacyDashboard bootstrap={data.bootstrap} />
{/if}

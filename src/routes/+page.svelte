<!-- src/routes/+page.svelte -->
<script lang="ts">
	import LegacyDashboard from '$lib/components/dashboard/LegacyDashboard.svelte';
	import DashboardV2 from '$lib/components/dashboard-v2/DashboardV2.svelte';
	import type { PageData } from './$types';

	// The layout is resolved on the server (spec §13.6). Exactly one controller mounts,
	// so the legacy loaders (onMount in LegacyDashboard) never start under v2.
	let { data }: { data: PageData } = $props();
</script>

{#if data.layout === 'v2'}
	<DashboardV2 />
{:else}
	<LegacyDashboard bootstrap={data.bootstrap} />
{/if}

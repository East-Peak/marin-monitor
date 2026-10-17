<!-- One <head> for whichever layout renders, so v2 and legacy share title, description and
     link-preview tags. Only the default layout is indexable (DASH-FLIP2). -->
<script lang="ts">
	import { dashboardRobots, type DashboardLayoutChoice } from '$lib/dashboard/layout-flag';

	let { choice }: { choice: DashboardLayoutChoice } = $props();

	const DESCRIPTION =
		'Everything happening in Marin County — news, weather, tides, traffic, and the occasional coyote sighting.';
	const robots = $derived(dashboardRobots(choice));
</script>

<svelte:head>
	<title>Marin Monitor</title>
	<meta name="description" content={DESCRIPTION} />
	<meta property="og:title" content="Marin Monitor" />
	<meta property="og:description" content={DESCRIPTION} />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://marinmonitor.com" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="Marin Monitor" />
	<meta name="twitter:description" content={DESCRIPTION} />
	{#if robots.noindex}
		<meta name="robots" content="noindex" />
	{/if}
	{#if robots.canonical}
		<link rel="canonical" href={robots.canonical} />
	{/if}
</svelte:head>

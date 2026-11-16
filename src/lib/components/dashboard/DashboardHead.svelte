<!-- The dashboard's <head>: title, description and link-preview tags. Every URL of `/`, a stale
     `?layout=` link included, names the root as its canonical page. -->
<script lang="ts">
	const DESCRIPTION =
		'Everything happening in Marin County — news, weather, tides, traffic, and the occasional coyote sighting.';
	const CANONICAL_URL = 'https://marinmonitor.com/';
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
	<link rel="canonical" href={CANONICAL_URL} />
</svelte:head>

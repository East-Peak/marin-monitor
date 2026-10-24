<!-- Inter and Geist Mono, for the pages that still use them (the legacy dashboard's popups, the
     TV's leaderboards). Not in app.html (MOBILE1): a cross-origin stylesheet there blocked every
     page's first paint, though v2, /map and /cost set none of their text in either. -->
<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

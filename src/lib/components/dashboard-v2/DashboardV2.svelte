<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import TownPicker from '$lib/components/layout/TownPicker.svelte';
	import SettingsMenu from './SettingsMenu.svelte';
	import Section from './Section.svelte';
	import JumpNav from './JumpNav.svelte';
	import './v2-tokens.css';
	import { sectionPrefs } from '$lib/stores/section-prefs';
	import { createSectionOpenState } from '$lib/dashboard/section-open';
	import { openAndFocus } from '$lib/dashboard/fragment-nav';
	import { createDashboardV2Controller, V2_REFRESH_MS } from '$lib/dashboard/v2-controller';
	import type { SectionId } from '$lib/dashboard/section-prefs';

	/** Below the map, in page order (spec §2.7). Getting Around sits directly under the map. */
	const SECTIONS: { id: SectionId; title: string }[] = [
		{ id: 'outdoors', title: 'Outdoors & Conditions' },
		{ id: 'news', title: 'News & Civic' },
		{ id: 'cost', title: 'Cost & Character' },
		{ id: 'events', title: 'Events & Sports' },
		{ id: 'strava', title: 'Strava' }
	];
	const LATER = 'This part of the preview arrives in a later release.';

	// SSR renders "false"; tests and later sections use this to know the page is interactive.
	let hydrated = $state(false);
	const sections = createSectionOpenState(sectionPrefs);
	const open = sections.open;

	// The one owner of this page's data (spec §13.7); aborted when the page goes away.
	const lifetime = new AbortController();
	const controller = browser ? createDashboardV2Controller({ signal: lifetime.signal }) : null;

	/** Jump-nav, fragment links and back/forward: open a collapsed target, then focus it (§8). */
	function jump(hash: string) {
		void openAndFocus(hash, (id) => sections.openTransient(id));
	}
	/** A tap on a new hash arrives as a hashchange; only a re-tap of the current one needs a direct jump. */
	function navJump(hash: string) {
		if (window.location.hash === hash) jump(hash);
	}

	onMount(() => {
		sections.resolve(window.location.hash, window.innerWidth);
		hydrated = true;
		if (window.location.hash) jump(window.location.hash);
		const onHashChange = () => jump(window.location.hash);
		window.addEventListener('hashchange', onHashChange);
		const onVisible = () => {
			if (document.visibilityState === 'visible') void controller?.refresh();
		};
		document.addEventListener('visibilitychange', onVisible);
		void controller?.start();
		const timer = setInterval(() => void controller?.refresh(), V2_REFRESH_MS);
		return () => {
			lifetime.abort();
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('hashchange', onHashChange);
		};
	});
</script>

<svelte:head>
	<title>Marin Monitor — dashboard preview</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div
	class="dash-v2"
	id="top"
	tabindex="-1"
	data-layout="v2"
	data-hydrated={hydrated ? 'true' : 'false'}
>
	<header class="v2-header">
		<a class="v2-logo" href="/?layout=v2" data-text-role="brand">Marin Monitor</a>
		<div class="v2-scope" role="group" aria-labelledby="v2-scope-label">
			<span class="v2-scope-label" id="v2-scope-label" data-text-role="label">Showing:</span>
			<span data-text-role="control"><TownPicker /></span>
		</div>
		<span data-text-role="control"><SettingsMenu onreset={() => sections.clearTransient()} /></span>
		<span class="v2-badge" data-text-role="meta">v2 preview</span>
		<a class="v2-leave" href="/" data-text-role="label">Leave preview</a>
	</header>

	<main class="v2-main">
		<div class="v2-slot" data-slot="advisories"></div>
		<div class="v2-slot" data-slot="brief"></div>

		<section id="map" class="v2-region" tabindex="-1" aria-labelledby="v2-map-title">
			<h2 id="v2-map-title" class="v2-region-title" data-text-role="section-title">
				Map & latest reporting
			</h2>
			<p class="v2-muted" data-text-role="body">{LATER}</p>
		</section>

		<Section
			id="getting-around"
			title="Getting Around"
			open={$open['getting-around']}
			ontoggle={(id) => sections.toggle(id)}
		>
			<p class="v2-muted" data-text-role="body">{LATER}</p>
		</Section>

		<div id="sections" class="v2-sections" tabindex="-1" aria-label="Sections">
			{#each SECTIONS as s (s.id)}
				<Section
					id={s.id}
					title={s.title}
					open={$open[s.id]}
					ontoggle={(id) => sections.toggle(id)}
				>
					<p class="v2-muted" data-text-role="body">{LATER}</p>
				</Section>
			{/each}
		</div>

		<footer class="v2-footer">
			<p data-text-role="meta">
				An early preview of the redesigned dashboard. The regular dashboard is unchanged.
			</p>
		</footer>
	</main>

	<JumpNav onjump={navJump} />
</div>

<style>
	.dash-v2 {
		min-height: 100vh;
		background: var(--bg);
		color: var(--text-primary);
	}
	.dash-v2:focus {
		outline: none;
	}
	.v2-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border-light);
	}
	.v2-logo {
		color: var(--text-primary);
		text-decoration: none;
	}
	.v2-scope {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.v2-scope-label,
	.v2-leave,
	.v2-muted,
	.v2-footer {
		color: var(--text-muted);
	}
	.v2-badge {
		padding: 2px 8px;
		border: 1px solid var(--accent);
		border-radius: 999px;
		color: var(--accent);
	}
	.v2-leave {
		margin-left: auto;
	}
	.v2-main {
		max-width: 72rem;
		margin: 0 auto;
		padding: 1rem;
	}
	.v2-slot:empty {
		display: none;
	}
	.v2-region {
		padding: var(--v2-card-padding) 0;
	}
	.v2-region:focus,
	.v2-sections:focus {
		outline: none;
	}
	.v2-region-title {
		margin: 0;
	}
	.v2-muted,
	.v2-footer p {
		margin: 0.25rem 0 0;
	}
	.v2-footer {
		padding: 1.5rem 0 0.5rem;
	}
	@media (max-width: 767px) {
		/* Room for the fixed jump-nav plus the bottom safe area. */
		.v2-main {
			padding-bottom: calc(4.5rem + env(safe-area-inset-bottom));
		}
	}
</style>

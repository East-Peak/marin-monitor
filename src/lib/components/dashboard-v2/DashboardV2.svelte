<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import TownPicker from '$lib/components/layout/TownPicker.svelte';
	import SettingsMenu from './SettingsMenu.svelte';
	import Section from './Section.svelte';
	import JumpNav from './JumpNav.svelte';
	import BriefRow from './BriefRow.svelte';
	import CamStrip from './CamStrip.svelte';
	import CamWall from './CamWall.svelte';
	import AdvisoryRow from './AdvisoryRow.svelte';
	import GettingAround from './GettingAround.svelte';
	import Outdoors from './Outdoors.svelte';
	import HealthIndicator from './HealthIndicator.svelte';
	import { townFilter, townLocation } from '$lib/stores/town-filter';
	import { readable } from 'svelte/store';
	import V2Map from './V2Map.svelte';
	import LatestReporting from './LatestReporting.svelte';
	import { latestReportingView } from '$lib/dashboard/latest-reporting';
	import { v2MapData } from '$lib/dashboard/v2-map-data';
	import { briefPending } from '$lib/dashboard/v2-probe';
	import type { BriefState } from '$lib/dashboard/brief-store';
	import { gettingAroundView, type TransitState } from '$lib/dashboard/getting-around';
	import { OUTDOORS_DATASETS, outdoorsView } from '$lib/dashboard/outdoors';
	import type { MarineForecastRead } from '$lib/api/marin/marine';
	import type { FireRead } from '$lib/api/marin/calfire';
	import type { EarthquakeRead } from '$lib/api/marin/usgs';
	import type { DatasetFetch } from '$lib/dashboard/source-adapters';
	import type { TrafficCorridorsData } from '$lib/api/marin/traffic-corridors';
	import type { AirportStatusData } from '$lib/types/airport';
	import { activeLayers } from '$lib/stores/map';
	import type { SourceStatusEntry } from '$lib/dashboard/source-status';
	import type { NewsSnapshotView } from '$lib/news/snapshot';
	import type { NewsItem } from '$lib/types';
	import { createClock } from '$lib/dashboard/clock';
	import './v2-tokens.css';
	import { sectionPrefs } from '$lib/stores/section-prefs';
	import { createSectionOpenState } from '$lib/dashboard/section-open';
	import { openAndFocus } from '$lib/dashboard/fragment-nav';
	import { createDashboardV2Controller, V2_REFRESH_MS } from '$lib/dashboard/v2-controller';
	import { isDesktopViewport, sectionFromHash } from '$lib/dashboard/section-prefs';
	import { V2_SECTIONS } from '$lib/dashboard/v2-sections';

	const LATER = 'This part of the preview arrives in a later release.';

	// SSR renders "false"; tests and later sections use this to know the page is interactive.
	let hydrated = $state(false);
	let innerWidth = $state(0);
	/** ≥1024: sections always open, the cam wall under the map. Phone and tablet keep the strip. */
	const desktop = $derived(hydrated && isDesktopViewport(innerWidth));
	const sections = createSectionOpenState(sectionPrefs);
	const open = sections.open;

	// The one owner of this page's data (spec §13.7); aborted when the page goes away.
	const lifetime = new AbortController();
	const controller = browser ? createDashboardV2Controller({ signal: lifetime.signal }) : null;
	const clock = createClock();
	// SSR has no controller: empty readables keep the markup stable until hydration.
	const snapshot = controller?.snapshot ?? readable<NewsSnapshotView | null>(null);
	const sources = controller?.sources ?? readable<SourceStatusEntry[]>([]);
	const fixIt = controller?.fixIt ?? readable<NewsItem[] | null>(null);
	const quakes = controller?.earthquakes ?? readable<NewsItem[]>([]);
	const briefState = controller?.brief ?? readable<BriefState | null>(null);
	const transitState = controller?.transit ?? readable<TransitState>({ reads: null, error: null });
	const airport = controller?.airport ?? readable<AirportStatusData | null>(null);
	const traffic = controller?.traffic ?? readable<TrafficCorridorsData | null>(null);
	const marine = controller?.marine ?? readable<MarineForecastRead | null>(null);
	const fires = controller?.fires ?? readable<FireRead | null>(null);
	const quakesWeek = controller?.quakesWeek ?? readable<EarthquakeRead | null>(null);
	const outcomes =
		controller?.datasetOutcomes ?? readable<Readonly<Record<string, DatasetFetch>>>({});
	/** Getting Around's one view per tick; closed, its header still reads transit (Decision 9). */
	const around = $derived(
		gettingAroundView({
			transit: $transitState,
			airport: $airport,
			traffic: $traffic,
			outcomes: $outcomes,
			open: desktop || $open['getting-around'],
			now: $clock
		})
	);
	/** The section's body mounts on open: its details load then (§13.7). */
	function openAround() {
		void controller?.ensure('airport');
		void controller?.ensure('traffic');
	}
	/** Outdoors reads the brief's own forecast and tides, plus its three detail reads. */
	const outdoors = $derived(
		outdoorsView({
			brief: $briefState,
			marine: $marine,
			fires: $fires,
			quakes: $quakesWeek,
			outcomes: $outcomes,
			now: $clock
		})
	);
	function openOutdoors() {
		for (const d of Object.values(OUTDOORS_DATASETS)) void controller?.ensure(d.id);
	}
	/** Below the map, in page order; Outdoors is rendered on its own (desktop pairs it with Getting Around). */
	const restSections = V2_SECTIONS.filter((s) => s.id !== 'outdoors');
	const outdoorsTitle =
		V2_SECTIONS.find((s) => s.id === 'outdoors')?.title ?? 'Outdoors & Conditions';
	/** One selection per tick; later sections can read its shownIds. */
	const latest = $derived(
		latestReportingView({ view: $snapshot, sources: $sources, town: $townFilter, now: $clock })
	);
	/** The map's own data: only what this controller established (Codex r3 #1). */
	const mapData = $derived(
		v2MapData({
			view: $snapshot,
			fixIt: $fixIt,
			earthquakes: $quakes,
			sources: $sources,
			activeLayers: $activeLayers,
			town: $townFilter,
			now: $clock
		})
	);
	/** The probe's settlement list also waits for the brief cards above the map (Codex r4 #3). */
	const settledData = $derived({
		...mapData,
		loading: [...mapData.loading, ...($briefState ? briefPending($briefState) : [])]
	});

	/** Jump-nav, fragment links and back/forward: open a collapsed target, then focus it (§8). */
	function jump(hash: string) {
		void openAndFocus(hash, (id) => sections.openTransient(id));
	}
	/**
	 * A jump-nav tap. A re-tap of the current hash fires no hashchange, so it jumps here.
	 * A new hash opens its section now, before the browser's own fragment navigation
	 * focuses the section (§8: open before focus); the hashchange then focuses the toggle.
	 */
	function navJump(hash: string) {
		if (window.location.hash === hash) return jump(hash);
		const id = sectionFromHash(hash);
		if (id) sections.openTransient(id);
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
		// The brief is for the grid point of the selected town's preset (Decision 7).
		const stopTown = townLocation.subscribe((preset) => controller?.setLocation(preset));
		void controller?.start();
		const timer = setInterval(() => void controller?.refresh(), V2_REFRESH_MS);
		return () => {
			stopTown();
			lifetime.abort();
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('hashchange', onHashChange);
		};
	});
</script>

<svelte:window bind:innerWidth />

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
		<span data-text-role="control"
			><SettingsMenu onreset={() => sections.clearTransient(window.innerWidth)} /></span
		>
		<span class="v2-badge" data-text-role="meta">v2 preview</span>
		{#if controller && hydrated}
			<HealthIndicator
				report={controller.healthReport}
				outcomes={controller.datasetOutcomes}
				now={clock}
			/>
		{/if}
		<a class="v2-leave" href="/" data-text-role="label">Leave preview</a>
	</header>

	<main class="v2-main">
		{#if controller && hydrated}
			<AdvisoryRow feed={controller.advisories} now={clock} />
			<BriefRow brief={controller.brief} now={clock} onjump={navJump} />
			{#if !desktop}
				<CamStrip now={$clock} />
			{/if}
		{/if}

		<section id="map" class="v2-region" tabindex="-1" aria-labelledby="v2-map-title">
			<h2 id="v2-map-title" class="v2-region-title" data-text-role="section-title">
				Map & latest reporting
			</h2>
			{#if controller && hydrated}
				<div class="v2-map-row">
					<V2Map data={settledData} now={$clock} />
					<LatestReporting view={latest} now={$clock} />
				</div>
			{/if}
		</section>

		{#if desktop}
			<CamWall now={$clock} />
		{/if}

		{#snippet gettingAroundSection(cls: string)}
			<Section
				id="getting-around"
				title="Getting Around"
				open={desktop || $open['getting-around']}
				ontoggle={(id) => sections.toggle(id)}
				status={controller && hydrated ? around.status : null}
				now={$clock}
				collapsible={!desktop}
				class={cls}
			>
				{#if controller && hydrated}
					<GettingAround view={around} onopen={openAround} />
				{:else}
					<p class="v2-muted" data-text-role="meta">Loading…</p>
				{/if}
			</Section>
		{/snippet}
		{#snippet outdoorsSection(cls: string)}
			<Section
				id="outdoors"
				title={outdoorsTitle}
				open={desktop || $open.outdoors}
				ontoggle={(id) => sections.toggle(id)}
				status={controller && hydrated ? outdoors.status : null}
				now={$clock}
				collapsible={!desktop}
				class={cls}
			>
				{#if controller && hydrated}
					<Outdoors view={outdoors} now={$clock} onopen={openOutdoors} />
				{:else}
					<p class="v2-muted" data-text-role="meta">Loading…</p>
				{/if}
			</Section>
		{/snippet}

		{#if desktop}
			<!-- Desktop: Outdoors (span 7) beside Getting Around (span 5); stacked below 1280 px. -->
			<div class="v2-pair">
				{@render gettingAroundSection('v2-a-ga')}
				{@render outdoorsSection('v2-a-out')}
			</div>
		{:else}
			{@render gettingAroundSection('')}
		{/if}

		<div id="sections" class="v2-sections" tabindex="-1" aria-label="Sections">
			{#if !desktop}
				{@render outdoorsSection('v2-span-12')}
			{/if}
			{#each restSections as s (s.id)}
				<Section
					id={s.id}
					title={s.title}
					open={desktop || $open[s.id]}
					ontoggle={(id) => sections.toggle(id)}
					collapsible={!desktop}
					class="v2-span-12"
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
		/* Layout tokens from the approved desktop mockup (desktop-v2-mockup.html). */
		--v2-gap: 14px;
		--v2-gutter: clamp(16px, 2.2vw, 44px);
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
	.v2-map-row {
		display: grid;
		gap: 1rem;
		margin-top: 0.5rem;
	}
	@media (min-width: 1280px) {
		/* Desktop: map and Latest reporting share a 3:2 row (§2.4); narrower, they stack. */
		.v2-map-row {
			grid-template-columns: 3fr 2fr;
			gap: var(--v2-gap);
			align-items: start;
		}
	}
	@media (min-width: 1024px) {
		/* Desktop runs full width to 2,240 px; sections sit on a 12-column grid, always open. */
		.v2-header {
			padding: 0.75rem var(--v2-gutter);
		}
		.v2-main {
			max-width: 2240px;
			padding: 0 var(--v2-gutter) 3rem;
		}
		.v2-sections {
			display: grid;
			grid-template-columns: repeat(12, minmax(0, 1fr));
			gap: 28px var(--v2-gap);
		}
		.v2-sections > :global(.v2-span-12),
		.v2-pair > :global(.v2-a-out),
		.v2-pair > :global(.v2-a-ga) {
			grid-column: span 12;
		}
		.v2-pair {
			display: grid;
			grid-template-columns: repeat(12, minmax(0, 1fr));
			gap: 28px var(--v2-gap);
			margin-bottom: 28px;
		}
	}
	@media (min-width: 1280px) {
		/* The mockup's .a-out / .a-ga: Outdoors on the left, Getting Around beside it (DOM keeps GA first). */
		.v2-pair > :global(.v2-a-out) {
			grid-column: 1 / span 7;
			grid-row: 1;
		}
		.v2-pair > :global(.v2-a-ga) {
			grid-column: 8 / span 5;
			grid-row: 1;
		}
		/* In the narrow column Getting Around's three parts stack. */
		.v2-pair > :global(.v2-a-ga .ga) {
			grid-template-columns: minmax(0, 1fr);
		}
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
		/* Keyboard focus and fragment jumps scroll targets clear of the fixed jump-nav (§8). */
		:global(html:has(.dash-v2)) {
			scroll-padding-bottom: calc(4.5rem + env(safe-area-inset-bottom));
		}
	}
</style>

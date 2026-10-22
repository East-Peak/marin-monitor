<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import TownPicker from '$lib/components/layout/TownPicker.svelte';
	import SettingsMenu from './SettingsMenu.svelte';
	import Section from './Section.svelte';
	import JumpNav from './JumpNav.svelte';
	import BriefRow from './BriefRow.svelte';
	import BriefDesktop from './BriefDesktop.svelte';
	import CamStrip from './CamStrip.svelte';
	import CamWall from './CamWall.svelte';
	import AdvisoryRow from './AdvisoryRow.svelte';
	import GettingAround from './GettingAround.svelte';
	import Outdoors from './Outdoors.svelte';
	import CostCharacter from './CostCharacter.svelte';
	import LifestyleCard from './LifestyleCard.svelte';
	import NewsCivic from './NewsCivic.svelte';
	import EventsSports from './EventsSports.svelte';
	import LatelyBand from './LatelyBand.svelte';
	import SourcesFooter from './SourcesFooter.svelte';
	import { CIVIC_DATASETS, newsCivicView } from '$lib/dashboard/news-civic';
	import { EVENTS_DATASETS, eventsView } from '$lib/dashboard/events';
	import { latelyView } from '$lib/dashboard/lately';
	import type { HealthReportJson } from '$lib/api/marin/health-report';
	import HealthIndicator from './HealthIndicator.svelte';
	import { townFilter, townLocation } from '$lib/stores/town-filter';
	import { derived, readable, toStore } from 'svelte/store';
	import V2Map from './V2Map.svelte';
	import LatestReporting from './LatestReporting.svelte';
	import { latestReportingView } from '$lib/dashboard/latest-reporting';
	import { createMapFeed, type MapFeed } from '$lib/dashboard/map-feed';
	import { briefPending } from '$lib/dashboard/v2-probe';
	import type { BriefState } from '$lib/dashboard/brief-store';
	import {
		gettingAroundCard,
		gettingAroundView,
		type TransitState
	} from '$lib/dashboard/getting-around';
	import { OUTDOORS_DATASETS, outdoorsView } from '$lib/dashboard/outdoors';
	import { COST_DATASETS, costDatasetIds, costView } from '$lib/dashboard/cost';
	import type { CivicReads, CostReads } from '$lib/dashboard/v2-controller';
	import { gasPriceStore } from '$lib/stores/gas-prices';
	import { coffeeIndexStore } from '$lib/stores/coffee';
	import { fitnessStore } from '$lib/stores/fitness';
	import type { MarineForecastRead } from '$lib/api/marin/marine';
	import type { FireRead } from '$lib/api/marin/calfire';
	import type { AirQualityRead } from '$lib/api/marin/airnow';
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
	import { seededSnapshotEntries } from '$lib/dashboard/source-adapters';
	import {
		isDesktopViewport,
		isPhoneViewport,
		sectionFromHash
	} from '$lib/dashboard/section-prefs';
	import { V2_SECTIONS, type V2Section } from '$lib/dashboard/v2-sections';

	const LATER = 'This part arrives in a later release.';

	let {
		snapshot: serverSnapshot = null,
		renderedAt,
		lifestyle: lifestyleOn = false
	}: {
		/** The server's snapshot read (DASH-FLIP1); null when it failed or ran out of time. */
		snapshot?: NewsSnapshotView | null;
		/** The server's render time: SSR and hydration share one clock. */
		renderedAt?: number;
		/** The Lifestyle Index's server-side flag (LIFE2): its card replaces the composite's. */
		lifestyle?: boolean;
	} = $props();
	// Read once: the page's first paint, not a prop that later drives anything.
	const seed = untrack(() => serverSnapshot);

	// SSR renders "false"; tests and later sections use this to know the page is interactive.
	let hydrated = $state(false);
	let innerWidth = $state(0);
	/** ≥1024: sections always open, the cam wall under the map. Phone and tablet keep the strip. */
	const desktop = $derived(hydrated && isDesktopViewport(innerWidth));
	/** ≥768: the jump row under the header (HARMONIZE1); the phone keeps its bottom bar. */
	const wide = $derived(hydrated && !isPhoneViewport(innerWidth));
	/**
	 * The saved town is read from storage at module init, which SSR cannot see: Latest reporting
	 * and the map are county-wide until mount, then narrow once (SSR output is never personalized).
	 */
	const scopeTown = $derived(hydrated ? $townFilter : null);
	const sections = createSectionOpenState(sectionPrefs);
	const open = sections.open;

	// The one owner of this page's data (spec §13.7); aborted when the page goes away.
	const lifetime = new AbortController();
	const controller = browser
		? createDashboardV2Controller({ signal: lifetime.signal, initialSnapshot: seed })
		: null;
	const clock = createClock(
		undefined,
		undefined,
		untrack(() => renderedAt)
	);
	// SSR has no controller: the server's snapshot (or nothing) keeps the markup stable until hydration.
	const snapshot = controller?.snapshot ?? readable<NewsSnapshotView | null>(seed);
	/** A refresh cycle in flight, as data-cycling: e2e waits for the first to settle (E2E-TIDY2). */
	const cycling = controller?.cycling ?? readable(false);
	const sources =
		controller?.sources ?? readable<SourceStatusEntry[]>(seed ? seededSnapshotEntries(seed) : []);
	const fixIt = controller?.fixIt ?? readable<NewsItem[] | null>(null);
	const briefState = controller?.brief ?? readable<BriefState | null>(null);
	const transitState = controller?.transit ?? readable<TransitState>({ reads: null, error: null });
	const airport = controller?.airport ?? readable<AirportStatusData | null>(null);
	const traffic = controller?.traffic ?? readable<TrafficCorridorsData | null>(null);
	const marine = controller?.marine ?? readable<MarineForecastRead | null>(null);
	const fires = controller?.fires ?? readable<FireRead | null>(null);
	const quakesWeek = controller?.quakesWeek ?? readable<EarthquakeRead | null>(null);
	const airQuality = controller?.airQuality ?? readable<AirQualityRead | null>(null);
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
	/** The brief's Getting Around status: desktop's card, the phone's line (MAPX1, HARMONIZE1). */
	const aroundCard = $derived(
		gettingAroundCard(around, { transit: $transitState, traffic: $traffic, now: $clock })
	);
	/** The section's body mounts on open: its details load then (§13.7). */
	function openAround() {
		void controller?.ensure('airport');
		void controller?.ensure('traffic');
	}
	/** Outdoors reads the brief's own forecast and tides, plus its four detail reads. */
	const outdoors = $derived(
		outdoorsView({
			brief: $briefState,
			marine: $marine,
			fires: $fires,
			quakes: $quakesWeek,
			air: $airQuality,
			outcomes: $outcomes,
			now: $clock
		})
	);
	// The desktop brief (MAPX1): its trace, tide curve and ocean load as soon as the page is
	// desktop, never waiting on the Outdoors section. The phone never asks for them.
	$effect(() => {
		if (!desktop || !controller) return;
		void controller.enableBriefDetail();
		void controller.ensure(OUTDOORS_DATASETS.marine.id);
		// Resized to below desktop: the detail stops with it (Codex #4).
		return () => controller.disableBriefDetail();
	});
	function openOutdoors() {
		for (const d of Object.values(OUTDOORS_DATASETS)) void controller?.ensure(d.id);
	}
	const costReads =
		controller?.cost ??
		readable<CostReads>({
			composite: null,
			cappuccino: null,
			grocery: null,
			wine: null,
			school: null,
			housing: null,
			lifestyle: null
		});
	/** Cost reads the owner's gas, coffee and fitness essentials plus its own detail reads. */
	const cost = $derived(
		costView({
			...$costReads,
			gas: $gasPriceStore,
			coffee: $coffeeIndexStore,
			fitness: $fitnessStore,
			lifestyleOn,
			outcomes: $outcomes,
			now: $clock
		})
	);
	function openCost() {
		for (const id of costDatasetIds(lifestyleOn)) void controller?.ensure(id);
	}
	/** The phone's Cost is the Lifestyle card alone: it loads only that read. */
	function openLifestyle() {
		void controller?.ensure(COST_DATASETS.lifestyle.id);
	}
	/** Below the map, in page order; Outdoors is rendered on its own (desktop pairs it with Getting Around). */
	const restSections = V2_SECTIONS.filter((s) => s.id !== 'outdoors');
	/** Desktop follows the mockup: Cost, then the Lately band, then News beside Events. */
	const DESKTOP_ORDER = ['cost', 'news', 'events', 'strava'];
	const desktopSections = DESKTOP_ORDER.flatMap((id) => restSections.filter((s) => s.id === id));
	const outdoorsTitle =
		V2_SECTIONS.find((s) => s.id === 'outdoors')?.title ?? 'Outdoors & Conditions';
	/** One selection per tick; later sections can read its shownIds. */
	const latest = $derived(
		latestReportingView({ view: $snapshot, sources: $sources, town: scopeTown, now: $clock })
	);
	const civicReads =
		controller?.civic ?? readable<CivicReads>({ police: null, nps: null, activity: null });
	const healthReport = controller?.healthReport ?? readable<HealthReportJson | null>(null);
	/** News & Civic continues Latest reporting's selection, so the wire never repeats it. */
	const newsCivic = $derived(
		newsCivicView({
			view: $snapshot,
			sources: $sources,
			shownIds: latest.shownIds,
			fixIt: $fixIt,
			police: $civicReads.police,
			nps: $civicReads.nps,
			outcomes: $outcomes,
			now: $clock
		})
	);
	const events = $derived(
		eventsView({ activity: $civicReads.activity, outcomes: $outcomes, now: $clock })
	);
	const lately = $derived(latelyView({ view: $snapshot, sources: $sources, now: $clock }));
	function openNews() {
		for (const d of Object.values(CIVIC_DATASETS)) void controller?.ensure(d.id);
	}
	function openEvents() {
		for (const d of Object.values(EVENTS_DATASETS)) void controller?.ensure(d.id);
	}
	const ready = $derived(!!controller && hydrated);
	function statusOf(id: string) {
		if (!ready) return null;
		if (id === 'news') return newsCivic.status;
		if (id === 'events') return events.status;
		if (id === 'cost' && desktop) return cost.status;
		return null;
	}
	function metaOf(id: string): string | null {
		if (!ready) return null;
		if (id === 'news' && newsCivic.feeds)
			return `${newsCivic.feeds.ok} of ${newsCivic.feeds.total} feeds OK`;
		if (id === 'events' && events.upcoming !== null) return `${events.upcoming} upcoming`;
		return null;
	}
	/**
	 * The map's data and layers (MAPX2b, MAPX2c): only what this controller established (Codex
	 * r3 #1). The layers load wherever the whole map shows, which on the phone is never: its
	 * preview adds no requests, and its full map is /map (MAPX3).
	 */
	let mapFull = $state(false);
	const mapSource = controller
		? createMapFeed(controller, {
				full: toStore(() => mapFull),
				layers: derived(sectionPrefs, (p) => p.layers),
				town: toStore(() => scopeTown),
				clock,
				activeLayers
			})
		: null;
	const mapFeed = mapSource?.feed ?? readable<MapFeed | null>(null);
	/** The probe's settlement list also waits for the brief cards above the map (Codex r4 #3). */
	const settledData = $derived(
		$mapFeed && {
			...$mapFeed.data,
			loading: [...$mapFeed.data.loading, ...($briefState ? briefPending($briefState) : [])]
		}
	);

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
			mapSource?.stop();
			lifetime.abort();
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('hashchange', onHashChange);
		};
	});
</script>

<svelte:window bind:innerWidth />

<div
	class="dash-v2"
	id="top"
	tabindex="-1"
	data-layout="v2"
	data-hydrated={hydrated ? 'true' : 'false'}
	data-cycling={$cycling ? 'true' : 'false'}
>
	<header class="v2-header">
		<a class="v2-logo" href="/" data-text-role="brand">Marin Monitor</a>
		<div class="v2-scope" role="group" aria-labelledby="v2-scope-label">
			<span class="v2-scope-label" id="v2-scope-label" data-text-role="label">Showing:</span>
			<span data-text-role="control"><TownPicker /></span>
		</div>
		<span data-text-role="control"
			><SettingsMenu onreset={() => sections.clearTransient(window.innerWidth)} /></span
		>
		{#if controller && hydrated}
			<HealthIndicator
				report={controller.healthReport}
				outcomes={controller.datasetOutcomes}
				now={clock}
			/>
		{/if}
		<!-- The rollback layout stays reachable until legacy is retired (DASH-FLIP2). -->
		<a class="v2-old" href="/?layout=legacy" data-text-role="label">Old dashboard</a>
	</header>

	{#if wide}
		<div class="v2-jump-row"><JumpNav desktop onjump={navJump} /></div>
	{/if}

	<main class="v2-main">
		{#if controller && hydrated}
			<AdvisoryRow feed={controller.advisories} now={clock} {desktop} />
			{#if desktop && $briefState}
				<BriefDesktop
					brief={$briefState}
					now={$clock}
					ocean={outdoors.surf}
					around={aroundCard}
					onjump={navJump}
				/>
			{:else}
				<BriefRow brief={controller.brief} now={clock} around={aroundCard} onjump={navJump} />
			{/if}
			{#if !desktop}
				<CamStrip now={$clock} headings={controller.camHeadings} />
			{/if}
		{/if}

		<section id="map" class="v2-region" tabindex="-1" aria-labelledby="v2-map-title">
			<h2 id="v2-map-title" class="v2-region-title" data-text-role="section-title">
				Map & latest reporting
			</h2>
			{#if ready || seed}
				<!-- With the server's snapshot, Latest reporting is in the HTML; the map is client-only. -->
				<div class="v2-map-row">
					{#if ready}
						{#if settledData && $mapFeed}
							<V2Map
								data={settledData}
								dataLayers={$mapFeed.dataLayers}
								now={$clock}
								bind:full={mapFull}
							/>
						{/if}
					{/if}
					<LatestReporting view={latest} now={$clock} />
				</div>
			{/if}
		</section>

		{#if desktop}
			<CamWall now={$clock} headings={controller?.camHeadings} />
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

		{#snippet restSection(s: V2Section)}
			<Section
				id={s.id}
				title={s.title}
				open={desktop || $open[s.id]}
				ontoggle={(id) => sections.toggle(id)}
				collapsible={!desktop}
				class={desktop && s.id === 'news'
					? 'v2-a-news'
					: desktop && s.id === 'events'
						? 'v2-a-ev'
						: 'v2-span-12'}
				status={statusOf(s.id)}
				meta={metaOf(s.id)}
				now={$clock}
			>
				{#if ready && s.id === 'news'}
					<NewsCivic view={newsCivic} now={$clock} onopen={openNews} />
					{#if !desktop && lately}
						<LatelyBand view={lately} now={$clock} />
					{/if}
				{:else if ready && s.id === 'events'}
					<EventsSports view={events} now={$clock} onopen={openEvents} />
				{:else if ready && s.id === 'cost' && desktop}
					<!-- Cost's content is desktop-only for now: the phone keeps its height budget (§13.3). -->
					<CostCharacter view={cost} now={$clock} onopen={openCost} />
				{:else if ready && s.id === 'cost' && cost.lifestyle}
					<!-- The phone shows the Lifestyle card alone; its height is tested populated (Decision 10). -->
					<LifestyleCard view={cost.lifestyle} now={$clock} onopen={openLifestyle} />
				{:else if !ready && (s.id === 'news' || s.id === 'events')}
					<p class="v2-muted" data-text-role="meta">Loading…</p>
				{:else}
					<p class="v2-muted" data-text-role="body">{LATER}</p>
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
			{#each desktop ? desktopSections : restSections as s (s.id)}
				{#if desktop && s.id === 'news' && ready && lately}
					<!-- The mockup's Lately band: full width, between Cost and News. -->
					<div class="v2-span-12"><LatelyBand view={lately} now={$clock} /></div>
				{/if}
				{@render restSection(s)}
			{/each}
		</div>

		<footer class="v2-footer">
			<!-- Desktop only, like Cost: the phone has the header's health indicator and its height budget (§13.3). -->
			{#if ready && controller && desktop}
				<SourcesFooter report={healthReport} outcomes={controller.datasetOutcomes} now={$clock} />
			{/if}
		</footer>
	</main>

	{#if !wide}
		<JumpNav onjump={navJump} />
	{/if}
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
	.v2-jump-row {
		padding: 0.25rem var(--v2-gutter);
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
	.v2-old,
	.v2-muted,
	.v2-footer {
		color: var(--text-muted);
	}
	.v2-old {
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
		.v2-sections > :global(.v2-a-news),
		.v2-sections > :global(.v2-a-ev),
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
		/* The mockup's .c-news / .c-ev: News & Civic (span 7) beside Events & Sports (span 5). */
		.v2-sections > :global(.v2-a-news) {
			grid-column: span 7;
		}
		.v2-sections > :global(.v2-a-ev) {
			grid-column: span 5;
		}
		/* In the narrow column Getting Around's three parts stack. */
		.v2-pair > :global(.v2-a-ga .ga) {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.v2-muted {
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

<!-- Explore mode, /map (MAPX3): the v2 map on the whole screen, fed by its own controller. The URL
     holds the view, layers and selection: written as they change, read once on mount. The SSR
     shell (layer names, a loading list and the seeded headlines) holds until hydration. -->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { goto, replaceState } from '$app/navigation';
	import { get, readable, toStore } from 'svelte/store';
	import TownPicker from '$lib/components/layout/TownPicker.svelte';
	import V2Map from './V2Map.svelte';
	import LatestReporting from './LatestReporting.svelte';
	import { createDashboardV2Controller, V2_REFRESH_MS } from '$lib/dashboard/v2-controller';
	import { createMapFeed, type MapFeed } from '$lib/dashboard/map-feed';
	import { createClock } from '$lib/dashboard/clock';
	import { latestReportingView } from '$lib/dashboard/latest-reporting';
	import { seededSnapshotEntries } from '$lib/dashboard/source-adapters';
	import { DATA_LAYERS } from '$lib/dashboard/v2-map-layers';
	import { LAYER_PREF_IDS, type LayerPrefId } from '$lib/dashboard/section-prefs';
	import {
		exploreHref,
		layersOn,
		parseExplore,
		selLayer,
		type ExploreState,
		type ExploreView
	} from '$lib/dashboard/explore-url';
	import { activeLayers, mapStore } from '$lib/stores/map';
	import { sectionPrefs } from '$lib/stores/section-prefs';
	import { townFilter } from '$lib/stores/town-filter';
	import type { NewsSnapshotView } from '$lib/news/snapshot';
	import type { MapLayer } from '$lib/types';
	import './v2-tokens.css';

	let { snapshot = null, renderedAt }: { snapshot?: NewsSnapshotView | null; renderedAt?: number } =
		$props();
	const seed = untrack(() => snapshot);
	const seeded = latestReportingView({
		view: seed,
		sources: seed ? seededSnapshotEntries(seed) : [],
		town: null,
		now: untrack(() => renderedAt) ?? 0
	});
	/** The shell's rail: every layer's name, before any read. */
	const SHELL_LAYERS = ['Fix It Marin (311)', 'Earthquakes', ...DATA_LAYERS.map((l) => l.name)];

	let hydrated = $state(false);
	const lifetime = new AbortController();
	const controller = browser
		? createDashboardV2Controller({ signal: lifetime.signal, initialSnapshot: seed })
		: null;
	const clock = createClock(
		undefined,
		undefined,
		untrack(() => renderedAt)
	);

	/** The URL as read on mount; then what this visit has changed. */
	let initial = $state<ExploreState>({ view: null, layers: null, sel: null });
	let layers = $state<Partial<Record<LayerPrefId, boolean>>>({});
	let sel = $state<string | null>(null);
	let view = $state<ExploreView | null>(null);
	/** The URL chose other layers: they hold for this visit and never overwrite the saved choices. */
	let urlLayers = false;

	let mapFull = $state(false);
	/** The first full read cycle has landed (the seed has been refreshed). */
	let readsSettled = $state(false);
	const mapSource = controller
		? createMapFeed(controller, {
				full: toStore(() => mapFull),
				layers: toStore(() => layers),
				// The saved town filters the list but never moves the map (MAPX3 precedence).
				town: townFilter,
				clock,
				activeLayers
			})
		: null;
	const feed = mapSource?.feed ?? readable<MapFeed | null>(null);

	function writeUrl() {
		const on = LAYER_PREF_IDS.filter((id) => layers[id]);
		replaceState(exploreHref({ view, layers: on, sel }, new URL(location.href).searchParams), {});
	}
	function onlayer(id: LayerPrefId, on: boolean) {
		layers = { ...layers, [id]: on };
		if (!urlLayers) sectionPrefs.setLayer(id, on);
		writeUrl();
	}

	onMount(() => {
		const read = parseExplore(new URL(window.location.href));
		const saved = layersOn(get(sectionPrefs).layers, get(mapStore).activeLayers);
		// The dashboard's own links carry exactly the saved choices; only a link that differs
		// (someone else's view) holds its layers for the visit alone.
		urlLayers =
			read.layers !== null &&
			(read.layers.length !== saved.length || read.layers.some((id) => !saved.includes(id)));
		const on = new Set(read.layers ?? saved);
		// A selection's own layer comes on for the visit: it is in the URL, so it was asked for.
		const needed = read.sel ? selLayer(read.sel) : null;
		if (needed) on.add(needed);
		layers = Object.fromEntries(LAYER_PREF_IDS.map((id) => [id, on.has(id)]));
		initial = read;
		sel = read.sel;
		view = read.view;
		// The story switches are shared with the dashboard: leaving puts them back as they were.
		const before = get(mapStore).activeLayers;
		hydrated = true;
		void controller?.start().then(() => (readsSettled = true));
		const timer = setInterval(() => void controller?.refresh(), V2_REFRESH_MS);
		const onVisible = () => {
			if (document.visibilityState === 'visible') void controller?.refresh();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
			mapSource?.stop();
			lifetime.abort();
			const now = get(mapStore).activeLayers;
			for (const id of Object.keys(before) as MapLayer[])
				if (now[id] !== before[id]) mapStore.toggleLayer(id);
		};
	});
</script>

<svelte:head>
	<title>Map · Marin Monitor</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="explore" data-layout="explore" data-hydrated={hydrated ? 'true' : 'false'}>
	<header class="bar">
		<a class="home" href="/" data-text-role="label">← Dashboard</a>
		<h1 class="title" data-text-role="section-title">Explore the map</h1>
		<span class="scope" data-text-role="control"><TownPicker /></span>
	</header>
	<main class="body">
		{#if hydrated && $feed}
			<V2Map
				mode="explore"
				data={$feed.data}
				dataLayers={$feed.dataLayers}
				now={$clock}
				bind:full={mapFull}
				prefs={layers}
				{onlayer}
				initialView={initial.view}
				initialSel={initial.sel}
				onselect={(id) => {
					sel = id;
					writeUrl();
				}}
				oncamera={(cam) => {
					view = cam;
					writeUrl();
				}}
				onexit={() => goto('/')}
				{readsSettled}
			/>
		{:else}
			<div class="shell">
				<aside class="shell-rail" aria-label="Map layers" data-explore-shell-layers>
					<h2 data-text-role="label">Layers</h2>
					<ul>
						{#each SHELL_LAYERS as name (name)}
							<li data-text-role="body">{name}</li>
						{/each}
					</ul>
				</aside>
				<div class="shell-map" aria-hidden="true"></div>
				<aside class="shell-list" aria-label="In view" data-explore-shell-list>
					<p data-text-role="meta">Loading…</p>
					{#if seed}
						<LatestReporting view={seeded} now={renderedAt ?? 0} />
					{/if}
				</aside>
			</div>
		{/if}
	</main>
</div>

<style>
	.explore {
		display: flex;
		flex-direction: column;
		height: 100vh;
		height: 100dvh;
		background: var(--bg);
		color: var(--text-primary);
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
		padding: 0.5rem 1rem;
		border-bottom: 1px solid var(--border-light);
	}
	.home {
		color: var(--text-primary);
		text-decoration: none;
	}
	.home:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.title {
		margin: 0;
	}
	.scope {
		margin-left: auto;
	}
	.body {
		flex: 1;
		min-height: 0;
	}
	.shell {
		display: grid;
		grid-template-columns: 300px minmax(0, 1fr) 360px;
		height: 100%;
	}
	.shell-rail,
	.shell-list {
		overflow-y: auto;
		padding: 0.75rem;
	}
	.shell-rail {
		border-right: 1px solid var(--border-light);
	}
	.shell-rail h2 {
		margin: 0;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.shell-rail ul {
		margin: 0.5rem 0 0;
		padding: 0;
		list-style: none;
	}
	.shell-rail li {
		padding: 0.25rem 0;
	}
	.shell-list {
		border-left: 1px solid var(--border-light);
	}
	.shell-map {
		background: var(--surface);
	}
	@media (max-width: 1023px) {
		.shell {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto minmax(0, 1fr) auto;
		}
		.shell-rail {
			border-right: 0;
			border-bottom: 1px solid var(--border-light);
		}
		.shell-list {
			border-left: 0;
			border-top: 1px solid var(--border-light);
		}
	}
</style>

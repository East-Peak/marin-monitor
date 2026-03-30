<script lang="ts">
	import { MapContainer, MapDataLayer, SegmentLayer } from '$lib/components/map';
	import { STRAVA_ENABLED } from '$lib/config/strava';
	import TvMapPosition from '$lib/components/tv/TvMapPosition.svelte';
	import TvMapSidebar from '$lib/components/tv/TvMapSidebar.svelte';
	import { allNewsItems } from '$lib/stores';
	import { MARIN_TOWNS } from '$lib/config/towns';
	import { TV_MAP_VIEWS } from '$lib/config/tv';
	import type { FireIncident } from '$lib/api/marin/calfire';
	import type { NewsItem } from '$lib/types';

	interface Props {
		earthquakeItems: NewsItem[];
		fireIncidents: FireIncident[];
		viewId: string;
		weather: { temp: number; wind: string; shortForecast: string } | null;
	}

	let { earthquakeItems, fireIncidents, viewId, weather }: Props = $props();

	const view = $derived(TV_MAP_VIEWS.find((v) => v.id === viewId) ?? TV_MAP_VIEWS[0]);

	// Compute nearby stories reactively
	const lat = $derived(view.center[1]);
	const lon = $derived(view.center[0]);
	const radius = $derived(view.zoom < 11 ? 0.15 : 0.05);

	const nearbyTownSlugs = $derived(new Set(
		MARIN_TOWNS
			.filter((t) => Math.abs(t.lat - lat) < radius && Math.abs(t.lon - lon) < radius)
			.map((t) => t.slug)
	));

	const nearby = $derived.by(() => {
		const maxAge = 7 * 24 * 60 * 60 * 1000;
		const now = Date.now();
		return $allNewsItems.filter((item) => {
			if (now - item.timestamp > maxAge) return false;
			if (typeof item.lat === 'number' && typeof item.lon === 'number') {
				if (Math.abs(item.lat - lat) < radius && Math.abs(item.lon - lon) < radius) return true;
			}
			if (item.townSlug && nearbyTownSlugs.has(item.townSlug)) return true;
			return false;
		});
	});

	const stories = $derived(nearby.filter((i) => !i.isAlert).slice(0, 6));
	const alerts = $derived(nearby.filter((i) => i.isAlert).slice(0, 4));
</script>

<div class="flex h-full min-h-0 overflow-hidden bg-slate-950">
	<div class="relative flex-1 min-h-0 min-w-0">
		<MapContainer>
			<MapDataLayer earthquakes={earthquakeItems} {fireIncidents} />
			{#if STRAVA_ENABLED}
				<SegmentLayer />
			{/if}
			<TvMapPosition center={view.center} zoom={view.zoom} duration={view.duration} />
		</MapContainer>
		<div class="absolute left-4 top-4 z-10 rounded-2xl border border-slate-700/60 bg-slate-950/78 px-4 py-2 backdrop-blur-md shadow-[0_12px_30px_rgba(2,6,23,0.35)]">
			<div class="text-[10px] font-semibold uppercase tracking-[0.28em] text-sky-300/75">Map Focus</div>
			<span class="mt-1 block text-sm font-semibold text-slate-100">{view.label}</span>
		</div>
	</div>
	<div class="h-full shrink-0 border-l border-slate-800/70" style="width: clamp(19rem, 26vw, 24rem);">
		<TvMapSidebar
			regionLabel={view.label}
			{weather}
			{stories}
			{alerts}
			loading={weather === null}
		/>
	</div>
</div>

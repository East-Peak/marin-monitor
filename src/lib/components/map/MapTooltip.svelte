<script lang="ts">
	import { onMount } from 'svelte';
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
	import {
		hoveredTown,
		activeLayers as activeLayerState,
		CATEGORY_TO_LAYER
	} from '$lib/stores/map';
	import { allNewsItems } from '$lib/stores/news';
	import { TOWN_BY_SLUG } from '$lib/config';
	import type { NewsItem } from '$lib/types';

	let tooltipX = $state(0);
	let tooltipY = $state(0);
	let mapWidth = $state(0);
	let mapHeight = $state(0);
	let visible = $state(false);
	let townName = $state('');
	let storyCount = $state(0);
	let exactCount = $state(0);
	let townOnlyCount = $state(0);
	let townItems = $state<NewsItem[]>([]);
	let pinVisible = $state(false);
	let pinData = $state<{
		title: string;
		source: string;
		layer: string;
		locationType: string;
		timestamp: number | null;
	} | null>(null);
	let removeMapListeners: (() => void) | null = null;

	const { getMap, mapReady } = getContext<{
		getMap: () => MapLibreMap | null;
		mapReady: Writable<boolean>;
	}>('maplibre-map');

	function formatAge(timestamp: number): string {
		const deltaMs = Date.now() - timestamp;
		const deltaHours = Math.floor(deltaMs / 3600000);
		if (deltaHours < 1) return 'now';
		if (deltaHours < 24) return `${deltaHours}h`;
		const days = Math.floor(deltaHours / 24);
		return `${days}d`;
	}

	function layerLabel(layer: string): string {
		switch (layer) {
			case 'news':
				return 'Local';
			case 'safety':
				return 'Crime & Safety';
			case 'civic':
				return 'Civic';
			case 'housing':
				return 'Housing';
			case 'activity':
				return 'Activity';
			case 'satire':
				return 'Marin Lately';
			default:
				return layer;
		}
	}

	function tooltipLeft(panelWidth: number): number {
		return Math.min(Math.max(8, tooltipX + 12), Math.max(8, mapWidth - panelWidth - 8));
	}

	function tooltipTop(panelHeight: number): number {
		return Math.min(Math.max(8, tooltipY - 16), Math.max(8, mapHeight - panelHeight - 8));
	}

	$effect(() => {
		const slug = $hoveredTown;
		const activeLayers = $activeLayerState;
		if (!slug) {
			visible = false;
			return;
		}

		const town = TOWN_BY_SLUG[slug];
		if (!town) {
			visible = false;
			return;
		}

		townName = town.name;
		const items = $allNewsItems.filter((item) => {
			if (item.townSlug !== slug) return false;
			const layer = CATEGORY_TO_LAYER[item.category];
			return Boolean(layer && activeLayers[layer]);
		});
		items.sort((a, b) => b.timestamp - a.timestamp);
		townItems = items;
		storyCount = items.length;
		exactCount = items.filter(
			(item) => typeof item.lat === 'number' && typeof item.lon === 'number'
		).length;
		townOnlyCount = storyCount - exactCount;
		visible = true;
	});

	onMount(() => {
		const unsubReady = mapReady.subscribe((ready) => {
			if (!ready) return;
			const map = getMap();
			if (!map) return;
			const mapInstance = map;

			removeMapListeners?.();

			function handleMouseMove(e: MapMouseEvent) {
				tooltipX = e.point.x;
				tooltipY = e.point.y;
				mapWidth = e.target.getCanvas().clientWidth;
				mapHeight = e.target.getCanvas().clientHeight;

				const hoverLayers: string[] = [];
				if (mapInstance.getLayer('news-pins-layer')) {
					hoverLayers.push('news-pins-layer');
				}
				if (mapInstance.getLayer('news-pins-hit-layer')) {
					hoverLayers.push('news-pins-hit-layer');
				}
				if (mapInstance.getLayer('earthquakes-layer')) {
					hoverLayers.push('earthquakes-layer');
				}

				if (hoverLayers.length === 0) {
					pinVisible = false;
					return;
				}

				const box: [[number, number], [number, number]] = [
					[e.point.x - 14, e.point.y - 14],
					[e.point.x + 14, e.point.y + 14]
				];
				const features = mapInstance.queryRenderedFeatures(box, { layers: hoverLayers });
				const feature = features[0];
				if (!feature) {
					pinVisible = false;
					return;
				}

				const props = feature.properties as Record<string, string | number> | undefined;
				if (!props) {
					pinVisible = false;
					return;
				}

				pinData = {
					title: String(props.title ?? ''),
					source: String(props.source ?? (props.magnitude ? 'USGS Earthquake' : 'Unknown source')),
					layer: String(props.layer ?? (props.magnitude ? 'safety' : 'news')),
					locationType: String(props.locationType ?? 'exact'),
					timestamp: Number.isFinite(Number(props.timestamp)) ? Number(props.timestamp) : null
				};
				pinVisible = true;
			}

			function handleMapLeave() {
				pinVisible = false;
			}

			mapInstance.on('mousemove', handleMouseMove);
			mapInstance.on('mouseleave', handleMapLeave);
			removeMapListeners = () => {
				mapInstance.off('mousemove', handleMouseMove);
				mapInstance.off('mouseleave', handleMapLeave);
			};
		});

		return () => {
			unsubReady();
			removeMapListeners?.();
		};
	});
</script>

{#if pinVisible && pinData}
	<div
		class="map-tooltip pin-tooltip"
		style="left: {tooltipLeft(300)}px; top: {tooltipTop(130)}px;"
	>
		<div class="tooltip-town">Pinned Story</div>
		<div class="tooltip-metrics">
			<span>{layerLabel(pinData.layer)}</span>
			<span>{pinData.locationType === 'exact' ? 'exact location' : pinData.locationType}</span>
			{#if pinData.timestamp}
				<span>{formatAge(pinData.timestamp)}</span>
			{/if}
		</div>
		<div class="item-title">{pinData.title}</div>
		<div class="item-meta">{pinData.source}</div>
	</div>
{:else if visible}
	<div class="map-tooltip" style="left: {tooltipLeft(360)}px; top: {tooltipTop(280)}px;">
		<div class="tooltip-town">{townName}</div>
		<div class="tooltip-metrics">
			<span>{storyCount} {storyCount === 1 ? 'story' : 'stories'}</span>
			<span>{exactCount} pinned</span>
			<span>{townOnlyCount} town-level</span>
		</div>
		<div class="tooltip-scope">Pinned = exact coordinates. Town-level = no precise location.</div>

		{#if townItems.length > 0}
			<div class="tooltip-list">
				{#each townItems.slice(0, 6) as item}
					<div class="tooltip-item">
						<span
							class="loc-badge"
							class:exact={typeof item.lat === 'number' && typeof item.lon === 'number'}
						>
							{typeof item.lat === 'number' && typeof item.lon === 'number' ? 'PIN' : 'TOWN'}
						</span>
						<div class="item-main">
							<div class="item-title">{item.title}</div>
							<div class="item-meta">{item.source} · {formatAge(item.timestamp)}</div>
						</div>
					</div>
				{/each}
				{#if townItems.length > 6}
					<div class="tooltip-more">+{townItems.length - 6} more</div>
				{/if}
			</div>
		{:else}
			<div class="tooltip-empty">No active stories for this town.</div>
		{/if}
	</div>
{/if}

<style>
	.map-tooltip {
		position: absolute;
		background: rgba(10, 10, 10, 0.92);
		border: 1px solid var(--border-light);
		padding: 0.5rem 0.65rem;
		border-radius: 4px;
		font-size: 0.62rem;
		pointer-events: none;
		z-index: 20;
		width: 360px;
		max-width: min(360px, calc(100vw - 16px));
		backdrop-filter: blur(4px);
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
	}

	.pin-tooltip {
		width: 300px;
		max-width: min(300px, calc(100vw - 16px));
	}

	.tooltip-town {
		font-weight: 700;
		color: var(--text);
		margin-bottom: 0.2rem;
		font-size: 0.75rem;
	}

	.tooltip-metrics {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		color: var(--text-dim);
		font-size: 0.58rem;
	}

	.tooltip-scope {
		color: var(--text-muted);
		font-size: 0.53rem;
		margin-top: 0.25rem;
		padding-bottom: 0.3rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.tooltip-list {
		margin-top: 0.35rem;
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
	}

	.tooltip-item {
		display: flex;
		gap: 0.35rem;
		align-items: flex-start;
	}

	.loc-badge {
		flex: 0 0 auto;
		min-width: 35px;
		text-align: center;
		padding: 0.08rem 0.22rem;
		border-radius: 3px;
		font-size: 0.5rem;
		font-weight: 700;
		color: var(--text-muted);
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(255, 255, 255, 0.04);
	}

	.loc-badge.exact {
		color: #8cc8ff;
		border-color: rgba(140, 200, 255, 0.5);
		background: rgba(59, 130, 246, 0.18);
	}

	.item-main {
		min-width: 0;
	}

	.item-title {
		color: var(--text);
		font-size: 0.6rem;
		line-height: 1.25;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item-meta {
		color: var(--text-dim);
		font-size: 0.53rem;
		margin-top: 0.04rem;
	}

	.tooltip-more {
		color: var(--text-muted);
		font-size: 0.54rem;
		padding-top: 0.12rem;
	}

	.tooltip-empty {
		color: var(--text-muted);
		font-size: 0.58rem;
		margin-top: 0.35rem;
	}
</style>

<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { get, type Writable } from 'svelte/store';
	import type {
		Map as MapLibreMap,
		GeoJSONSource,
		MapGeoJSONFeature,
		MapMouseEvent
	} from 'maplibre-gl';
	import { stravaSegments, loadLeaderboard } from '$lib/stores/strava';
	import { showSegments } from '$lib/stores/map';
	import type { StravaSegment } from '$lib/types/strava';

	const { getMap, mapReady } = getContext<{
		getMap: () => MapLibreMap | null;
		mapReady: Writable<boolean>;
	}>('maplibre-map');

	let removeStyleLoadListener: (() => void) | null = null;
	let removeInteractionListeners: (() => void) | null = null;
	let interactionsBound = false;
	let activePopup: { remove: () => void } | null = null;
	let popupToken = 0;

	// Layer IDs used by this component
	const SEGMENT_LAYERS = [
		'strava-lines-ride',
		'strava-lines-run',
		'strava-pins',
		'strava-pins-labels'
	] as const;

	const SOURCE_ID = 'strava-segments';

	/**
	 * Decode Google's encoded polyline format into GeoJSON [lon, lat] coordinates.
	 * Strava returns [lat, lon] but GeoJSON needs [lon, lat].
	 */
	function decodePolyline(encoded: string): [number, number][] {
		const coords: [number, number][] = [];
		let index = 0,
			lat = 0,
			lon = 0;
		while (index < encoded.length) {
			let shift = 0,
				result = 0,
				byte: number;
			do {
				byte = encoded.charCodeAt(index++) - 63;
				result |= (byte & 0x1f) << shift;
				shift += 5;
			} while (byte >= 0x20);
			lat += result & 1 ? ~(result >> 1) : result >> 1;
			shift = 0;
			result = 0;
			do {
				byte = encoded.charCodeAt(index++) - 63;
				result |= (byte & 0x1f) << shift;
				shift += 5;
			} while (byte >= 0x20);
			lon += result & 1 ? ~(result >> 1) : result >> 1;
			coords.push([lon / 1e5, lat / 1e5]);
		}
		return coords;
	}

	function formatTime(timeStr: string): string {
		// Time comes as "HH:MM:SS" or "MM:SS" — just pass through
		return timeStr;
	}

	function formatDistance(meters: number): string {
		const miles = meters / 1609.34;
		return `${miles.toFixed(1)} mi`;
	}

	function buildStatsParts(
		distance: number | null | undefined,
		elevationGain: number | null | undefined,
		avgGrade: number | null | undefined
	): string[] {
		const parts: string[] = [];
		if (distance != null && distance > 0) {
			parts.push(formatDistance(distance));
		}
		if (elevationGain != null && elevationGain > 0) {
			parts.push(`${elevationGain.toFixed(0)}m gain`);
		}
		if (avgGrade != null && Math.abs(avgGrade) > 0.05) {
			parts.push(`${avgGrade.toFixed(1)}% avg`);
		}
		return parts;
	}

	function escapeHtml(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function buildFeatures(segments: StravaSegment[]): GeoJSON.Feature[] {
		const features: GeoJSON.Feature[] = [];

		for (const seg of segments) {
			if (seg.polyline) {
				// LineString for segments with polyline data
				const coords = decodePolyline(seg.polyline);
				if (coords.length >= 2) {
					features.push({
						type: 'Feature',
						properties: {
							id: seg.id,
							name: seg.name,
							activityType: seg.activityType,
							distance: seg.distance,
							elevationGain: seg.elevationGain,
							avgGrade: seg.avgGrade,
							climbCategory: seg.climbCategory,
							totalAttempts: seg.totalAttempts,
							totalAthletes: seg.totalAthletes,
							featureType: 'line'
						},
						geometry: {
							type: 'LineString',
							coordinates: coords
						}
					});
				}
			}

			// Always add a point for the pin view (used at low zoom)
			features.push({
				type: 'Feature',
				properties: {
					id: seg.id,
					name: seg.name,
					activityType: seg.activityType,
					distance: seg.distance,
					elevationGain: seg.elevationGain,
					avgGrade: seg.avgGrade,
					climbCategory: seg.climbCategory,
					totalAttempts: seg.totalAttempts,
					totalAthletes: seg.totalAthletes,
					featureType: 'point'
				},
				geometry: {
					type: 'Point',
					// Strava startLatlng is [lat, lon] — flip to [lon, lat] for GeoJSON
					coordinates: [seg.startLatlng[1], seg.startLatlng[0]]
				}
			});
		}

		return features;
	}

	function setupSources(map: MapLibreMap) {
		// Avoid duplicates after style reload
		if (map.getSource(SOURCE_ID)) return;

		map.addSource(SOURCE_ID, {
			type: 'geojson',
			data: { type: 'FeatureCollection', features: [] }
		});

		// Ride polylines — orange, visible at z12+
		map.addLayer({
			id: 'strava-lines-ride',
			type: 'line',
			source: SOURCE_ID,
			filter: [
				'all',
				['==', ['get', 'featureType'], 'line'],
				['==', ['get', 'activityType'], 'ride']
			],
			minzoom: 12,
			layout: {
				visibility: 'none'
			},
			paint: {
				'line-color': '#f59e0b',
				'line-width': [
					'case',
					['boolean', ['feature-state', 'hover'], false],
					5,
					3
				],
				'line-opacity': 0.85
			}
		});

		// Run polylines — teal, visible at z12+
		map.addLayer({
			id: 'strava-lines-run',
			type: 'line',
			source: SOURCE_ID,
			filter: [
				'all',
				['==', ['get', 'featureType'], 'line'],
				['==', ['get', 'activityType'], 'run']
			],
			minzoom: 12,
			layout: {
				visibility: 'none'
			},
			paint: {
				'line-color': '#22d3ee',
				'line-width': [
					'case',
					['boolean', ['feature-state', 'hover'], false],
					5,
					3
				],
				'line-opacity': 0.85
			}
		});

		// Pin markers — always visible (no maxzoom so segments without polylines stay on map)
		map.addLayer({
			id: 'strava-pins',
			type: 'circle',
			source: SOURCE_ID,
			filter: ['==', ['get', 'featureType'], 'point'],
			layout: {
				visibility: 'none'
			},
			paint: {
				'circle-radius': 5,
				'circle-color': [
					'case',
					['==', ['get', 'activityType'], 'ride'],
					'#f59e0b',
					'#22d3ee'
				],
				'circle-opacity': 0.8,
				'circle-stroke-width': 1,
				'circle-stroke-color': 'rgba(10, 10, 10, 0.8)'
			}
		});

		// Pin labels — visible at z10+ (no maxzoom to match pins)
		map.addLayer({
			id: 'strava-pins-labels',
			type: 'symbol',
			source: SOURCE_ID,
			filter: ['==', ['get', 'featureType'], 'point'],
			minzoom: 10,
			layout: {
				visibility: 'none',
				'text-field': ['get', 'name'],
				'text-size': 9,
				'text-offset': [0, 1.4],
				'text-anchor': 'top',
				'text-optional': true
			},
			paint: {
				'text-color': '#fc4c02',
				'text-halo-color': 'rgba(10, 10, 10, 0.9)',
				'text-halo-width': 1.5
			}
		});
	}

	function updateData(map: MapLibreMap) {
		const catalog = get(stravaSegments);
		if (!catalog.segments.length) return;

		const features = buildFeatures(catalog.segments);
		const source = map.getSource(SOURCE_ID) as GeoJSONSource;
		if (source) {
			source.setData({ type: 'FeatureCollection', features });
		}
	}

	interface PopupRefs {
		root: HTMLDivElement;
		statsEl: HTMLDivElement;
		attemptsEl: HTMLDivElement;
		leaderboardEl: HTMLDivElement;
	}

	function buildPopupContent(props: Record<string, unknown>): {
		content: HTMLDivElement;
		refs: PopupRefs;
		segmentId: number;
	} {
		const name = escapeHtml(String(props.name ?? 'Segment'));
		const activityType = String(props.activityType ?? 'ride');
		const distance = Number(props.distance ?? 0);
		const elevationGain = Number(props.elevationGain ?? 0);
		const avgGrade = Number(props.avgGrade ?? 0);
		const totalAttempts = Number(props.totalAttempts ?? 0);
		const totalAthletes = Number(props.totalAthletes ?? 0);
		const segId = Number(props.id ?? 0);
		const typeIcon = activityType === 'ride' ? '\u{1F6B4}' : '\u{1F3C3}';
		const typeColor = activityType === 'ride' ? '#f59e0b' : '#22d3ee';

		// Show placeholder stats from catalog; leaderboard callback will overwrite with real data
		const statsParts = buildStatsParts(distance, elevationGain, avgGrade);
		const statsLine = statsParts.length > 0 ? statsParts.join(' &middot; ') : 'Loading stats...';

		const hasAttempts = totalAttempts > 0 || totalAthletes > 0;
		const attemptsLine = hasAttempts
			? `${totalAttempts.toLocaleString()} attempts &middot; ${totalAthletes.toLocaleString()} athletes`
			: '';

		const content = document.createElement('div');
		content.innerHTML = `
			<div style="font-family: system-ui, sans-serif; min-width: 180px; max-width: 260px;">
				<div style="font-weight: 600; font-size: 13px; color: ${typeColor}; margin-bottom: 4px;">
					${typeIcon} ${name}
				</div>
				<div data-popup-role="stats" style="font-size: 11px; color: #a1a1aa; margin-bottom: 6px;">
					${statsLine}
				</div>
				<div data-popup-role="attempts" style="font-size: 10px; color: #71717a;">
					${attemptsLine}
				</div>
				<div data-popup-role="leaderboard" style="margin-top: 6px; font-size: 10px; color: #71717a;">
					Loading leaderboard...
				</div>
				<div style="margin-top: 6px; font-size: 9px;">
					<a href="https://www.strava.com/segments/${segId}" target="_blank" rel="noopener"
					   style="color: #fc4c02; text-decoration: none;">
						View on Strava &rarr;
					</a>
				</div>
			</div>
		`;

		return {
			content,
			refs: {
				root: content,
				statsEl: content.querySelector('[data-popup-role="stats"]') as HTMLDivElement,
				attemptsEl: content.querySelector('[data-popup-role="attempts"]') as HTMLDivElement,
				leaderboardEl: content.querySelector(
					'[data-popup-role="leaderboard"]'
				) as HTMLDivElement
			},
			segmentId: segId
		};
	}

	async function populateLeaderboard(segId: number, refs: PopupRefs, currentToken: number): Promise<void> {
		const lb = await loadLeaderboard(segId);
		if (currentToken !== popupToken || !refs.root.isConnected) return;

		if (!lb) {
			refs.leaderboardEl.textContent = 'Leaderboard unavailable';
			return;
		}

		// Update stats line with real data from leaderboard scrape
		const parts = buildStatsParts(lb.distance, lb.elevationGain, lb.avgGrade);
		if (parts.length > 0) {
			refs.statsEl.innerHTML = parts.join(' &middot; ');
		} else {
			refs.statsEl.textContent = 'Stats unavailable';
		}

		// Update attempts/athletes line with real data
		if (lb.totalAttempts > 0 || lb.totalAthletes > 0) {
			refs.attemptsEl.innerHTML = `${lb.totalAttempts.toLocaleString()} attempts &middot; ${lb.totalAthletes.toLocaleString()} athletes`;
		} else {
			refs.attemptsEl.textContent = '';
		}

		const lbParts: string[] = [];
		if (lb.cr) {
			lbParts.push(
				`<div><strong style="color:#f59e0b;">KOM:</strong> ${escapeHtml(lb.cr.athleteName)} — ${escapeHtml(formatTime(lb.cr.time))}</div>`
			);
		}
		if (lb.qom) {
			lbParts.push(
				`<div><strong style="color:#ec4899;">QOM:</strong> ${escapeHtml(lb.qom.athleteName)} — ${escapeHtml(formatTime(lb.qom.time))}</div>`
			);
		}
		if (lb.rows.length > 0) {
			const topRows = lb.rows.slice(0, 3);
			lbParts.push('<div style="margin-top: 3px;">');
			for (const row of topRows) {
				lbParts.push(
					`<div style="color: #a1a1aa;">#${row.rank} ${escapeHtml(row.athleteName)} — ${escapeHtml(row.time)}</div>`
				);
			}
			lbParts.push('</div>');
		}

		refs.leaderboardEl.innerHTML =
			lbParts.length > 0 ? lbParts.join('') : 'No public leaderboard rows available right now.';
	}

	function getInteractiveLayerIds(map: MapLibreMap): string[] {
		return SEGMENT_LAYERS.filter((layerId) => Boolean(map.getLayer(layerId)));
	}

	function getFeaturePriority(feature: MapGeoJSONFeature): number {
		if (feature.layer.id === 'strava-lines-ride' || feature.layer.id === 'strava-lines-run') return 0;
		if (feature.layer.id === 'strava-pins') return 1;
		if (feature.layer.id === 'strava-pins-labels') return 2;
		return 3;
	}

	function getPopupFeature(map: MapLibreMap, e: MapMouseEvent): MapGeoJSONFeature | null {
		const layers = getInteractiveLayerIds(map);
		if (layers.length === 0) return null;

		const features = map.queryRenderedFeatures(e.point, { layers });
		if (features.length === 0) return null;

		return [...features].sort((a, b) => getFeaturePriority(a) - getFeaturePriority(b))[0] ?? null;
	}

	async function showPopup(
		map: MapLibreMap,
		e: MapMouseEvent,
		feature: MapGeoJSONFeature
	): Promise<void> {
		const props = feature.properties ?? {};
		const { content, refs, segmentId } = buildPopupContent(props);
		const currentToken = ++popupToken;

		// Get coordinates for popup placement
		const lngLat = e.lngLat;

		// Close existing popup
		activePopup?.remove();

		// Dynamic import to avoid SSR issues
		const maplibregl = await import('maplibre-gl');
		const popup = new maplibregl.Popup({
			closeButton: true,
			closeOnClick: true,
			maxWidth: '280px'
		})
			.setLngLat(lngLat)
			.setDOMContent(content)
			.addTo(map);

		if (currentToken !== popupToken) {
			popup.remove();
			return;
		}

		activePopup = popup;

		// Lazy-load leaderboard data
		if (segmentId) {
			void populateLeaderboard(segmentId, refs, currentToken);
		}
	}

	function bindInteractions(map: MapLibreMap) {
		if (interactionsBound) return;
		interactionsBound = true;

		const handleClick = (e: MapMouseEvent) => {
			const feature = getPopupFeature(map, e);
			if (!feature) return;
			void showPopup(map, e, feature);
		};

		const handleMouseMove = (e: MapMouseEvent) => {
			map.getCanvas().style.cursor = getPopupFeature(map, e) ? 'pointer' : '';
		};

		const handleMouseOut = () => {
			map.getCanvas().style.cursor = '';
		};

		map.on('click', handleClick);
		map.on('mousemove', handleMouseMove);
		map.on('mouseout', handleMouseOut);

		removeInteractionListeners = () => {
			map.off('click', handleClick);
			map.off('mousemove', handleMouseMove);
			map.off('mouseout', handleMouseOut);
		};
	}

	/** Toggle visibility of all segment layers */
	export function setVisible(visible: boolean) {
		const map = getMap();
		if (!map) return;

		const vis = visible ? 'visible' : 'none';
		for (const layerId of SEGMENT_LAYERS) {
			if (map.getLayer(layerId)) {
				map.setLayoutProperty(layerId, 'visibility', vis);
			}
		}
	}

	let unsubscribeSegments: (() => void) | null = null;
	let unsubscribeVisibility: (() => void) | null = null;
	let updateTimer: ReturnType<typeof setTimeout> | null = null;

	onMount(() => {
		const unsubReady = mapReady.subscribe((ready) => {
			if (!ready) return;
			const map = getMap();
			if (!map) return;

			setupSources(map);
			updateData(map);
			bindInteractions(map);
			setVisible(get(showSegments));

			// Re-setup after theme/style change
			removeStyleLoadListener?.();
			const handleStyleLoad = () => {
				setupSources(map);
				updateData(map);
				setVisible(get(showSegments));
			};
			map.on('style.load', handleStyleLoad);
			removeStyleLoadListener = () => map.off('style.load', handleStyleLoad);

			// Re-render when segment data changes (debounced)
			if (!unsubscribeSegments) {
				unsubscribeSegments = stravaSegments.subscribe(() => {
					if (updateTimer) clearTimeout(updateTimer);
					updateTimer = setTimeout(() => {
						const m = getMap();
						if (!m || !m.getSource(SOURCE_ID)) return;
						updateData(m);
					}, 100);
				});
			}

			if (!unsubscribeVisibility) {
				unsubscribeVisibility = showSegments.subscribe((visible) => {
					setVisible(visible);
				});
			}
		});

		return () => {
			unsubReady();
		};
	});

	onDestroy(() => {
		removeStyleLoadListener?.();
		removeInteractionListeners?.();
		unsubscribeSegments?.();
		unsubscribeVisibility?.();
		activePopup?.remove();
		if (updateTimer) clearTimeout(updateTimer);

		// Clean up map layers and source
		const map = getMap();
		if (map) {
			for (const layerId of SEGMENT_LAYERS) {
				if (map.getLayer(layerId)) {
					map.removeLayer(layerId);
				}
			}
			if (map.getSource(SOURCE_ID)) {
				map.removeSource(SOURCE_ID);
			}
		}
	});
</script>

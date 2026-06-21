/**
 * Pure data-transformation functions for the Marin Monitor map.
 *
 * These convert domain objects (NewsItem[], traffic events, gas stations, etc.)
 * into GeoJSON features suitable for MapLibre sources.  Every function here is
 * deterministic and side-effect-free, making them straightforward to test.
 */

import { MARIN_BOUNDS } from '$lib/config';
import { findNearestTown } from '$lib/geo/proximity';
import type { NewsItem, MapLayer, Town } from '$lib/types';
import type { GasStation } from '$lib/types/gas';
import type { ChargingStation } from '$lib/types/ev-charging';
import type { CoffeeIndexShop } from '$lib/types/coffee';
import type { FitnessStudio } from '$lib/types/fitness';
import type { AirportOperationalStatus, AirportStatus, AirportWeather } from '$lib/types/airport';
import type { AirportPin } from '$lib/config/map';
import {
	getCoffeeHeadlinePrice,
	formatCoffeeMenuSummary,
	getCoffeeStatusLabel,
	formatCoffeePrice
} from '$lib/utils/coffee-index';

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

/** Coerce an unknown value to a finite number, or return null. */
export function toNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const parsed = parseFloat(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

/** Build a stable fallback feature id from a prefix, coordinates and label. */
export function buildFallbackFeatureId(
	prefix: string,
	coordinates: [number, number],
	label: string
): string {
	return `${prefix}:${label}:${coordinates[0].toFixed(5)},${coordinates[1].toFixed(5)}`;
}

// ---------------------------------------------------------------------------
// Coordinate extraction
// ---------------------------------------------------------------------------

/**
 * Try several common property shapes to extract [lon, lat] from a generic
 * event record.  Returns null when coordinates cannot be determined.
 */
export function extractCoordinates(event: Record<string, unknown>): [number, number] | null {
	const directLat = toNumber(
		event.lat ?? event.latitude ?? event.Latitude ?? event.Lat ?? event.y ?? null
	);
	const directLon = toNumber(
		event.lon ?? event.lng ?? event.longitude ?? event.Longitude ?? event.Long ?? event.x ?? null
	);
	if (directLat !== null && directLon !== null) return [directLon, directLat];

	const point = event.point as Record<string, unknown> | undefined;
	if (point) {
		const pointLat = toNumber(point.lat ?? point.latitude ?? null);
		const pointLon = toNumber(point.lon ?? point.lng ?? point.longitude ?? null);
		if (pointLat !== null && pointLon !== null) return [pointLon, pointLat];
	}

	const geometryCandidates = [event.geometry, event.geography];
	for (const candidate of geometryCandidates) {
		if (!candidate || typeof candidate !== 'object') continue;
		const geometry = candidate as Record<string, unknown>;
		const coordinates = geometry.coordinates;
		if (!Array.isArray(coordinates)) continue;

		if (
			coordinates.length >= 2 &&
			typeof coordinates[0] === 'number' &&
			typeof coordinates[1] === 'number'
		) {
			return [coordinates[0], coordinates[1]];
		}

		const first = coordinates[0];
		if (
			Array.isArray(first) &&
			first.length >= 2 &&
			typeof first[0] === 'number' &&
			typeof first[1] === 'number'
		) {
			return [first[0], first[1]];
		}

		const nestedFirst = Array.isArray(first) ? first[0] : null;
		if (
			Array.isArray(nestedFirst) &&
			nestedFirst.length >= 2 &&
			typeof nestedFirst[0] === 'number' &&
			typeof nestedFirst[1] === 'number'
		) {
			return [nestedFirst[0], nestedFirst[1]];
		}
	}

	return null;
}

// ---------------------------------------------------------------------------
// Traffic helpers
// ---------------------------------------------------------------------------

const TRAFFIC_BOUNDS_BUFFER = 0.12;

export function isWithinMarinView(lon: number, lat: number): boolean {
	return (
		lon >= MARIN_BOUNDS.west - TRAFFIC_BOUNDS_BUFFER &&
		lon <= MARIN_BOUNDS.east + TRAFFIC_BOUNDS_BUFFER &&
		lat >= MARIN_BOUNDS.south - TRAFFIC_BOUNDS_BUFFER &&
		lat <= MARIN_BOUNDS.north + TRAFFIC_BOUNDS_BUFFER
	);
}

export function parseTrafficSeverity(
	event: Record<string, unknown>
): 'MODERATE' | 'MAJOR' | 'SEVERE' | 'UNKNOWN' {
	const raw = String(
		event.severity ??
			event.Severity ??
			(event.severityLevel as string | undefined) ??
			(event.impact as string | undefined) ??
			''
	).toUpperCase();

	if (raw.includes('SEVERE')) return 'SEVERE';
	if (raw.includes('MAJOR') || raw.includes('HIGH')) return 'MAJOR';
	if (raw.includes('MODERATE') || raw.includes('MEDIUM')) return 'MODERATE';

	const typeText = String(
		event.event_type ?? event.eventType ?? event.type ?? event.category ?? ''
	).toUpperCase();
	if (typeText.includes('CLOS')) return 'MAJOR';
	if (typeText.includes('COLLISION') || typeText.includes('CRASH')) return 'MAJOR';

	return 'UNKNOWN';
}

export function buildTrafficEventFeatures(events: Record<string, unknown>[]): GeoJSON.Feature[] {
	const features: GeoJSON.Feature[] = [];
	for (const event of events) {
		const coords = extractCoordinates(event);
		if (!coords) continue;
		if (!isWithinMarinView(coords[0], coords[1])) continue;

		const severity = parseTrafficSeverity(event);
		if (severity === 'UNKNOWN') continue;

		const title =
			String(
				event.headline ?? event.Headline ?? event.description ?? event.Description ?? ''
			).trim() || 'Traffic event';
		const type = String(event.event_type ?? event.eventType ?? event.type ?? 'incident');
		const id =
			String(event.id ?? event.Id ?? '').trim() || buildFallbackFeatureId('traffic', coords, title);

		features.push({
			type: 'Feature',
			id,
			properties: {
				id,
				title,
				type,
				severity,
				source: '511 Traffic',
				layer: 'traffic'
			},
			geometry: {
				type: 'Point',
				coordinates: coords
			}
		});
	}

	return features;
}

/**
 * Filter traffic features to a single town.  Pass `null` for county-wide
 * (returns all features unfiltered).
 */
export function filterTrafficByTown(
	features: GeoJSON.Feature[],
	townSlug: string | null
): GeoJSON.Feature[] {
	if (!townSlug) return features;
	return features.filter((f) => {
		const coords = (f.geometry as GeoJSON.Point).coordinates;
		return findNearestTown(coords[1], coords[0]) === townSlug;
	});
}

// ---------------------------------------------------------------------------
// News / town aggregation
// ---------------------------------------------------------------------------

export interface TownStoryStats {
	total: number;
	byLayer: Record<string, number>;
	topHeadline: string;
}

/** Count how many active stories each town has, broken out by map layer. */
export function getStoryCountsByTown(
	items: NewsItem[],
	categoryToLayer: Record<string, string>
): Map<string, TownStoryStats> {
	const counts = new Map<string, TownStoryStats>();
	for (const item of items) {
		if (!item.townSlug) continue;
		const layer = categoryToLayer[item.category];
		if (!layer) continue;

		const existing = counts.get(item.townSlug);
		if (existing) {
			existing.total++;
			existing.byLayer[layer] = (existing.byLayer[layer] || 0) + 1;
		} else {
			counts.set(item.townSlug, {
				total: 1,
				byLayer: { [layer]: 1 },
				topHeadline: item.title
			});
		}
	}
	return counts;
}

/** Pick the layer color with the most stories for a given town. */
export function getDominantColor(
	byLayer: Record<string, number>,
	layerColors: Record<string, string>
): string {
	let maxCount = 0;
	let dominant: MapLayer = 'news';
	for (const [layer, count] of Object.entries(byLayer)) {
		if (count > maxCount) {
			maxCount = count;
			dominant = layer as MapLayer;
		}
	}
	return layerColors[dominant] || layerColors.news;
}

// ---------------------------------------------------------------------------
// GeoJSON feature builders — map source data constructors
// ---------------------------------------------------------------------------

/**
 * Build a town dot GeoJSON feature for one town.
 * Radius, color, and opacity are computed from story counts and filter state.
 */
export function buildTownFeature(
	town: Town,
	stats: TownStoryStats | undefined,
	currentTownFilter: string | null,
	selectedTown: string | null,
	layerColors: Record<string, string>
): GeoJSON.Feature {
	const total = stats?.total || 0;
	const hasData = total > 0;
	const isSelected = currentTownFilter === town.slug;
	const isDimmed = currentTownFilter && !isSelected;
	const radius = isDimmed ? 2 : hasData ? Math.max(6, Math.min(16, 5 + total * 0.8)) : 3;
	const color = isDimmed
		? 'rgba(255, 255, 255, 0.1)'
		: hasData
			? getDominantColor(stats!.byLayer, layerColors)
			: 'rgba(255, 255, 255, 0.2)';
	const opacity = isDimmed ? 0.08 : hasData ? 0.88 : 0.16;
	const labelOpacity = isDimmed ? 0.08 : hasData ? 0.72 : 0.28;

	return {
		type: 'Feature',
		id: town.slug,
		properties: {
			name: town.name,
			slug: town.slug,
			total,
			radius,
			opacity,
			labelOpacity,
			color,
			headline: stats?.topHeadline || '',
			selected: selectedTown === town.slug
		},
		geometry: {
			type: 'Point',
			coordinates: [town.lon, town.lat]
		}
	};
}

/**
 * Build all town dot GeoJSON features for the towns source.
 */
export function buildTownFeatures(
	towns: Town[],
	storyCounts: Map<string, TownStoryStats>,
	currentTownFilter: string | null,
	selectedTown: string | null,
	layerColors: Record<string, string>
): GeoJSON.Feature[] {
	return towns.map((town) =>
		buildTownFeature(town, storyCounts.get(town.slug), currentTownFilter, selectedTown, layerColors)
	);
}

/**
 * Build GeoJSON pin features for active news items that have exact coordinates.
 * Town-only items (no lat/lon) are intentionally omitted — they appear in town aggregates.
 */
export function buildNewsPinFeatures(
	activeItems: NewsItem[],
	categoryToLayer: Record<string, string>,
	currentTownFilter: string | null,
	layerColors: Record<string, string>
): GeoJSON.Feature[] {
	const features: GeoJSON.Feature[] = [];
	for (const item of activeItems) {
		const layer = categoryToLayer[item.category];
		if (!layer) continue;
		if (typeof item.lat !== 'number' || typeof item.lon !== 'number') continue;
		if (currentTownFilter && item.townSlug !== currentTownFilter) continue;

		features.push({
			type: 'Feature',
			id: item.id,
			properties: {
				id: item.id,
				title: item.title,
				color: layerColors[layer] || layerColors.news,
				layer,
				source: item.source,
				locationType: item.locationConfidence || 'exact',
				timestamp: item.timestamp
			},
			geometry: {
				type: 'Point',
				coordinates: [item.lon, item.lat]
			}
		});
	}
	return features;
}

/**
 * Build alert-pulse GeoJSON features (one per alert item, placed at the town centroid).
 */
export function buildAlertPulseFeatures(
	activeItems: NewsItem[],
	currentTownFilter: string | null,
	townBySlug: Record<string, Town>
): GeoJSON.Feature[] {
	const features: GeoJSON.Feature[] = [];
	for (const item of activeItems) {
		if (!item.isAlert || !item.townSlug) continue;
		if (currentTownFilter && item.townSlug !== currentTownFilter) continue;
		const town = townBySlug[item.townSlug];
		if (!town) continue;

		features.push({
			type: 'Feature',
			properties: { title: item.title, keyword: item.alertKeyword },
			geometry: {
				type: 'Point',
				coordinates: [town.lon, town.lat]
			}
		});
	}
	return features;
}

/** Extract magnitude from a USGS-style title like "M 3.2 - 5km NW of ...". */
export function parseMagnitudeFromTitle(title: string): number {
	return parseFloat(title?.match(/M ([\d.]+)/)?.[1] || '2');
}

/**
 * Build GeoJSON features for earthquake items.
 * Items without coordinates are skipped.
 */
export function buildEarthquakeFeatures(earthquakes: NewsItem[]): GeoJSON.Feature[] {
	return earthquakes
		.filter((eq) => eq.lat && eq.lon)
		.map((eq) => ({
			type: 'Feature' as const,
			id: eq.id,
			properties: {
				title: eq.title,
				magnitude: parseMagnitudeFromTitle(eq.title)
			},
			geometry: {
				type: 'Point' as const,
				coordinates: [eq.lon!, eq.lat!]
			}
		}));
}

interface FireIncidentOverlay {
	id: string;
	name: string;
	acres: number;
	containment: number;
	lat: number;
	lon: number;
	url: string;
	source: string;
}

/**
 * Build GeoJSON features for active fire incidents.
 */
export function buildFireIncidentFeatures(
	fireIncidents: FireIncidentOverlay[]
): GeoJSON.Feature[] {
	return fireIncidents.map((fire) => ({
		type: 'Feature' as const,
		id: fire.id,
		properties: {
			id: fire.id,
			name: fire.name,
			acres: fire.acres,
			containment: fire.containment,
			url: fire.url,
			source: fire.source
		},
		geometry: {
			type: 'Point' as const,
			coordinates: [fire.lon, fire.lat]
		}
	}));
}

/**
 * Build GeoJSON features for gas stations.
 * Pass `currentTownFilter` to limit to a single town; null returns all.
 */
export function buildGasStationFeatures(
	gasStations: GasStation[],
	currentTownFilter: string | null
): GeoJSON.Feature[] {
	return gasStations
		.filter((s) => !currentTownFilter || findNearestTown(s.lat, s.lon) === currentTownFilter)
		.map((station) => {
			const regularPrice = station.fuelPrices.find((fp) => fp.type === 'REGULAR_UNLEADED')?.price;
			return {
				type: 'Feature' as const,
				id: station.placeId,
				properties: {
					placeId: station.placeId,
					name: station.name,
					address: station.address,
					price: regularPrice !== undefined ? `$${regularPrice.toFixed(3)}` : ''
				},
				geometry: {
					type: 'Point' as const,
					coordinates: [station.lon, station.lat]
				}
			};
		});
}

/**
 * Build GeoJSON features for EV charging stations.
 * Assumes the input list is already filtered to Marin bounds and town (if applicable).
 */
export function buildEvStationFeatures(evStations: ChargingStation[]): GeoJSON.Feature[] {
	return evStations.map((station) => {
		const level = station.chargingLevels.includes('DCFast') ? 'DC Fast' : 'Level 2';
		const connectorTypes = station.connectors.map((c) => c.type).join(', ');
		return {
			type: 'Feature' as const,
			id: station.stationId,
			properties: {
				stationId: station.stationId,
				name: station.name,
				network: station.network,
				level,
				connectors: connectorTypes,
				pricing: station.pricingInfo ?? ''
			},
			geometry: {
				type: 'Point' as const,
				coordinates: [station.lon, station.lat]
			}
		};
	});
}

/**
 * Build GeoJSON features for coffee shops.
 * Pass `currentTownFilter` to limit to a single town; null returns all.
 */
export function buildCoffeeShopFeatures(
	coffeeShops: CoffeeIndexShop[],
	currentTownFilter: string | null
): GeoJSON.Feature[] {
	const features: GeoJSON.Feature[] = [];
	for (const shop of coffeeShops) {
		if (currentTownFilter && findNearestTown(shop.lat, shop.lon) !== currentTownFilter) continue;

		const headline = getCoffeeHeadlinePrice(shop);
		const menuSummary = formatCoffeeMenuSummary(shop);
		const statusLabel = getCoffeeStatusLabel(shop);

		features.push({
			type: 'Feature',
			id: shop.id,
			geometry: {
				type: 'Point',
				coordinates: [shop.lon, shop.lat]
			},
			properties: {
				name: shop.name,
				price: headline ? formatCoffeePrice(headline.price) : '',
				headlineLabel: headline?.label ?? '',
				address: shop.address,
				town: shop.town,
				menuSummary: menuSummary || statusLabel,
				statusLabel,
				hasPrice: headline ? 1 : 0
			}
		});
	}
	return features;
}

/**
 * Build GeoJSON features for fitness studios.
 * Pass `currentTownFilter` to limit to a single town; null returns all.
 */
export function buildFitnessStudioFeatures(
	fitnessStudios: FitnessStudio[],
	currentTownFilter: string | null,
	typeLabels: Record<string, string>,
	typeColors: Record<string, string>
): GeoJSON.Feature[] {
	return fitnessStudios
		.filter((s) => !currentTownFilter || findNearestTown(s.lat, s.lon) === currentTownFilter)
		.map((s) => ({
			type: 'Feature' as const,
			id: s.id,
			geometry: {
				type: 'Point' as const,
				coordinates: [s.lon, s.lat]
			},
			properties: {
				name: s.name,
				price: `$${s.dropInPrice}`,
				town: s.town,
				typeName: typeLabels[s.type],
				color: typeColors[s.type]
			}
		}));
}

/**
 * Parse a 311 title string of the form "Category · Street Address" into parts.
 * Returns `{ category, street }` — `street` is empty when no separator is present.
 */
export function parse311Title(title: string): { category: string; street: string } {
	if (title.includes(' · ')) {
		const [category, street] = title.split(' · ');
		return { category, street: street ?? '' };
	}
	return { category: title, street: '' };
}

/**
 * Build GeoJSON features for 311 reports (SeeClickFix / Fix It Marin).
 * Items without coordinates or not matching the town filter are skipped.
 */
export function build311ReportFeatures(
	items: NewsItem[],
	currentTownFilter: string | null
): GeoJSON.Feature[] {
	const features: GeoJSON.Feature[] = [];
	for (const item of items) {
		if (!item.lat || !item.lon) continue;
		if (currentTownFilter && item.townSlug !== currentTownFilter) continue;

		const { category, street } = parse311Title(item.title);

		features.push({
			type: 'Feature',
			id: item.id.replace('seeclickfix-', ''),
			geometry: {
				type: 'Point',
				coordinates: [item.lon, item.lat]
			},
			properties: {
				category,
				label: street ? `${category}\n${street}` : category,
				address: item.locationEvidence ?? '',
				description: item.description ?? '',
				imageUrl: item.imageUrl ?? ''
			}
		});
	}
	return features;
}

/** Map an airport operational status to a human-readable label. */
export function formatAirportStatusLabel(status: AirportOperationalStatus): string {
	switch (status) {
		case 'on-time':
			return 'On Time';
		case 'delays':
			return 'Delays';
		case 'ground-delay':
			return 'Ground Delay';
		case 'ground-stop':
			return 'Ground Stop';
		case 'closed':
			return 'Closed';
		default:
			return status;
	}
}

/** Build a compact weather summary string from an AirportWeather object. */
export function buildAirportWeatherSummary(weather: AirportWeather): string {
	const parts: string[] = [weather.fltCat];
	parts.push(`${weather.visibility} vis`);
	if (weather.ceiling !== null) parts.push(`Ceiling ${weather.ceiling} ft`);
	parts.push(
		`${weather.windDir}° ${weather.windSpeed}${weather.windGust ? `g${weather.windGust}` : ''} kt`
	);
	if (weather.fogRisk) parts.push('Fog Risk');
	return parts.join(' · ');
}

/**
 * Build GeoJSON features for airport status pins.
 */
export function buildAirportFeatures(
	pins: AirportPin[],
	statusMap: Map<string, AirportStatus>,
	statusColors: Record<string, string>
): GeoJSON.Feature[] {
	return pins.map((pin) => {
		const info = statusMap.get(pin.code);
		const status: AirportOperationalStatus = info?.status ?? 'on-time';
		const color = statusColors[status] ?? '#6b7280';
		const statusLabel = formatAirportStatusLabel(status);
		const weatherSummary = info?.weather ? buildAirportWeatherSummary(info.weather) : '';

		return {
			type: 'Feature' as const,
			id: pin.code,
			properties: { code: pin.code, name: pin.name, color, statusLabel, weatherSummary },
			geometry: {
				type: 'Point' as const,
				coordinates: [pin.lon, pin.lat]
			}
		};
	});
}

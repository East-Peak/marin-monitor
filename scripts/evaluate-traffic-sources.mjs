#!/usr/bin/env node

/**
 * Quick traffic provider evaluator for Marin County.
 *
 * Usage:
 *   node scripts/evaluate-traffic-sources.mjs
 *
 * Optional env vars:
 *   VITE_511_API_KEY
 *   VITE_TOMTOM_API_KEY
 *   VITE_MAPBOX_TOKEN
 */

const SAMPLE_POINTS = [
	{ name: 'US-101 San Rafael', lat: 37.9723, lon: -122.5311 },
	{ name: 'US-101 Novato', lat: 38.1074, lon: -122.5697 },
	{ name: 'Tiburon Blvd', lat: 37.8869, lon: -122.4638 },
	{ name: 'Shoreline Hwy / Pt Reyes', lat: 38.0692, lon: -122.8068 },
	{ name: 'Sir Francis Drake / Fairfax', lat: 37.9876, lon: -122.5883 }
];

const MARIN_BBOX = {
	minLon: -123.05,
	minLat: 37.8,
	maxLon: -122.35,
	maxLat: 38.25
};

const KEY_511 = process.env.VITE_511_API_KEY || '';
const KEY_TOMTOM = process.env.VITE_TOMTOM_API_KEY || '';
const KEY_MAPBOX = process.env.VITE_MAPBOX_TOKEN || '';

function pickFirst(values, fallback = null) {
	for (const value of values) {
		if (value !== undefined && value !== null && value !== '') return value;
	}
	return fallback;
}

function normalizeEvents(payload) {
	if (!payload || typeof payload !== 'object') return [];
	if (Array.isArray(payload)) return payload;

	const directCandidates = ['events', 'Events', 'event', 'Event', 'results', 'Results', 'data'];
	for (const key of directCandidates) {
		if (Array.isArray(payload[key])) return payload[key];
	}

	// Fallback: recursively collect likely event objects
	const found = [];
	const stack = [payload];
	while (stack.length > 0) {
		const current = stack.pop();
		if (!current || typeof current !== 'object') continue;
		if (Array.isArray(current)) {
			for (const item of current) stack.push(item);
			continue;
		}

		const severity = pickFirst([current.severity, current.Severity]);
		const headline = pickFirst([current.headline, current.Headline, current.description]);
		const id = pickFirst([current.id, current.Id, current.event_id]);
		if (severity || headline || id) {
			found.push(current);
		}

		for (const value of Object.values(current)) {
			if (value && typeof value === 'object') stack.push(value);
		}
	}
	return found;
}

function summarize511Events(events) {
	const normalized = events.map((event) => {
		const severityRaw = String(
			pickFirst([event.severity, event.Severity, event?.meta?.severity], 'UNKNOWN')
		).toUpperCase();
		const type = String(pickFirst([event.event_type, event.eventType, event.type], 'UNKNOWN'));
		return {
			id: pickFirst([event.id, event.Id, event.event_id], ''),
			headline: pickFirst([event.headline, event.Headline, event.description], ''),
			severity: severityRaw,
			type
		};
	});

	const severe = normalized.filter((event) => event.severity === 'SEVERE');
	const major = normalized.filter((event) => event.severity === 'MAJOR');
	const moderate = normalized.filter((event) => event.severity === 'MODERATE');

	return {
		total: normalized.length,
		severe: severe.length,
		major: major.length,
		moderate: moderate.length,
		topSevere: severe.slice(0, 3).map((event) => ({
			id: event.id,
			severity: event.severity,
			type: event.type,
			headline: event.headline
		}))
	};
}

function summarizeTomTomSegment(data) {
	const segment = data?.flowSegmentData ?? {};
	const currentSpeed = Number(segment.currentSpeed ?? NaN);
	const freeFlowSpeed = Number(segment.freeFlowSpeed ?? NaN);
	const confidence = Number(segment.confidence ?? NaN);
	const delayRatio =
		Number.isFinite(currentSpeed) && Number.isFinite(freeFlowSpeed) && freeFlowSpeed > 0
			? 1 - currentSpeed / freeFlowSpeed
			: null;

	return {
		currentSpeed: Number.isFinite(currentSpeed) ? currentSpeed : null,
		freeFlowSpeed: Number.isFinite(freeFlowSpeed) ? freeFlowSpeed : null,
		confidence: Number.isFinite(confidence) ? confidence : null,
		roadClosure: Boolean(segment.roadClosure),
		delayRatio
	};
}

function summarizeMapboxTilequery(data) {
	const features = Array.isArray(data?.features) ? data.features : [];
	const buckets = { low: 0, moderate: 0, heavy: 0, severe: 0, closed: 0, unknown: 0 };

	for (const feature of features) {
		const congestion = String(feature?.properties?.congestion ?? '').toLowerCase();
		const closed = String(feature?.properties?.closed ?? '').toLowerCase();
		if (closed === 'yes') buckets.closed += 1;

		if (congestion === 'low') buckets.low += 1;
		else if (congestion === 'moderate') buckets.moderate += 1;
		else if (congestion === 'heavy') buckets.heavy += 1;
		else if (congestion === 'severe') buckets.severe += 1;
		else buckets.unknown += 1;
	}

	return {
		features: features.length,
		buckets,
		highImpactCount: buckets.heavy + buckets.severe + buckets.closed
	};
}

async function fetchJson(url) {
	const response = await fetch(url, { headers: { Accept: 'application/json' } });
	if (!response.ok) {
		const body = await response.text();
		throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
	}
	return response.json();
}

async function evaluate511() {
	if (!KEY_511) {
		return {
			enabled: false,
			reason: 'Set VITE_511_API_KEY to evaluate 511 traffic events'
		};
	}

	const url = `https://api.511.org/traffic/events?api_key=${encodeURIComponent(KEY_511)}&format=json`;
	const payload = await fetchJson(url);
	const events = normalizeEvents(payload);
	return {
		enabled: true,
		source: '511 SF Bay Traffic Events',
		url: 'https://api.511.org/traffic/events',
		summary: summarize511Events(events)
	};
}

async function evaluateTomTom() {
	if (!KEY_TOMTOM) {
		return {
			enabled: false,
			reason: 'Set VITE_TOMTOM_API_KEY to evaluate TomTom flow segments'
		};
	}

	const points = [];
	for (const point of SAMPLE_POINTS) {
		const url =
			`https://api.tomtom.com/traffic/services/4/flowSegmentData/relative0/10/json` +
			`?key=${encodeURIComponent(KEY_TOMTOM)}&point=${point.lat},${point.lon}&unit=mph`;
		try {
			const payload = await fetchJson(url);
			points.push({
				point: point.name,
				...summarizeTomTomSegment(payload)
			});
		} catch (error) {
			points.push({
				point: point.name,
				error: String(error)
			});
		}
	}

	return {
		enabled: true,
		source: 'TomTom Flow Segment Data',
		url: 'https://developer.tomtom.com/traffic-api/documentation/tomtom-maps/traffic-flow/flow-segment-data',
		samples: points
	};
}

async function evaluateMapbox() {
	if (!KEY_MAPBOX) {
		return {
			enabled: false,
			reason: 'Set VITE_MAPBOX_TOKEN to evaluate Mapbox Traffic v1 tilequery'
		};
	}

	const points = [];
	for (const point of SAMPLE_POINTS) {
		const url =
			`https://api.mapbox.com/v4/mapbox.mapbox-traffic-v1/tilequery/${point.lon},${point.lat}.json` +
			`?layers=traffic&radius=250&limit=25&dedupe=true&access_token=${encodeURIComponent(KEY_MAPBOX)}`;

		try {
			const payload = await fetchJson(url);
			points.push({
				point: point.name,
				...summarizeMapboxTilequery(payload)
			});
		} catch (error) {
			points.push({
				point: point.name,
				error: String(error)
			});
		}
	}

	return {
		enabled: true,
		source: 'Mapbox Traffic v1 (tilequery)',
		url: 'https://docs.mapbox.com/data/tilesets/reference/mapbox-traffic-v1/',
		samples: points
	};
}

async function main() {
	const startedAt = new Date().toISOString();
	const [events511, tomtom, mapbox] = await Promise.all([
		evaluate511().catch((error) => ({ enabled: true, error: String(error) })),
		evaluateTomTom().catch((error) => ({ enabled: true, error: String(error) })),
		evaluateMapbox().catch((error) => ({ enabled: true, error: String(error) }))
	]);

	const output = {
		startedAt,
		scope: {
			region: 'Marin County, CA',
			bbox: MARIN_BBOX,
			samplePoints: SAMPLE_POINTS.map((point) => point.name)
		},
		providers: {
			events511,
			tomtom,
			mapbox
		}
	};

	console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});

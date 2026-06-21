#!/usr/bin/env node
/**
 * One-time script to build marin-boundaries.geojson from Census Bureau data.
 *
 * Prerequisites:
 *   npm install -g mapshaper
 *   Download cb_2023_06_place_500k.zip from Census Bureau and extract to /tmp/cb_places/
 *
 * Usage:
 *   node scripts/build-boundaries.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

// Our town definitions — Census NAME → slug mapping
const CENSUS_TO_SLUG = {
	'San Rafael': 'san-rafael',
	Novato: 'novato',
	'Mill Valley': 'mill-valley',
	'San Anselmo': 'san-anselmo',
	Larkspur: 'larkspur',
	'Corte Madera': 'corte-madera',
	Fairfax: 'fairfax',
	Tiburon: 'tiburon',
	Belvedere: 'belvedere',
	Ross: 'ross',
	Sausalito: 'sausalito',
	'Stinson Beach': 'stinson-beach',
	Bolinas: 'bolinas',
	'Point Reyes Station': 'point-reyes',
	Inverness: 'inverness',
	Woodacre: 'woodacre',
	'San Geronimo': 'san-geronimo',
	Kentfield: 'kentfield',
	Strawberry: 'strawberry',
	'Muir Beach': 'muir-beach',
	Tomales: 'tomales',
	Nicasio: 'nicasio'
};

// Combined CDPs that map to two of our slugs
const COMBINED_CDPS = {
	'Lagunitas-Forest Knolls': ['lagunitas', 'forest-knolls'],
	'Lucas Valley-Marinwood': ['lucas-valley', 'marinwood']
};

// Towns without Census boundaries — generate circle polygons
const CIRCLE_FALLBACKS = [
	{ slug: 'greenbrae', name: 'Greenbrae', lat: 37.946, lon: -122.5364, radiusKm: 1.8 },
	{ slug: 'tam-valley', name: 'Tam Valley', lat: 37.883, lon: -122.5375, radiusKm: 2.5 },
	{ slug: 'marshall', name: 'Marshall', lat: 38.1571, lon: -122.887, radiusKm: 1.2 },
	{ slug: 'terra-linda', name: 'Terra Linda', lat: 38.005, lon: -122.545, radiusKm: 2.0 }
];

// Marin County bounding box for deduplication
const MARIN_BBOX = { south: 37.82, north: 38.32, west: -122.95, east: -122.35 };

function generateCirclePolygon(lat, lon, radiusKm, numPoints = 32) {
	const coords = [];
	const R = 6371; // Earth radius km
	for (let i = 0; i <= numPoints; i++) {
		const angle = (2 * Math.PI * i) / numPoints;
		const dLat = (radiusKm / R) * Math.cos(angle);
		const dLon = (radiusKm / (R * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
		coords.push([lon + (dLon * 180) / Math.PI, lat + (dLat * 180) / Math.PI]);
	}
	return { type: 'Polygon', coordinates: [coords] };
}

function featureCenterInMarin(feature) {
	// Get approximate center of geometry to check it's in Marin
	const coords = [];
	function flatten(c) {
		if (typeof c[0] === 'number') {
			coords.push(c);
		} else {
			for (const item of c) flatten(item);
		}
	}
	flatten(feature.geometry.coordinates);
	if (coords.length === 0) return false;
	const avgLon = coords.reduce((s, c) => s + c[0], 0) / coords.length;
	const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
	return (
		avgLat >= MARIN_BBOX.south &&
		avgLat <= MARIN_BBOX.north &&
		avgLon >= MARIN_BBOX.west &&
		avgLon <= MARIN_BBOX.east
	);
}

// Step 1: Filter and simplify with mapshaper
const SHP_PATH = '/tmp/cb_places/cb_2023_06_place_500k.shp';
const TEMP_GEOJSON = '/tmp/marin_all_candidates.geojson';

const allNames = [...Object.keys(CENSUS_TO_SLUG), ...Object.keys(COMBINED_CDPS)];
const nameFilter = allNames.map((n) => `NAME === '${n}'`).join(' || ');

console.log('Filtering and simplifying Census data...');
execSync(
	`mapshaper "${SHP_PATH}" ` +
		`-filter "${nameFilter}" ` +
		`-simplify dp 25% ` +
		`-o format=geojson "${TEMP_GEOJSON}"`,
	{ stdio: 'inherit' }
);

// Step 2: Read, deduplicate, assign slugs
const raw = JSON.parse(readFileSync(TEMP_GEOJSON, 'utf-8'));
console.log(`Raw features: ${raw.features.length}`);

const outputFeatures = [];

for (const feature of raw.features) {
	const name = feature.properties.NAME;

	// Deduplicate: only keep features whose center is in Marin
	if (!featureCenterInMarin(feature)) {
		console.log(`  Skipping out-of-Marin duplicate: ${name} (GEOID: ${feature.properties.GEOID})`);
		continue;
	}

	if (CENSUS_TO_SLUG[name]) {
		// Simple 1:1 mapping
		outputFeatures.push({
			type: 'Feature',
			properties: { slug: CENSUS_TO_SLUG[name], name },
			geometry: feature.geometry
		});
	} else if (COMBINED_CDPS[name]) {
		// Combined CDP → create a feature for each of our slugs
		for (const slug of COMBINED_CDPS[name]) {
			outputFeatures.push({
				type: 'Feature',
				properties: { slug, name },
				geometry: feature.geometry
			});
		}
	}
}

// Step 3: Add circle fallbacks
for (const town of CIRCLE_FALLBACKS) {
	outputFeatures.push({
		type: 'Feature',
		properties: { slug: town.slug, name: town.name },
		geometry: generateCirclePolygon(town.lat, town.lon, town.radiusKm)
	});
}

const output = {
	type: 'FeatureCollection',
	features: outputFeatures
};

const outPath = 'static/data/marin-boundaries.geojson';
writeFileSync(outPath, JSON.stringify(output));
console.log(`\nWrote ${outputFeatures.length} features to ${outPath}`);
console.log(`File size: ${(readFileSync(outPath).length / 1024).toFixed(1)} KB`);

// List all slugs
const slugs = outputFeatures.map((f) => f.properties.slug).sort();
console.log(`\nSlugs: ${slugs.join(', ')}`);

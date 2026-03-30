#!/usr/bin/env node

/**
 * Standalone scraper for Marin dog walker rates from Thumbtack.
 * Fetches the Thumbtack dog walking page for San Rafael, CA
 * and extracts pricing from JSON-LD LocalBusiness markup.
 *
 * Computes median walk price and monthly cost at 3 walks/week.
 */

import { put, head } from '@vercel/blob';

// ---- Proxy support ----
const PROXY_URL = process.env.SCRAPE_PROXY_URL;
const PROXY_SECRET = process.env.SCRAPE_PROXY_SECRET;

async function proxyFetch(url, options = {}) {
	if (PROXY_URL && PROXY_SECRET) {
		try {
			const res = await fetch(`${PROXY_URL}/proxy`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${PROXY_SECRET}` },
				body: JSON.stringify({ url, headers: options.headers || {}, method: options.method || 'GET', timeout: 30000 })
			});
			if (res.ok) {
				const result = await res.json();
				return { ok: result.status >= 200 && result.status < 300, status: result.status, text: async () => result.data, json: async () => JSON.parse(result.data) };
			}
			console.warn(`[proxy] Proxy returned ${res.status}, falling back to direct fetch`);
		} catch (err) {
			console.warn(`[proxy] Proxy failed: ${err.message}, falling back to direct fetch`);
		}
	}
	return fetch(url, options);
}

const BLOB_KEY = 'marin-dog-walker.json';
const MAX_HISTORY = 24; // 2 years at monthly
const THUMBTACK_URL = 'https://www.thumbtack.com/ca/san-rafael/dog-walking/';

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
	console.error('[sync-dog-walker] BLOB_READ_WRITE_TOKEN not set');
	process.exit(1);
}

/** Compute median of numeric array */
function computeMedian(values) {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
	}
	return sorted[mid];
}

/**
 * Parse a priceRange string like "$15 - $45" or "$20-$40" into [min, max].
 */
function parsePriceRange(priceRange) {
	if (!priceRange || typeof priceRange !== 'string') return null;

	// Match patterns like "$15 - $45", "$15-$45", "$20 to $40"
	const match = priceRange.match(/\$(\d+(?:\.\d+)?)\s*[-–—to]+\s*\$(\d+(?:\.\d+)?)/i);
	if (match) {
		return {
			min: parseFloat(match[1]),
			max: parseFloat(match[2])
		};
	}

	// Single price like "$25"
	const singleMatch = priceRange.match(/\$(\d+(?:\.\d+)?)/);
	if (singleMatch) {
		const price = parseFloat(singleMatch[1]);
		return { min: price, max: price };
	}

	return null;
}

/**
 * Extract dog walker pricing from Thumbtack page.
 */
async function scrapeDogWalkerRates() {
	console.log('[sync-dog-walker] Fetching Thumbtack page...');
	const res = await proxyFetch(THUMBTACK_URL, {
		headers: {
			'User-Agent':
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
			Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			'Accept-Language': 'en-US,en;q=0.9'
		}
	});

	if (!res.ok) {
		throw new Error(`thumbtack.com returned ${res.status}`);
	}

	const html = await res.text();
	const walkerPrices = [];

	// Strategy 1: Extract JSON-LD LocalBusiness objects
	const jsonLdMatches = html.matchAll(
		/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi
	);
	for (const match of jsonLdMatches) {
		try {
			const ld = JSON.parse(match[1]);
			const items = Array.isArray(ld) ? ld : [ld];
			for (const item of items) {
				if (
					item['@type'] === 'LocalBusiness' ||
					item['@type'] === 'ProfessionalService'
				) {
					const range = parsePriceRange(item.priceRange);
					if (range) {
						walkerPrices.push({
							name: item.name || 'Unknown',
							min: range.min,
							max: range.max,
							midpoint: Math.round(((range.min + range.max) / 2) * 100) / 100
						});
					}
				}
				// Also check @graph arrays
				if (item['@graph']) {
					for (const graphItem of item['@graph']) {
						if (
							graphItem['@type'] === 'LocalBusiness' ||
							graphItem['@type'] === 'ProfessionalService'
						) {
							const range = parsePriceRange(graphItem.priceRange);
							if (range) {
								walkerPrices.push({
									name: graphItem.name || 'Unknown',
									min: range.min,
									max: range.max,
									midpoint:
										Math.round(((range.min + range.max) / 2) * 100) / 100
								});
							}
						}
					}
				}
			}
		} catch {
			// Invalid JSON-LD, skip
		}
	}

	// Strategy 2: Look for price patterns in HTML
	if (walkerPrices.length === 0) {
		// Look for price range patterns like "$15 - $45/walk"
		const priceMatches = html.matchAll(
			/\$(\d+(?:\.\d+)?)\s*[-–—]\s*\$(\d+(?:\.\d+)?)\s*(?:\/|per\s+)?(?:walk|visit|hr|hour)?/gi
		);
		for (const match of priceMatches) {
			const min = parseFloat(match[1]);
			const max = parseFloat(match[2]);
			// Dog walking prices are typically $15-$75 per walk
			if (min >= 10 && max <= 100) {
				walkerPrices.push({
					name: 'Unknown (HTML extract)',
					min,
					max,
					midpoint: Math.round(((min + max) / 2) * 100) / 100
				});
			}
		}
	}

	// Strategy 3: Look for individual price mentions
	if (walkerPrices.length === 0) {
		const singlePrices = html.matchAll(
			/\$(\d+(?:\.\d+)?)\s*(?:\/|per\s+)?(?:walk|visit)/gi
		);
		for (const match of singlePrices) {
			const price = parseFloat(match[1]);
			if (price >= 10 && price <= 100) {
				walkerPrices.push({
					name: 'Unknown (HTML extract)',
					min: price,
					max: price,
					midpoint: price
				});
			}
		}
	}

	return walkerPrices;
}

async function main() {
	const start = Date.now();
	console.log('[sync-dog-walker] Starting...');

	let walkerPrices;
	try {
		walkerPrices = await scrapeDogWalkerRates();
	} catch (err) {
		console.error(`[sync-dog-walker] Scrape failed: ${err.message}`);
		// Continue with empty — will use fallback
		walkerPrices = [];
	}

	const scraped = walkerPrices.length > 0;
	const midpoints = walkerPrices.map((w) => w.midpoint);
	const allMins = walkerPrices.map((w) => w.min);
	const allMaxes = walkerPrices.map((w) => w.max);

	// Use scraped data or known fallbacks
	const medianWalkPrice = computeMedian(midpoints) ?? 30;
	const avgWalkPrice = midpoints.length > 0
		? Math.round((midpoints.reduce((a, b) => a + b, 0) / midpoints.length) * 100) / 100
		: 30;
	const minWalkPrice = allMins.length > 0 ? Math.min(...allMins) : 15;
	const maxWalkPrice = allMaxes.length > 0 ? Math.max(...allMaxes) : 45;

	// Monthly cost: 3 walks/week × 4.3 weeks/month
	const walksPerWeek = 3;
	const weeksPerMonth = 4.3;
	const monthlyAt3xWeek = Math.round(medianWalkPrice * walksPerWeek * weeksPerMonth);

	// "The Dog" monthly (walks + grooming + food + vet amortized)
	// Dog walker component only — the static item covers the full dog cost
	const monthlyWalkerOnly = monthlyAt3xWeek;

	const snapshot = {
		timestamp: new Date().toISOString(),
		walkerCount: walkerPrices.length,
		medianWalkPrice,
		avgWalkPrice,
		minWalkPrice,
		maxWalkPrice,
		monthlyAt3xWeek,
		monthlyWalkerOnly,
		scraped,
		source: scraped ? 'thumbtack.com' : 'fallback'
	};

	// Read existing blob
	let existing = { current: null, history: [] };
	try {
		const blob = await head(BLOB_KEY, { token });
		const res = await fetch(blob.downloadUrl, {
			headers: { Authorization: `Bearer ${token}` }
		});
		if (res.ok) {
			existing = await res.json();
		}
	} catch {
		console.log('[sync-dog-walker] No existing blob, starting fresh');
	}

	// Append history
	const history = [snapshot, ...existing.history].slice(0, MAX_HISTORY);
	const data = { current: snapshot, history };

	await put(BLOB_KEY, JSON.stringify(data), {
		access: 'private',
		contentType: 'application/json',
		addRandomSuffix: false,
		allowOverwrite: true,
		token
	});

	console.log(
		`[sync-dog-walker] OK: median=$${medianWalkPrice}/walk, avg=$${avgWalkPrice}/walk, range=$${minWalkPrice}-$${maxWalkPrice}, monthly(3x/wk)=$${monthlyAt3xWeek}, ${walkerPrices.length} walkers, source=${snapshot.source}, in ${Date.now() - start}ms`
	);
}

main().catch((err) => {
	console.error('[sync-dog-walker] FATAL:', err);
	process.exit(1);
});

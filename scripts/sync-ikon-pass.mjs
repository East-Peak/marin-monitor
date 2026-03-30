#!/usr/bin/env node

/**
 * Standalone scraper for Ikon Pass pricing data.
 * Fetches the Ikon Pass shop page and extracts pricing from
 * Schema.org JSON-LD Product markup or structured HTML.
 *
 * Stores adult, child, and family-of-4 season costs.
 */

import { put, head } from '@vercel/blob';

const BLOB_KEY = 'marin-ikon-pass.json';
const MAX_HISTORY = 24; // 2 years at monthly
const IKON_URL = 'https://www.ikonpass.com/en/shop-passes';

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
	console.error('[sync-ikon-pass] BLOB_READ_WRITE_TOKEN not set');
	process.exit(1);
}

/**
 * Extract pricing from Ikon Pass page.
 * Tries multiple strategies:
 * 1. Schema.org JSON-LD Product markup
 * 2. Structured price data in page HTML
 * 3. Regex patterns for price strings
 */
async function scrapeIkonPrices() {
	console.log('[sync-ikon-pass] Fetching Ikon Pass page...');
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 15000);
	let res;
	try {
		res = await fetch(IKON_URL, {
			signal: controller.signal,
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
			}
		});
	} finally {
		clearTimeout(timeoutId);
	}

	if (!res.ok) {
		throw new Error(`ikonpass.com returned ${res.status}`);
	}

	const html = await res.text();
	const prices = {};

	// Strategy 1: Look for JSON-LD Product markup
	const jsonLdMatches = html.matchAll(
		/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi
	);
	for (const match of jsonLdMatches) {
		try {
			const ld = JSON.parse(match[1]);
			const items = Array.isArray(ld) ? ld : [ld];
			for (const item of items) {
				if (item['@type'] === 'Product' || item['@type'] === 'Offer') {
					const name = (item.name || '').toLowerCase();
					const price =
						item.offers?.price || item.price || item.offers?.[0]?.price;
					if (price) {
						if (name.includes('ikon pass') && !name.includes('base')) {
							prices.adult = parseFloat(price);
						} else if (name.includes('base')) {
							prices.base = parseFloat(price);
						} else if (name.includes('child') || name.includes('kid')) {
							prices.child = parseFloat(price);
						}
					}
				}
			}
		} catch {
			// Invalid JSON-LD, skip
		}
	}

	// Strategy 2: Look for price patterns in HTML
	// Ikon Pass typically shows prices like "$1,399" or "$399"
	if (!prices.adult) {
		// Look for "Ikon Pass" followed by a price
		const ikonPassMatch = html.match(
			/Ikon\s+Pass(?:\s*<[^>]*>)*\s*(?:<[^>]*>)*\s*\$([0-9,]+)/i
		);
		if (ikonPassMatch) {
			prices.adult = parseFloat(ikonPassMatch[1].replace(/,/g, ''));
		}
	}

	if (!prices.child) {
		// Look for child/kid price patterns
		const childMatch = html.match(
			/(?:child|kid|youth|junior)(?:\s*<[^>]*>)*\s*(?:<[^>]*>)*\s*\$([0-9,]+)/i
		);
		if (childMatch) {
			prices.child = parseFloat(childMatch[1].replace(/,/g, ''));
		}
	}

	// Strategy 3: Extract all large dollar amounts and infer
	if (!prices.adult) {
		const allPrices = [];
		const priceMatches = html.matchAll(/\$([0-9,]+(?:\.\d{2})?)/g);
		for (const match of priceMatches) {
			const val = parseFloat(match[1].replace(/,/g, ''));
			if (val >= 200 && val <= 3000) {
				allPrices.push(val);
			}
		}
		// Deduplicate
		const unique = [...new Set(allPrices)].sort((a, b) => b - a);
		if (unique.length >= 2) {
			// Highest is likely adult full pass, look for a much lower one for child
			prices.adult = prices.adult || unique[0];
			const childCandidate = unique.find((p) => p < prices.adult * 0.5);
			if (childCandidate) {
				prices.child = prices.child || childCandidate;
			}
		} else if (unique.length === 1) {
			prices.adult = prices.adult || unique[0];
		}
	}

	return prices;
}

async function main() {
	const start = Date.now();
	console.log('[sync-ikon-pass] Starting...');

	let prices;
	try {
		prices = await scrapeIkonPrices();
	} catch (err) {
		console.warn(`[sync-ikon-pass] Scrape failed: ${err.message}, using fallback values`);
		prices = {};
	}

	// Use known fallback prices if scraping didn't find them
	const adultPrice = prices.adult || 1399;
	const childPrice = prices.child || 399;
	const basePrice = prices.base || null;

	// Family of 4 season cost: 2 adults + 2 kids
	const familyOf4 = adultPrice * 2 + childPrice * 2;

	// Monthly amortized (12 months)
	const monthlyAmortized = Math.round(familyOf4 / 12);

	const snapshot = {
		timestamp: new Date().toISOString(),
		adultPrice,
		childPrice,
		basePrice,
		familyOf4,
		monthlyAmortized,
		scraped: !!(prices.adult || prices.child),
		source: prices.adult ? 'ikonpass.com' : 'fallback'
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
		console.log('[sync-ikon-pass] No existing blob, starting fresh');
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
		`[sync-ikon-pass] OK: adult=$${adultPrice}, child=$${childPrice}, family-of-4=$${familyOf4}, monthly=$${monthlyAmortized}, source=${snapshot.source}, in ${Date.now() - start}ms`
	);
}

main().catch((err) => {
	console.error('[sync-ikon-pass] FATAL:', err);
	process.exit(1);
});

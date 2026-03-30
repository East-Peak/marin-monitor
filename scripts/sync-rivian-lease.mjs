#!/usr/bin/env node

/**
 * Standalone scraper for Rivian R1S lease payment data.
 * Fetches the Rivian R1S product page and extracts the
 * lease payment and MSRP from the HTML.
 *
 * Rivian's site is Next.js SSR — the lease headline is typically
 * rendered in the initial HTML as "Lease from $899/mo" or similar.
 */

import { put, head } from '@vercel/blob';
import { withPreservedSuccessfulScrapeMetadata } from './shared/scrape-metadata.mjs';

const BLOB_KEY = 'marin-rivian-lease.json';
const MAX_HISTORY = 24; // 2 years at monthly
const RIVIAN_URL = 'https://www.rivian.com/r1s';

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
	console.error('[sync-rivian-lease] BLOB_READ_WRITE_TOKEN not set');
	process.exit(1);
}

/**
 * Extract lease and MSRP data from Rivian R1S page.
 */
async function scrapeRivianLease() {
	console.log('[sync-rivian-lease] Fetching Rivian R1S page...');
	const res = await fetch(RIVIAN_URL, {
		headers: {
			'User-Agent':
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
			Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			'Accept-Language': 'en-US,en;q=0.9'
		}
	});

	if (!res.ok) {
		throw new Error(`rivian.com returned ${res.status}`);
	}

	const html = await res.text();
	const result = {};

	// Strategy 1: Look for "Lease from $XXX/mo" pattern
	const leasePatterns = [
		/[Ll]ease\s+from\s+\$([0-9,]+)\s*\/?\s*mo/i,
		/[Ll]ease\s+(?:starting\s+)?(?:at|from)\s+\$([0-9,]+)/i,
		/\$([0-9,]+)\s*\/\s*mo(?:nth)?\s*(?:lease|est\.?\s*lease)/i,
		/lease.*?\$([0-9,]+)\s*(?:\/\s*mo|per\s*month)/i
	];

	for (const pattern of leasePatterns) {
		const match = html.match(pattern);
		if (match) {
			result.leaseMonthly = parseInt(match[1].replace(/,/g, ''), 10);
			break;
		}
	}

	// Strategy 2: Look for MSRP / starting price
	const msrpPatterns = [
		/(?:starting\s+at|from|MSRP|price)\s*\$([0-9,]+)/i,
		/\$([0-9]{2,3},[0-9]{3})\s*(?:MSRP|starting)/i,
		/\$([0-9,]+)\s*(?:before|pre-)/i
	];

	for (const pattern of msrpPatterns) {
		const match = html.match(pattern);
		if (match) {
			const price = parseInt(match[1].replace(/,/g, ''), 10);
			// MSRP should be in the $70K-$120K range for R1S
			if (price >= 50000 && price <= 150000) {
				result.msrp = price;
				break;
			}
		}
	}

	// Strategy 3: Look for JSON-LD Product/Vehicle markup
	const jsonLdMatches = html.matchAll(
		/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi
	);
	for (const match of jsonLdMatches) {
		try {
			const ld = JSON.parse(match[1]);
			const items = Array.isArray(ld) ? ld : [ld];
			for (const item of items) {
				if (
					item['@type'] === 'Product' ||
					item['@type'] === 'Vehicle' ||
					item['@type'] === 'Car'
				) {
					const offer = item.offers?.[0] || item.offers || {};
					if (offer.price && !result.msrp) {
						const price = parseFloat(String(offer.price).replace(/,/g, ''));
						if (price >= 50000 && price <= 150000) {
							result.msrp = price;
						}
					}
				}
			}
		} catch {
			// Invalid JSON-LD
		}
	}

	// Strategy 4: Broad search for monthly payment amounts
	if (!result.leaseMonthly) {
		const monthlyMatches = html.matchAll(/\$([0-9,]+)\s*\/\s*mo/gi);
		for (const match of monthlyMatches) {
			const amount = parseInt(match[1].replace(/,/g, ''), 10);
			// Lease payments for R1S should be $600-$2000 range
			if (amount >= 500 && amount <= 2500) {
				result.leaseMonthly = amount;
				break;
			}
		}
	}

	return result;
}

async function main() {
	const start = Date.now();
	console.log('[sync-rivian-lease] Starting...');

	let scraped;
	try {
		scraped = await scrapeRivianLease();
	} catch (err) {
		console.error(`[sync-rivian-lease] Scrape failed: ${err.message}`);
		scraped = {};
	}

	const hasLiveData = !!(scraped.leaseMonthly || scraped.msrp);

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
		console.log('[sync-rivian-lease] No existing blob, starting fresh');
	}

	// Use scraped or fallback values
	const leaseMonthly = scraped.leaseMonthly || 899;
	const msrp = scraped.msrp || 79900;
	const nowIso = new Date().toISOString();
	const snapshot = withPreservedSuccessfulScrapeMetadata({
		timestamp: nowIso,
		leaseMonthly,
		msrp,
		scraped: hasLiveData,
		source: hasLiveData ? 'rivian.com' : 'fallback'
	}, {
		wasLive: hasLiveData,
		previous: existing.current,
		includeLegacyLastLive: true
	});

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
		`[sync-rivian-lease] OK: lease=$${leaseMonthly}/mo, msrp=$${msrp?.toLocaleString() ?? 'N/A'}, source=${snapshot.source}, in ${Date.now() - start}ms`
	);
}

main().catch((err) => {
	console.error('[sync-rivian-lease] FATAL:', err);
	process.exit(1);
});

#!/usr/bin/env node

/**
 * Standalone scraper for Marin summer camp price data.
 * Reads camp data from the Marin Families site (marinfamilies.com).
 *
 * Fetches the /camps page, extracts session pricing from the HTML,
 * and computes median/average weekly prices across all Marin camps.
 *
 * Since marinfamilies.com is Next.js with SSR, this fetches the rendered HTML
 * and looks for JSON data embedded in __NEXT_DATA__ or structured elements.
 *
 * SIMPLEST APPROACH: Read camp data directly from the marin-families repo
 * on this Mac (both repos live on the same machine). For GitHub Actions,
 * fall back to fetching from the live site.
 */

import { put, head } from '@vercel/blob';
import { readFile } from 'fs/promises';
import { join } from 'path';

const BLOB_KEY = 'marin-camp-prices.json';
const MAX_HISTORY = 24; // 2 years at monthly
const token = process.env.BLOB_READ_WRITE_TOKEN;

if (!token) {
	console.error('[sync-camp-prices] BLOB_READ_WRITE_TOKEN not set');
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
 * Normalize a price to weekly.
 * - per_week: as-is
 * - per_day: multiply by 5 (standard camp week)
 * - per_session: treat as weekly (sessions are typically 1-week blocks)
 */
function normalizeToWeekly(amount, unit, daysOfWeek) {
	if (amount === null || amount === undefined || amount <= 0) return null;
	switch (unit) {
		case 'per_week':
			return amount;
		case 'per_day':
			return amount * (daysOfWeek?.length || 5);
		case 'per_session':
			// per_session prices for camps are typically per-week session blocks
			return amount;
		default:
			return null;
	}
}

/**
 * Extract session prices from camp JSON data (provider/program/session structure).
 */
function extractSessionPrices(campData) {
	const prices = [];
	for (const entry of campData) {
		const providerName = entry.provider?.name || 'Unknown';
		const sessions = entry.sessions || [];
		for (const session of sessions) {
			if (!session.price_amount || !session.price_unit) continue;
			const weekly = normalizeToWeekly(
				session.price_amount,
				session.price_unit,
				session.days_of_week
			);
			if (weekly !== null && weekly > 0) {
				prices.push({
					provider: providerName,
					program: session.program_slug || 'unknown',
					weeklyPrice: Math.round(weekly),
					originalAmount: session.price_amount,
					originalUnit: session.price_unit
				});
			}
		}
	}
	return prices;
}

/**
 * Try to read camp data from local marin-families repo.
 * This works on the Mac mini where both repos live.
 */
async function readLocalCampData() {
	const basePath = join(process.cwd(), '..', 'marin-families', 'data', 'seed');
	const files = ['camps.json', 'camps_wave2.json'];
	const allData = [];

	for (const file of files) {
		try {
			const filePath = join(basePath, file);
			const raw = await readFile(filePath, 'utf-8');
			const data = JSON.parse(raw);
			allData.push(...data);
			console.log(`[sync-camp-prices] Read ${data.length} providers from ${file}`);
		} catch (err) {
			console.warn(`[sync-camp-prices] Could not read ${file}: ${err.message}`);
		}
	}

	return allData;
}

/**
 * Fetch camp data from the live marinfamilies.com site.
 * Looks for __NEXT_DATA__ script tag with embedded JSON.
 */
async function fetchLiveCampData() {
	console.log('[sync-camp-prices] Fetching from marinfamilies.com/camps...');
	const res = await fetch('https://marinfamilies.com/camps', {
		headers: {
			'User-Agent':
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
			Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
		}
	});

	if (!res.ok) {
		throw new Error(`marinfamilies.com returned ${res.status}`);
	}

	const html = await res.text();

	// Try to extract __NEXT_DATA__ JSON
	const nextDataMatch = html.match(
		/<script\s+id="__NEXT_DATA__"\s+type="application\/json">([\s\S]*?)<\/script>/
	);
	if (nextDataMatch) {
		const nextData = JSON.parse(nextDataMatch[1]);
		// Navigate the Next.js data structure to find providers
		const pageProps = nextData?.props?.pageProps;
		if (pageProps?.providers) {
			console.log(
				`[sync-camp-prices] Found ${pageProps.providers.length} providers in __NEXT_DATA__`
			);
			return pageProps.providers;
		}
	}

	// Fallback: try to find price data in the HTML
	// Look for patterns like "$645/week" or "$695 per week"
	const priceMatches = html.matchAll(
		/\$(\d{2,4})\s*(?:\/|per\s+)(?:week|wk)/gi
	);
	const fallbackPrices = [];
	for (const match of priceMatches) {
		fallbackPrices.push({
			provider: 'Unknown (HTML extract)',
			program: 'unknown',
			weeklyPrice: parseInt(match[1]),
			originalAmount: parseInt(match[1]),
			originalUnit: 'per_week'
		});
	}

	if (fallbackPrices.length > 0) {
		console.log(
			`[sync-camp-prices] Extracted ${fallbackPrices.length} prices from HTML patterns`
		);
		return fallbackPrices;
	}

	throw new Error('Could not extract camp data from marinfamilies.com');
}

async function main() {
	const start = Date.now();
	console.log('[sync-camp-prices] Starting...');

	// Try local files first (Mac mini), fall back to live site
	let allPrices = [];
	let source = 'unknown';

	try {
		const localData = await readLocalCampData();
		if (localData.length > 0) {
			allPrices = extractSessionPrices(localData);
			source = 'local-files';
			console.log(
				`[sync-camp-prices] Extracted ${allPrices.length} session prices from local files`
			);
		}
	} catch (err) {
		console.warn(`[sync-camp-prices] Local read failed: ${err.message}`);
	}

	if (allPrices.length === 0) {
		try {
			const liveData = await fetchLiveCampData();
			// If liveData is already price objects (from HTML fallback)
			if (liveData.length > 0 && liveData[0].weeklyPrice) {
				allPrices = liveData;
			} else {
				allPrices = extractSessionPrices(liveData);
			}
			source = 'marinfamilies.com';
			console.log(
				`[sync-camp-prices] Extracted ${allPrices.length} session prices from live site`
			);
		} catch (err) {
			console.error(`[sync-camp-prices] Live fetch failed: ${err.message}`);
		}
	}

	if (allPrices.length === 0) {
		console.error('[sync-camp-prices] No price data found from any source');
		process.exit(1);
	}

	// Compute statistics
	const weeklyPrices = allPrices.map((p) => p.weeklyPrice);
	const medianWeekly = computeMedian(weeklyPrices);
	const avgWeekly = Math.round(weeklyPrices.reduce((a, b) => a + b, 0) / weeklyPrices.length);
	const minWeekly = Math.min(...weeklyPrices);
	const maxWeekly = Math.max(...weeklyPrices);

	// Unique providers
	const uniqueProviders = new Set(allPrices.map((p) => p.provider)).size;

	// Summer camp monthly cost: 2 kids, assume 8 weeks of camp, amortized over 12 months
	// monthly = (median_weekly * 2 kids * 8 weeks) / 12 months
	const monthlyAmortized2Kids = Math.round((medianWeekly * 2 * 8) / 12);

	const snapshot = {
		timestamp: new Date().toISOString(),
		source,
		sessionCount: allPrices.length,
		providerCount: uniqueProviders,
		medianWeekly,
		avgWeekly,
		minWeekly,
		maxWeekly,
		monthlyAmortized2Kids
	};

	// Read existing blob for history
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
		console.log('[sync-camp-prices] No existing blob, starting fresh');
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
		`[sync-camp-prices] OK: median=$${medianWeekly}/wk, avg=$${avgWeekly}/wk, range=$${minWeekly}-$${maxWeekly}, ${allPrices.length} sessions from ${uniqueProviders} providers, monthly(2 kids)=$${monthlyAmortized2Kids}, in ${Date.now() - start}ms`
	);
}

main().catch((err) => {
	console.error('[sync-camp-prices] FATAL:', err);
	process.exit(1);
});

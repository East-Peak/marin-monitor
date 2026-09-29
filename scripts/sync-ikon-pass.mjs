#!/usr/bin/env node

/**
 * Standalone scraper for Ikon Pass pricing data. Runs on the Mac mini via
 * launchd. ikonpass.com is a client-rendered app, so the pass page is rendered
 * with Playwright and the adult season price read from its text.
 *
 * Stores adult, child, and family-of-4 season costs. Ikon publishes no child
 * price (only a "save up to $100" child discount), so the child price is
 * carried forward from the previous snapshot and marked unobserved.
 */

import { put, head } from '@vercel/blob';
import { chromium } from '@playwright/test';
import { IKON_PASS_URL, parseIkonAdultPrice } from './shared/ikon-pass.mjs';
import { withPreservedSuccessfulScrapeMetadata } from './shared/scrape-metadata.mjs';

const BLOB_KEY = 'marin-ikon-pass.json';
const MAX_HISTORY = 24; // 2 years at monthly

const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) {
	console.error('[sync-ikon-pass] BLOB_READ_WRITE_TOKEN not set');
	process.exit(1);
}

/** Render the pass page and read the adult season price. */
async function scrapeAdultPrice() {
	console.log(`[sync-ikon-pass] Rendering ${IKON_PASS_URL}...`);
	const browser = await chromium.launch({ headless: true });
	try {
		const page = await browser.newPage();
		const response = await page.goto(IKON_PASS_URL, {
			waitUntil: 'domcontentloaded',
			timeout: 45000
		});
		if (!response?.ok()) throw new Error(`ikonpass.com returned ${response?.status()}`);
		await page.waitForFunction(() => /From\s+\$[\d,]+/.test(document.body.innerText), null, {
			timeout: 30000
		});
		return parseIkonAdultPrice(await page.evaluate(() => document.body.innerText));
	} finally {
		await browser.close();
	}
}

async function main() {
	const start = Date.now();
	console.log('[sync-ikon-pass] Starting...');

	let liveAdult = null;
	try {
		liveAdult = await scrapeAdultPrice();
		if (liveAdult === null) console.warn('[sync-ikon-pass] No adult price on the pass page');
	} catch (err) {
		console.warn(`[sync-ikon-pass] Scrape failed: ${err.message}`);
	}

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

	// A failed scrape keeps the previous prices; it never advances the observation.
	const previous = existing.current;
	const adultPrice = liveAdult ?? previous?.adultPrice ?? 1399;
	const childPrice = previous?.childPrice ?? 399;
	const basePrice = previous?.basePrice ?? null;

	// Family of 4 season cost: 2 adults + 2 kids
	const familyOf4 = adultPrice * 2 + childPrice * 2;

	// Monthly amortized (12 months)
	const monthlyAmortized = Math.round(familyOf4 / 12);
	const nowIso = new Date().toISOString();
	const scrapedLive = liveAdult !== null;
	const snapshot = withPreservedSuccessfulScrapeMetadata(
		{
			timestamp: nowIso,
			adultPrice,
			childPrice,
			basePrice,
			familyOf4,
			monthlyAmortized,
			scraped: scrapedLive,
			childPriceObserved: false,
			source: scrapedLive ? 'ikonpass.com' : 'fallback'
		},
		{
			wasLive: scrapedLive,
			previous: existing.current,
			includeLegacyLastLive: true
		}
	);

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

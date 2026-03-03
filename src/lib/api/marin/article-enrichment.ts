/**
 * Optional article enrichment for low-throughput local sources.
 *
 * We only fetch full article pages for a small domain allowlist to improve
 * local relevance filtering when RSS title/description is ambiguous.
 */

import type { NewsItem } from '$lib/types';
import { logger } from '$lib/config/api';
import { fetchWithTimeout } from './fetch-helpers';
import { isInsideMarin } from '$lib/geo/proximity';

const ENRICHED_DOMAINS = ['marinij.com', 'ptreyeslight.com'];
const MAX_ITEMS_PER_BATCH = 12;
const BODY_CHAR_LIMIT = 1400;
const LOCATION_BATCH_LIMIT = 10;
const LOCATION_CANDIDATE_LIMIT = 3;
const GEOCODE_DELAY_MS = 1100;

const pageCache = new Map<string, string>();
const geocodeCache = new Map<string, { lat: number; lon: number } | null>();

function shouldEnrich(item: NewsItem): boolean {
	if (!item.link) return false;
	if (item.verification === 'satire' || item.source === 'Marin Lately') return false;
	try {
		const host = new URL(item.link).hostname.toLowerCase();
		return ENRICHED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
	} catch {
		return false;
	}
}

function stripText(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

function extractArticleText(html: string): string {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, 'text/html');

	// Remove noisy nodes before extracting text.
	doc
		.querySelectorAll('script, style, noscript, nav, footer, header, aside')
		.forEach((n) => n.remove());

	const leadMeta =
		doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
		doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
		'';

	const articleNode = doc.querySelector('article');
	const paragraphs = Array.from((articleNode || doc).querySelectorAll('p'))
		.map((p) => stripText(p.textContent || ''))
		.filter(Boolean)
		.slice(0, 8)
		.join(' ');

	return stripText(`${leadMeta} ${paragraphs}`).slice(0, BODY_CHAR_LIMIT);
}

async function fetchArticleExcerpt(url: string): Promise<string | null> {
	if (pageCache.has(url)) return pageCache.get(url) || null;

	try {
		const response = await fetchWithTimeout(`/api/article?url=${encodeURIComponent(url)}`);
		if (!response.ok) return null;
		const html = await response.text();
		const excerpt = extractArticleText(html);
		pageCache.set(url, excerpt);
		return excerpt || null;
	} catch (error) {
		logger.warn('ENRICH', `Failed to enrich ${url}: ${(error as Error).message}`);
		return null;
	}
}

function normalizeStreet(value: string): string {
	return value.replace(/\s+/g, ' ').replace(/,\s*$/g, '').trim();
}

function extractAddressCandidates(text: string): string[] {
	const cleaned = text.replace(/\s+/g, ' ').trim();
	const streetSuffix =
		'(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|place|pl|terrace|ter|trail|trl|highway|hwy|way|parkway|pkwy)';

	const addressPattern = new RegExp(
		`\\b\\d{1,5}\\s+[a-z0-9.'-]+(?:\\s+[a-z0-9.'-]+){0,6}\\s+${streetSuffix}\\b(?:\\s+(?:suite|ste|unit)\\s*[a-z0-9-]+)?`,
		'gi'
	);

	const intersectionPattern = new RegExp(
		`\\b([a-z0-9.'-]+(?:\\s+[a-z0-9.'-]+){0,4}\\s+${streetSuffix})\\s*(?:and|&|at)\\s*([a-z0-9.'-]+(?:\\s+[a-z0-9.'-]+){0,4}\\s+${streetSuffix})\\b`,
		'gi'
	);

	const candidates: string[] = [];
	let match: RegExpExecArray | null = null;

	while ((match = addressPattern.exec(cleaned)) !== null) {
		candidates.push(normalizeStreet(match[0]));
		if (candidates.length >= LOCATION_CANDIDATE_LIMIT) break;
	}

	while (candidates.length < LOCATION_CANDIDATE_LIMIT) {
		const intersectionMatch = intersectionPattern.exec(cleaned);
		if (!intersectionMatch) break;
		candidates.push(
			`${normalizeStreet(intersectionMatch[1])} and ${normalizeStreet(intersectionMatch[2])}`
		);
	}

	return Array.from(new Set(candidates)).slice(0, LOCATION_CANDIDATE_LIMIT);
}

function isLikelyIntersection(candidate: string): boolean {
	return /\s(?:and|&|at)\s/i.test(candidate);
}


async function geocodeCandidate(
	candidate: string,
	townHint?: string
): Promise<{
	lat: number;
	lon: number;
} | null> {
	const townPart = townHint ? `${townHint}, ` : '';
	const query = `${candidate}, ${townPart}Marin County, California`;
	const cacheKey = query.toLowerCase();

	if (geocodeCache.has(cacheKey)) {
		return geocodeCache.get(cacheKey) || null;
	}

	try {
		const params = new URLSearchParams({
			q: candidate,
			town: townHint ?? ''
		});
		const response = await fetchWithTimeout(`/api/geocode?${params.toString()}`);
		if (!response.ok) {
			geocodeCache.set(cacheKey, null);
			return null;
		}
		const payload = (await response.json()) as { lat?: number; lon?: number } | null;
		const result = payload?.lat !== undefined && payload?.lon !== undefined ? payload : null;
		if (!result) {
			geocodeCache.set(cacheKey, null);
			return null;
		}

		const lat = Number(result.lat);
		const lon = Number(result.lon);
		if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isInsideMarin(lat, lon)) {
			geocodeCache.set(cacheKey, null);
			return null;
		}

		const location = { lat, lon };
		geocodeCache.set(cacheKey, location);
		return location;
	} catch (error) {
		logger.warn('ENRICH', `Geocode failed for "${candidate}": ${(error as Error).message}`);
		geocodeCache.set(cacheKey, null);
		return null;
	}
}

export async function enrichItemsForLocation(items: NewsItem[]): Promise<NewsItem[]> {
	const targetItems = items
		.filter(
			(item) =>
				!!item.link &&
				!item.lat &&
				!item.lon &&
				item.verification !== 'satire' &&
				item.source !== 'Marin Lately'
		)
		.slice(0, LOCATION_BATCH_LIMIT);

	if (targetItems.length === 0) return items;

	const updates = new Map<
		string,
		{
			lat: number;
			lon: number;
			locationConfidence: 'exact' | 'approx';
			locationEvidence: string;
		}
	>();

	for (const item of targetItems) {
		const fullTextParts = [item.title, item.description || '', item.content || ''];
		const excerpt = await fetchArticleExcerpt(item.link);
		if (excerpt) {
			fullTextParts.push(excerpt);
		}
		const combinedText = fullTextParts.filter(Boolean).join(' ');
		if (!combinedText) continue;

		const candidates = extractAddressCandidates(combinedText);
		for (const candidate of candidates) {
			// Skip if already cached (no delay needed for cache hits)
			const cacheKey = `${candidate}, ${item.town ?? ''}, Marin County, California`.toLowerCase();
			if (!geocodeCache.has(cacheKey)) {
				await new Promise((r) => setTimeout(r, GEOCODE_DELAY_MS));
			}
			const location = await geocodeCandidate(candidate, item.town);
			if (!location) continue;

			updates.set(item.id, {
				lat: location.lat,
				lon: location.lon,
				locationConfidence: isLikelyIntersection(candidate) ? 'approx' : 'exact',
				locationEvidence: candidate
			});
			break;
		}
	}

	if (updates.size === 0) return items;

	return items.map((item) => {
		const update = updates.get(item.id);
		if (!update) return item;
		return {
			...item,
			lat: update.lat,
			lon: update.lon,
			locationConfidence: update.locationConfidence,
			locationEvidence: update.locationEvidence
		};
	});
}

export async function enrichItemsForRelevance(items: NewsItem[]): Promise<NewsItem[]> {
	const candidates = items.filter(shouldEnrich).slice(0, MAX_ITEMS_PER_BATCH);
	if (candidates.length === 0) return items;

	const enrichedMap = new Map<string, string>();
	await Promise.all(
		candidates.map(async (item) => {
			const excerpt = await fetchArticleExcerpt(item.link);
			if (excerpt) enrichedMap.set(item.id, excerpt);
		})
	);

	if (enrichedMap.size === 0) return items;

	return items.map((item) => {
		const excerpt = enrichedMap.get(item.id);
		if (!excerpt) return item;
		return { ...item, content: item.content || excerpt };
	});
}

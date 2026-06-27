/**
 * Shared utilities for server-side scrapers.
 * Ported from scripts/extract-activity-feeds.mjs and scripts/extract-police-logs.mjs
 */
import { DOMParser } from 'linkedom/worker';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import { stripHtml, decodeEntities } from '../html-text.js';

// DOM-based strip + single-pass entity decode live in ../html-text.js (shared
// with the standalone .mjs scrapers). Re-exported here so existing importers
// (police.ts etc.) are unchanged.
export { stripHtml, decodeEntities };

export function excerpt(raw = '', maxLength = 220): string {
	const text = stripHtml(raw);
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

export function slugify(raw = ''): string {
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

export function toIsoDate(dateInput: unknown): string {
	if (!dateInput) return new Date().toISOString();
	if (dateInput instanceof Date) {
		return Number.isFinite(dateInput.getTime())
			? dateInput.toISOString()
			: new Date().toISOString();
	}

	const cleaned = String(dateInput)
		.replace(/(\d{1,2}:\d{2})(am|pm)\b/i, '$1 $2')
		.replace(/\s+/g, ' ')
		.trim();
	const date = new Date(cleaned);
	return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

export async function safeFetch(url: string, timeoutMs = 15000): Promise<string> {
	const response = await fetchWithTimeout(
		url,
		{
			headers: {
				'User-Agent': 'Mozilla/5.0',
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
			}
		},
		timeoutMs
	);
	if (!response.ok) throw new Error(`${url} → ${response.status}`);
	return await response.text();
}

export async function fetchLastModified(url: string): Promise<string> {
	try {
		const response = await fetchWithTimeout(
			url,
			{
				method: 'HEAD',
				headers: { 'User-Agent': 'Mozilla/5.0' }
			},
			10000
		);
		const header = response.headers.get('last-modified') || response.headers.get('date');
		if (header) {
			const timestamp = new Date(header).getTime();
			if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
		}
	} catch {
		// fall through
	}
	return new Date().toISOString();
}

export function parseXml(xml: string): Document {
	return new DOMParser().parseFromString(xml, 'text/xml') as unknown as Document;
}

export function parseHtml(html: string): Document {
	const sanitized = html
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script(?![^>]*application\/ld\+json)[\s\S]*?<\/script>/gi, ' ');
	return new DOMParser().parseFromString(sanitized, 'text/html') as unknown as Document;
}

export function normalizeWhitespace(raw = ''): string {
	return raw.replace(/\s+/g, ' ').trim();
}

export async function safeParse<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
	try {
		return await fn();
	} catch (err) {
		console.warn(`[WARN] ${label}: ${(err as Error).message}`);
		return [];
	}
}

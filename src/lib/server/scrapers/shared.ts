/**
 * Shared utilities for server-side scrapers.
 * Ported from scripts/extract-activity-feeds.mjs and scripts/extract-police-logs.mjs
 */
import { JSDOM } from 'jsdom';
import { fetchWithTimeout } from '$lib/server/fetch-utils';

export function stripHtml(raw = ''): string {
	return raw
		.replace(/<!\[CDATA\[|\]\]>/g, '')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&quot;/gi, '"')
		.replace(/&#039;|&apos;/gi, "'")
		.replace(/&#8211;|&#x2013;/gi, '–')
		.replace(/&#8212;|&#x2014;/gi, '—')
		.replace(/&#8217;|&#x2019;/gi, "'")
		.replace(/&#8220;|&#x201c;/gi, '"')
		.replace(/&#8221;|&#x201d;/gi, '"')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/\s+/g, ' ')
		.trim();
}

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
	return new JSDOM(xml, { contentType: 'text/xml' }).window.document;
}

export function parseHtml(html: string): Document {
	const sanitized = html
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script(?![^>]*application\/ld\+json)[\s\S]*?<\/script>/gi, ' ');
	return new JSDOM(sanitized).window.document;
}

export function normalizeWhitespace(raw = ''): string {
	return raw.replace(/\s+/g, ' ').trim();
}

export function decodeEntities(raw: string): string {
	return raw
		.replace(/&#x([0-9a-f]+);/gi, (_, value) =>
			String.fromCodePoint(Number.parseInt(value, 16))
		)
		.replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number.parseInt(value, 10)))
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&quot;/gi, '"')
		.replace(/&(apos|#39);/gi, "'")
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>');
}

export async function safeParse<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
	try {
		return await fn();
	} catch (err) {
		console.warn(`[WARN] ${label}: ${(err as Error).message}`);
		return [];
	}
}

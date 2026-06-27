/**
 * Pure, side-effect-free helpers extracted from extract-activity-feeds.mjs.
 * No fetch, no fs, no global mutation — safe to unit-test without network or disk.
 */

import { stripHtml } from '../../src/lib/server/html-text.js';

export const MAX_PAST_DAYS = 300;
export const MAX_FUTURE_DAYS = 400;

// DOM-based strip + single-pass decode now live in the shared module.
export { stripHtml };

export function excerpt(raw = '', maxLength = 220) {
	const text = stripHtml(raw);
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

export function slugify(raw = '') {
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

/**
 * Returns true when `timestamp` (ms) falls within the allowed window relative
 * to `now` (ms, defaults to Date.now()).
 */
export function isTimely(timestamp, now = Date.now()) {
	const deltaDays = (timestamp - now) / (1000 * 60 * 60 * 24);
	return deltaDays >= -MAX_PAST_DAYS && deltaDays <= MAX_FUTURE_DAYS;
}

export function toIsoDate(dateInput) {
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

export function buildEventTitle(eventName, dateInput, hasRegistration) {
	const parts = [eventName];
	if (dateInput) {
		const d = new Date(dateInput);
		if (Number.isFinite(d.getTime())) {
			parts.push(
				d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
			);
		}
	}
	if (hasRegistration) parts.push('Registration open');
	return parts.join(' — ');
}

export function flattenJsonLdEvents(node) {
	if (!node) return [];
	if (Array.isArray(node)) {
		return node.flatMap((entry) => flattenJsonLdEvents(entry));
	}
	if (typeof node !== 'object') return [];
	if (node['@type'] === 'Event') return [node];
	if (Array.isArray(node['@graph'])) {
		return flattenJsonLdEvents(node['@graph']);
	}
	if (Array.isArray(node.itemListElement)) {
		return flattenJsonLdEvents(node.itemListElement);
	}
	if (node.item) {
		return flattenJsonLdEvents(node.item);
	}
	return [];
}

export function normalizeJsonLd(raw) {
	return raw.trim();
}

/**
 * Builds a normalised activity item.  `now` (ms, defaults to Date.now()) may
 * be injected for deterministic unit tests.
 */
export function buildItem(
	{
		category,
		source,
		title,
		link,
		pubDate,
		description,
		content,
		verification = 'community',
		town,
		townSlug,
		lat,
		lon,
		topics = []
	},
	now = Date.now()
) {
	const iso = toIsoDate(pubDate);
	const timestamp = new Date(iso).getTime();
	if (!Number.isFinite(timestamp) || !isTimely(timestamp, now)) return null;

	const hasCoords = typeof lat === 'number' && typeof lon === 'number';
	return {
		id: `${category}:${slugify(source)}:${slugify(title)}:${slugify(link)}`,
		title,
		link,
		pubDate: iso,
		timestamp,
		description: description ? excerpt(description) : undefined,
		content: content ? stripHtml(content) : undefined,
		source,
		category,
		verification,
		town,
		townSlug,
		lat: hasCoords ? lat : undefined,
		lon: hasCoords ? lon : undefined,
		locationConfidence: hasCoords ? 'exact' : townSlug ? 'town' : undefined,
		locationEvidence: hasCoords ? source : town ? town : undefined,
		topics
	};
}

export function inferTownFromText(text) {
	const lower = text.toLowerCase();
	if (lower.includes('novato')) return { town: 'Novato', townSlug: 'novato' };
	if (lower.includes('mill valley') || lower.includes('mt. tam') || lower.includes('mt tam')) {
		return { town: 'Mill Valley', townSlug: 'mill-valley' };
	}
	if (lower.includes('fairfax')) return { town: 'Fairfax', townSlug: 'fairfax' };
	if (lower.includes('san rafael')) return { town: 'San Rafael', townSlug: 'san-rafael' };
	if (lower.includes('point reyes')) {
		return { town: 'Point Reyes Station', townSlug: 'point-reyes' };
	}
	if (lower.includes('stinson')) return { town: 'Stinson Beach', townSlug: 'stinson-beach' };
	return {};
}

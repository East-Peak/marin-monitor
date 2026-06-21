/**
 * Pure helper functions shared across activity scraper sub-modules.
 * All functions are pure (no I/O) and independently testable.
 */
import type { NewsItem } from '$lib/types';
import { stripHtml, excerpt, slugify, toIsoDate } from '../shared';
import type { BuildItemParams } from './types';

export const MAX_PAST_DAYS = 300;
export const MAX_FUTURE_DAYS = 400;
export const ANNUAL_EVENT_STALENESS_DAYS = 180;

export function getPacificsSeasonYear(now: number): number {
	const current = new Date(now);
	const year = current.getFullYear();
	return current.getMonth() >= 9 ? year + 1 : year;
}

export function buildPacificsScheduleUrl(now: number): string {
	return `https://www.pacificsbaseball.com/pacifics.asp?page=11&team=801&year=${getPacificsSeasonYear(now)}`;
}

export function inferSeasonSpanningYear(month: number, now: number): number {
	const current = new Date(now);
	const currentYear = current.getFullYear();
	const currentMonth = current.getMonth();
	if (month >= 8) {
		return currentMonth < 6 ? currentYear - 1 : currentYear;
	}
	return currentMonth >= 8 ? currentYear + 1 : currentYear;
}

export function inferLikelyCalendarYear(dateText: string, now: number): number {
	const currentYear = new Date(now).getFullYear();
	const probe = new Date(`${dateText}, ${currentYear} 12:00:00 PST`);
	if (!Number.isFinite(probe.getTime())) return currentYear;
	return probe.getTime() < now - ANNUAL_EVENT_STALENESS_DAYS * 24 * 60 * 60 * 1000
		? currentYear + 1
		: currentYear;
}

export function resolveAnnualMonthDay(
	dateText: string,
	now: number,
	timeSuffix: string
): Date | null {
	const year = inferLikelyCalendarYear(dateText, now);
	const resolved = new Date(`${dateText}, ${year} ${timeSuffix}`);
	return Number.isFinite(resolved.getTime()) ? resolved : null;
}

export function buildItem(params: BuildItemParams, now: number): NewsItem | null {
	const {
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
	} = params;

	const iso = toIsoDate(pubDate);
	const timestamp = new Date(iso).getTime();
	if (!Number.isFinite(timestamp)) return null;

	const deltaDays = (timestamp - now) / (1000 * 60 * 60 * 24);
	if (deltaDays < -MAX_PAST_DAYS || deltaDays > MAX_FUTURE_DAYS) return null;

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
		category: category as NewsItem['category'],
		verification: verification as NewsItem['verification'],
		town,
		townSlug,
		lat: hasCoords ? lat : undefined,
		lon: hasCoords ? lon : undefined,
		locationConfidence: hasCoords ? 'exact' : townSlug ? 'town' : undefined,
		locationEvidence: hasCoords ? source : town ? town : undefined,
		topics
	};
}

export function getTagText(element: Element, tagName: string): string {
	const nodes = element.getElementsByTagName(tagName);
	return nodes.length > 0 ? nodes[0].textContent || '' : '';
}

export function flattenJsonLdEvents(node: unknown): Record<string, unknown>[] {
	if (!node) return [];
	if (Array.isArray(node)) return node.flatMap((entry) => flattenJsonLdEvents(entry));
	if (typeof node !== 'object') return [];
	const obj = node as Record<string, unknown>;
	if (obj['@type'] === 'Event') return [obj];
	if (Array.isArray(obj['@graph'])) return flattenJsonLdEvents(obj['@graph']);
	if (Array.isArray(obj['itemListElement'])) return flattenJsonLdEvents(obj['itemListElement']);
	if (obj['item']) return flattenJsonLdEvents(obj['item']);
	return [];
}

export function buildEventTitle(
	eventName: string,
	dateInput: unknown,
	hasRegistration: boolean
): string {
	const parts = [eventName];
	if (dateInput) {
		const d = new Date(dateInput as string);
		if (Number.isFinite(d.getTime())) {
			parts.push(
				d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
			);
		}
	}
	if (hasRegistration) parts.push('Registration open');
	return parts.join(' — ');
}

export function inferTownFromText(text: string): { town?: string; townSlug?: string } {
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

export function getDipseaRaceDate(year: number): Date {
	// Dipsea is always the second Sunday in June
	const june1 = new Date(year, 5, 1); // June 1
	const dayOfWeek = june1.getDay(); // 0 = Sunday
	const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
	const secondSunday = 1 + daysToSunday + 7;
	return new Date(year, 5, secondSunday, 7, 30, 0); // 7:30 AM start
}

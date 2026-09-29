/**
 * Cross-source dedupe for the snapshot. Pure and deterministic.
 *
 * The rules themselves live in ./identity (shared with the dashboard).
 * Two items are the same story when:
 * - they are the same entry of the SAME source (namespaced id) with the same
 *   title — a GUID is only unique within its own feed, so ids never match
 *   across sources; or
 * - they link the same ARTICLE: same canonical URL, where the URL is not a
 *   landing/listing page (see isGenericUrl) and no single source uses it for
 *   two different titles; or
 * - both have a valid publishedAt within 24h and the same normalized title
 *   (≥12 chars, so generic titles like "Agenda" never merge).
 * The representative is the best-evidenced copy: a copy with a valid
 * publication time beats an undated one; then source priority; then newest;
 * then id. Other sources go to `alsoReportedBy`; categories are unioned.
 * A same-source id reused for a different story gets a "~2" suffix so ids
 * stay unique.
 */
import type { NewsCategory } from '$lib/types';
import {
	compareRepresentative,
	isGenericUrl,
	MIN_TITLE_KEY_CHARS,
	sameStoryByTitle,
	titleKey
} from './identity';
import { compareNewest } from './order';

export interface DedupeInput {
	/** Source-scoped (sourceScopedId). */
	id: string;
	sourceId: string;
	category: NewsCategory;
	canonicalUrl: string | null;
	title: string;
	publishedAt: string | null;
}

export type Deduped<T> = T & { categories: NewsCategory[]; alsoReportedBy: string[] };

/** URLs some single source uses for two different titles: shared landing pages. */
function reusedUrls(items: readonly DedupeInput[]): Set<string> {
	const titlesBySourceUrl = new Map<string, Set<string>>();
	const reused = new Set<string>();
	for (const item of items) {
		if (!item.canonicalUrl) continue;
		const key = `${item.sourceId}\u0000${item.canonicalUrl}`;
		const titles = titlesBySourceUrl.get(key) ?? new Set<string>();
		titles.add(titleKey(item.title));
		titlesBySourceUrl.set(key, titles);
		if (titles.size > 1) reused.add(item.canonicalUrl);
	}
	return reused;
}

export function dedupeItems<T extends DedupeInput>(
	items: readonly T[],
	priorityOf: (sourceId: string) => number
): Deduped<T>[] {
	const rank = compareRepresentative<T>(priorityOf);
	const reused = reusedUrls(items);
	const articleUrl = (item: T) =>
		item.canonicalUrl && !reused.has(item.canonicalUrl) && !isGenericUrl(item.canonicalUrl)
			? item.canonicalUrl
			: null;

	const survivors: Deduped<T>[] = [];
	const byId = new Map<string, number[]>();
	const byUrl = new Map<string, number>();
	const byTitle = new Map<string, number[]>();
	const usedIds = new Set<string>();

	for (const item of [...items].sort(rank)) {
		const tKey = titleKey(item.title);
		const url = articleUrl(item);
		const titleEligible = item.publishedAt !== null && tKey.length >= MIN_TITLE_KEY_CHARS;

		let match = (byId.get(item.id) ?? []).find((i) => titleKey(survivors[i].title) === tKey);
		if (match === undefined && url) match = byUrl.get(url);
		if (match === undefined && titleEligible) {
			match = (byTitle.get(tKey) ?? []).find((i) => sameStoryByTitle(survivors[i], item));
		}

		if (match !== undefined) {
			const survivor = survivors[match];
			if (!survivor.categories.includes(item.category)) survivor.categories.push(item.category);
			if (item.sourceId !== survivor.sourceId && !survivor.alsoReportedBy.includes(item.sourceId)) {
				survivor.alsoReportedBy.push(item.sourceId);
			}
			if (url && !byUrl.has(url)) byUrl.set(url, match);
			continue;
		}

		let id = item.id;
		for (let n = 2; usedIds.has(id); n++) id = `${item.id}~${n}`;
		usedIds.add(id);
		const index =
			survivors.push({ ...item, id, categories: [item.category], alsoReportedBy: [] }) - 1;
		byId.set(item.id, [...(byId.get(item.id) ?? []), index]);
		if (url) byUrl.set(url, index);
		if (titleEligible) byTitle.set(tKey, [...(byTitle.get(tKey) ?? []), index]);
	}

	return survivors.sort(
		(a, b) =>
			compareNewest(a, b) ||
			priorityOf(a.sourceId) - priorityOf(b.sourceId) ||
			a.id.localeCompare(b.id)
	);
}

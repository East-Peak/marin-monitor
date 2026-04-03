/**
 * Two-stage deduplication for collected activity items.
 * Stage 1: Link-based dedupe (normalized URL within category).
 * Stage 2: Title-based dedupe for recurring events (keeps next upcoming).
 */
import type { NewsItem } from '$lib/types';

export function dedupeItems(collected: NewsItem[], now: number): NewsItem[] {
	// Stage 1: Link-based dedupe
	const linkDeduped: NewsItem[] = [];
	const seenLinks = new Set<string>();
	for (const item of collected.filter(Boolean).sort((a, b) => b.timestamp - a.timestamp)) {
		const normalizedLink = item.link.replace(/-\d+(\/|$)/, '$1');
		const key = `${item.category}:${normalizedLink}`;
		if (seenLinks.has(key)) continue;
		seenLinks.add(key);
		linkDeduped.push(item);
	}

	// Stage 2: Title-based dedupe for recurring events
	const titleGroups = new Map<string, NewsItem[]>();
	for (const item of linkDeduped) {
		const normTitle = item.title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();
		const groupKey = `${item.category}:${item.source}:${normTitle}`;
		if (!titleGroups.has(groupKey)) titleGroups.set(groupKey, []);
		titleGroups.get(groupKey)!.push(item);
	}

	const deduped: NewsItem[] = [];
	for (const [, group] of titleGroups) {
		if (group.length === 1) {
			deduped.push(group[0]);
			continue;
		}
		group.sort((a, b) => a.timestamp - b.timestamp);
		const nextUpcoming = group.find((item) => item.timestamp >= now);
		deduped.push(nextUpcoming || group[group.length - 1]);
	}

	deduped.sort((a, b) => b.timestamp - a.timestamp);
	return deduped;
}

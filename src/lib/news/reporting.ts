/**
 * "Latest reporting" selection (dashboard spec §2.4, §4, §13.8). Pure: no DOM, no clock reads.
 *
 * Identity, dedupe and ordering are the shared news-pipeline rules ($lib/news/dedupe,
 * order); browser ids are already per-feed source-scoped. Allocation follows
 * COUNTY_WIDE_RULE (confirmed by Stuart). This module adds only
 * eligibility, scope and allocation.
 */
import type { NewsCategory, NewsItem, VerificationLevel } from '$lib/types';
import { COUNTY_WIDE_RULE, type CountyWideRule } from '$lib/config/county-scope';
import { dedupeItems, type DedupeInput } from './dedupe';
import { canonicalizeUrl } from './url'; // parser-free: keeps htmlparser2 out of the main bundle
import { hasKnownPublicationTime } from './order';
import { withinFutureSkew } from './recency';
import { newsSourceId } from './source-id';

/** Reporting categories. Events/listings, satire and 311 are not reporting. */
export const REPORTING_CATEGORIES: ReadonlySet<NewsCategory> = new Set<NewsCategory>([
	'local',
	'civic',
	'safety',
	'outdoors',
	'housing'
]);

/** The only total: every view shows at most townSlots + countySlots items. */
export function reportingSlots(rule: CountyWideRule = COUNTY_WIDE_RULE): number {
	return rule.townSlots + rule.countySlots;
}

export type ReportingScope = 'town' | 'county' | 'unlocated';

export interface ReportingEntry {
	item: NewsItem;
	publishedAt: number;
	scope: ReportingScope;
	/** Other sources carrying the same story (shared dedupe). */
	alsoReportedBy: string[];
}

export interface LatestReportingOptions {
	/** Selected town slug, or null for all of Marin. */
	town: string | null;
	now: number;
	/** Defaults to COUNTY_WIDE_RULE; tests pass variants. */
	rule?: CountyWideRule;
}

/**
 * Same-story tie-break by verification level (dashboard §13.8): the best-verified copy
 * represents the story. This deliberately differs from the producer's feed order and
 * from the browser collapse, which keeps copies in input order.
 */
const PRIORITY: Record<VerificationLevel, number> = {
	official: 0,
	local_media: 1,
	community: 2,
	satire: 3
};

/** Lower is better, as dedupeItems expects. */
export function reportingPriority(verification: VerificationLevel): number {
	return PRIORITY[verification] ?? 3;
}

export function classifyReportingScope(
	item: Pick<NewsItem, 'townSlug' | 'geoScope'>
): ReportingScope {
	if (item.townSlug) return 'town';
	if (item.geoScope === 'county') return 'county';
	return 'unlocated';
}

export function isEligibleReporting(item: NewsItem, now: number): boolean {
	return (
		REPORTING_CATEGORIES.has(item.category) &&
		item.verification !== 'satire' &&
		item.publishedAtStatus === 'valid' &&
		hasKnownPublicationTime(item) &&
		withinFutureSkew(item.timestamp, now)
	);
}

type Candidate = DedupeInput & { item: NewsItem };

function toCandidate(item: NewsItem): Candidate {
	return {
		id: item.id, // already source-scoped per feed by the RSS adapter; never re-wrapped
		sourceId: newsSourceId(item.source),
		category: item.category,
		canonicalUrl: canonicalizeUrl(item.link || null),
		title: item.title,
		publishedAt: new Date(item.timestamp).toISOString(),
		item
	};
}

function dedupeAndOrder(pool: readonly NewsItem[]): ReportingEntry[] {
	const priorityBySource = new Map<string, number>();
	for (const item of pool) {
		const id = newsSourceId(item.source);
		priorityBySource.set(
			id,
			Math.min(priorityBySource.get(id) ?? 3, reportingPriority(item.verification))
		);
	}
	return dedupeItems(pool.map(toCandidate), (sourceId) => priorityBySource.get(sourceId) ?? 3).map(
		(survivor) => ({
			item: survivor.item,
			publishedAt: survivor.item.timestamp,
			scope: classifyReportingScope(survivor.item),
			alsoReportedBy: survivor.alsoReportedBy
		})
	);
}

export function selectLatestReporting(
	items: readonly NewsItem[],
	options: LatestReportingOptions
): ReportingEntry[] {
	const { town, now, rule = COUNTY_WIDE_RULE } = options;
	const eligible = items.filter((item) => isEligibleReporting(item, now));

	// All of Marin: the newest dated eligible items from any source.
	if (town === null) return dedupeAndOrder(eligible).slice(0, reportingSlots(rule));

	// A town: that town's items plus county-scoped ones; unlocated never pads.
	const entries = dedupeAndOrder(
		eligible.filter((item) => item.townSlug === town || classifyReportingScope(item) === 'county')
	);
	const townEntries = entries.filter((e) => e.scope === 'town').slice(0, rule.townSlots);
	const unusedTownSlots = rule.townSlots - townEntries.length;
	const countyCap = rule.countySlots + (rule.countyBackfillsTown ? unusedTownSlots : 0);
	const countyEntries = entries.filter((e) => e.scope === 'county').slice(0, countyCap);
	const chosen = new Set([...townEntries, ...countyEntries]);
	// Keep the shared order (newest first, then priority, then id).
	return entries.filter((e) => chosen.has(e));
}

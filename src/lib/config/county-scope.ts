/**
 * County-wide rule for "Latest reporting" (dashboard spec §4, §13.8).
 *
 * Confirmed by Stuart, 2026-09-29.
 * Every choice lives in this one constant; changing a feed, the slot counts or
 * backfill is a one-line edit here — no code change.
 * - feedUrls: sources whose items are county-wide unless their title names a town.
 * - townSlots / countySlots: allocation when a town is selected; their sum is the
 *   total for every view (All of Marin included). There is no other limit.
 * - countyBackfillsTown: when the town has fewer than townSlots items, county
 *   items may also take the unused town slots (never beyond the total).
 *   Unlocated items never pad.
 */
export interface CountyWideRule {
	/** Stuart confirmed the rule on 2026-09-29. */
	status: 'confirmed';
	feedUrls: readonly string[];
	townSlots: number;
	countySlots: number;
	countyBackfillsTown: boolean;
}

export const COUNTY_WIDE_RULE: CountyWideRule = {
	status: 'confirmed',
	feedUrls: [
		'https://www.marinij.com/tag/marin-county/feed/',
		'https://www.nbcbayarea.com/tag/marin-county/feed/'
	],
	townSlots: 3,
	countySlots: 2,
	countyBackfillsTown: true
};

export function isCountyScopedFeed(
	feedUrl: string,
	rule: CountyWideRule = COUNTY_WIDE_RULE
): boolean {
	return rule.feedUrls.includes(feedUrl);
}

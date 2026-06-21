/**
 * Type declarations for scripts/lib/activity-feed-helpers.mjs.
 * Used by the TypeScript test file and svelte-check.
 */

export declare const MAX_PAST_DAYS: number;
export declare const MAX_FUTURE_DAYS: number;

export declare function stripHtml(raw?: string): string;
export declare function excerpt(raw?: string, maxLength?: number): string;
export declare function slugify(raw?: string): string;
export declare function isTimely(timestamp: number, now?: number): boolean;
export declare function toIsoDate(dateInput?: unknown): string;
export declare function buildEventTitle(
	eventName: string,
	dateInput: unknown,
	hasRegistration: boolean
): string;
export declare function flattenJsonLdEvents(node: unknown): unknown[];
export declare function normalizeJsonLd(raw: string): string;

export interface ActivityItem {
	id: string;
	title: string;
	link: string;
	pubDate: string;
	timestamp: number;
	description?: string;
	content?: string;
	source: string;
	category: string;
	verification: string;
	town?: string;
	townSlug?: string;
	lat?: number;
	lon?: number;
	locationConfidence?: string;
	locationEvidence?: string;
	topics: string[];
}

export interface BuildItemInput {
	category: string;
	source: string;
	title: string;
	link: string;
	pubDate?: unknown;
	description?: string;
	content?: string;
	verification?: string;
	town?: string;
	townSlug?: string;
	lat?: number;
	lon?: number;
	topics?: string[];
}

export declare function buildItem(input: BuildItemInput, now?: number): ActivityItem | null;
export declare function inferTownFromText(text: string): { town?: string; townSlug?: string };

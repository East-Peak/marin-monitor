/**
 * Shared types and interfaces for activity scraper sub-modules.
 */

export interface SourceConfig {
	source: string;
	url: string;
	town?: string;
	townSlug?: string;
	lat?: number;
	lon?: number;
	topics?: string[];
	title?: string;
}

export interface EventPageConfig {
	source: string;
	eventName: string;
	url: string;
	category: string;
	town?: string;
	townSlug?: string;
	lat?: number;
	lon?: number;
	topics?: string[];
	datePatterns?: RegExp[];
	regPatterns?: RegExp[];
	regLinkPattern?: RegExp;
	fallbackDate?: string;
	description?: string;
	verification?: string;
}

export interface BuildItemParams {
	category: string;
	source: string;
	title: string;
	link: string;
	pubDate?: string | Date | unknown;
	description?: string;
	content?: string;
	verification?: string;
	town?: string;
	townSlug?: string;
	lat?: number;
	lon?: number;
	topics?: string[];
}

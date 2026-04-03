/**
 * Ad configuration and selection logic.
 *
 * Edit this file to add/remove/schedule ads. No admin UI needed —
 * just push a config change and Vercel auto-deploys.
 */

import type { NewsCategory } from '$lib/types';

export interface AdConfig {
	id: string;
	type: 'listing' | 'event' | 'business' | 'community';
	placement: 'wire' | 'banner';
	headline: string;
	body: string; // plain text only
	sponsor: string;
	url: string;
	startDate?: string; // ISO date, inclusive
	endDate?: string; // ISO date, inclusive
	targetCategories?: NewsCategory[];
	image?: string; // optional hero image URL
	bullets?: string[]; // optional bullet points (replaces body)
	priority: number; // 1-10, higher = more likely to show
	position?: number; // where in the news list (default 3)
	label?: string; // badge text, defaults to "Featured"
}

/**
 * Active ad inventory. Edit this array to manage ads.
 */
export const ADS: AdConfig[] = [
	{
		id: 'marin-families',
		type: 'community',
		placement: 'wire',
		headline: 'Marin Families',
		body: 'Optimize where to enrich your children this summer. Find camps, daycare, preschools, and activities across 32 Marin towns without the group-chat panic or twenty open browser tabs.',
		image: '/images/marin-families.webp',
		sponsor: 'East Peak Advisors',
		url: 'https://marinfamilies.com',
		priority: 8,
		position: 3,
		targetCategories: ['outdoors'],
		label: 'From the Publisher'
	}
	// {
	// 	id: 'band-show-001',
	// 	type: 'event',
	// 	placement: 'banner',
	// 	headline: 'Live Music: The Tides at Sweetwater',
	// 	body: 'Friday 3/14 — Doors 8pm. Americana & surf rock from Mill Valley\'s own.',
	// 	sponsor: 'Sweetwater Music Hall',
	// 	url: 'https://example.com/sweetwater/the-tides',
	// 	priority: 7,
	// 	label: 'Featured Event'
	// }
];

/**
 * Get all active ads for a placement, optionally filtered by category.
 */
export function getActiveAds(
	placement: AdConfig['placement'],
	category?: NewsCategory
): AdConfig[] {
	const now = new Date().toISOString().slice(0, 10);

	return ADS.filter((ad) => {
		if (ad.placement !== placement) return false;
		if (ad.startDate && now < ad.startDate) return false;
		if (ad.endDate && now > ad.endDate) return false;
		if (category && ad.targetCategories && !ad.targetCategories.includes(category)) return false;
		return true;
	}).sort((a, b) => b.priority - a.priority);
}

/**
 * Pick ads from the active pool using weighted random selection.
 */
export function pickAds(
	placement: AdConfig['placement'],
	category?: NewsCategory,
	count: number = 1
): AdConfig[] {
	const pool = getActiveAds(placement, category);
	if (pool.length === 0) return [];
	if (pool.length <= count) return pool;

	const picked: AdConfig[] = [];
	const remaining = [...pool];

	for (let i = 0; i < count && remaining.length > 0; i++) {
		let roll = Math.random() * remaining.reduce((sum, ad) => sum + ad.priority, 0);
		for (let j = 0; j < remaining.length; j++) {
			roll -= remaining[j].priority;
			if (roll <= 0) {
				picked.push(remaining[j]);
				remaining.splice(j, 1);
				break;
			}
		}
	}

	return picked;
}

/** Promotions that agencies post in their alert lists. Dropped by name, exact after trim (never by "no routes/stops"). */
export const PROMO_HEADLINES: readonly string[] = ['Save Money with Clipper!'];

export const isPromoHeadline = (headline: string): boolean =>
	PROMO_HEADLINES.includes(headline.trim());

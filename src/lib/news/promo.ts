/** Promotions that agencies post in their alert lists. Dropped by name, exact after trim (never by "no routes/stops"). */
export const PROMO_HEADLINES: readonly string[] = ['Save Money with Clipper!'];

export const isPromoHeadline = (headline: string): boolean =>
	PROMO_HEADLINES.includes(headline.trim());

/** A 511 story title is the headline plus its routes ("Save Money with Clipper! (4, 92)"). */
export const isPromoTitle = (title: string): boolean =>
	isPromoHeadline(title.replace(/\s*\([^()]*\)\s*$/, ''));

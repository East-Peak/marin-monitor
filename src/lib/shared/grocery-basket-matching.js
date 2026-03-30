// @ts-check

/** @type {Record<string, string[]>} */
export const BRAND_KEY_TERMS = {
	'vital-farms-eggs': ['vital', 'farms'],
	'marin-kombucha': ['marin', 'kombucha'],
	'oatly-oatmilk': ['oatly'],
	'san-luis-sourdough': ['san', 'luis'],
	'marys-chicken': ['marys'],
	'earthbound-kale': ['earthbound'],
	'manuka-honey': ['manuka'],
	'justins-almond-butter': ['justins'],
	'open-nature-salmon': ['open', 'nature', 'salmon'],
	'silver-oak-cabernet': ['silver', 'oak'],
	'vital-proteins-collagen': ['vital', 'proteins']
};

/**
 * @param {string} value
 * @returns {string[]}
 */
function normalizeWords(value) {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, '')
		.split(/\s+/)
		.filter((word) => word.length > 0);
}

/**
 * @param {string} candidateName
 * @param {string} targetName
 * @param {string | null} [itemId]
 * @returns {number}
 */
export function scoreGroceryPriceMatch(candidateName, targetName, itemId = null) {
	const targetWords = normalizeWords(targetName);
	const candidateWords = new Set(normalizeWords(candidateName));

	if (targetWords.length === 0) return 0;

	const requiredTerms = itemId ? BRAND_KEY_TERMS[itemId] : undefined;
	if (requiredTerms) {
		for (const term of requiredTerms) {
			if (!candidateWords.has(term)) return 0;
		}
	}

	let matches = 0;
	for (const word of targetWords) {
		if (candidateWords.has(word)) matches++;
	}

	return Math.round((matches / targetWords.length) * 100) / 100;
}

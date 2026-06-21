/** @typedef {import('$lib/config/coffee').CoffeeDrinkConfig} CoffeeDrinkConfig */
/** @typedef {import('$lib/types/coffee').CoffeeDrinkId} CoffeeDrinkId */
/** @typedef {import('$lib/types/coffee').CoffeeDrinkPrice} CoffeeDrinkPrice */
/** @typedef {import('$lib/types/coffee').CoffeeDrinkSummary} CoffeeDrinkSummary */
/** @typedef {import('$lib/types/coffee').CoffeeDrinkSummaryMap} CoffeeDrinkSummaryMap */
/** @typedef {import('$lib/types/coffee').CoffeeIndexShop} CoffeeIndexShop */
/** @typedef {import('$lib/types/coffee').CoffeeIndexSnapshot} CoffeeIndexSnapshot */
/** @typedef {import('$lib/types/coffee').CoffeePriceSource} CoffeePriceSource */

/**
 * @param {string} value
 */
export function normalizeMenuText(value) {
	return value
		.toLowerCase()
		.replace(/&/g, ' and ')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.replace(/\s+/g, ' ');
}

/**
 * @param {number[]} values
 */
export function computeMedian(values) {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 0) {
		return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
	}
	return sorted[mid];
}

/**
 * @param {string} normalizedName
 * @param {CoffeeDrinkConfig} drink
 */
function isExcludedDrinkMatch(normalizedName, drink) {
	return (drink.excludeTerms ?? []).some((term) =>
		normalizedName.includes(normalizeMenuText(term))
	);
}

/**
 * @param {string} normalizedName
 * @param {string} normalizedAlias
 */
function scoreAliasMatch(normalizedName, normalizedAlias) {
	if (normalizedName === normalizedAlias) return 400;
	if (normalizedName.startsWith(`${normalizedAlias} `)) return 320;
	if (normalizedName.endsWith(` ${normalizedAlias}`)) return 300;
	if (normalizedName.includes(` ${normalizedAlias} `)) return 260;
	if (normalizedName.includes(normalizedAlias)) return 220;
	return -1;
}

/**
 * Avoid matching retail items like coffee cake or bean bags when a menu just says "Coffee".
 *
 * @param {string} normalizedName
 */
function scoreHouseCoffeeMatch(normalizedName) {
	if (/^\d+\s*oz coffee$/.test(normalizedName)) return 430;
	if (normalizedName === 'coffee') return 420;
	if (normalizedName === 'brewed coffee') return 410;
	if (normalizedName === 'house coffee') return 405;
	if (normalizedName === 'coffee of the day') return 400;
	if (normalizedName === 'batch brew') return 395;
	if (normalizedName === 'filter coffee') return 390;
	if (normalizedName === 'brew of the day') return 385;
	if (normalizedName === 'daily drip') return 380;
	return -1;
}

/**
 * @param {CoffeeDrinkConfig} drink
 * @param {string} normalizedName
 * @param {string[]} normalizedAliases
 */
function scoreDrinkMatch(drink, normalizedName, normalizedAliases) {
	if (drink.id === 'house_coffee') {
		return scoreHouseCoffeeMatch(normalizedName);
	}

	return Math.max(...normalizedAliases.map((alias) => scoreAliasMatch(normalizedName, alias)));
}

/**
 * @param {CoffeeDrinkConfig} drink
 * @param {number} price
 * @param {string} updateTime
 * @param {CoffeePriceSource} priceSource
 * @param {string | null} matchedName
 * @param {boolean} [isStale]
 * @returns {CoffeeDrinkPrice}
 */
function buildDrinkPrice(drink, price, updateTime, priceSource, matchedName, isStale = false) {
	return {
		drinkId: drink.id,
		label: drink.label,
		price,
		priceSource,
		updateTime,
		matchedName,
		isStale
	};
}

/**
 * @param {Array<{name?: string | null; prices?: number[] | null}>} items
 * @param {CoffeeDrinkConfig} drink
 * @param {string} updateTime
 * @returns {CoffeeDrinkPrice | null}
 */
function extractDrinkPriceFromItems(items, drink, updateTime) {
	let bestMatch = /** @type {{ score: number; price: number; matchedName: string } | null} */ (
		null
	);
	const normalizedAliases = drink.aliases.map((alias) => normalizeMenuText(alias));

	for (const item of items) {
		if (!item?.name || !Array.isArray(item.prices) || item.prices.length === 0) continue;
		const price = item.prices[0];
		if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) continue;

		const normalizedName = normalizeMenuText(item.name);
		if (!normalizedName || isExcludedDrinkMatch(normalizedName, drink)) continue;

		const score = scoreDrinkMatch(drink, normalizedName, normalizedAliases);
		if (score < 0) continue;

		if (!bestMatch || score > bestMatch.score) {
			bestMatch = {
				score,
				price,
				matchedName: item.name
			};
		}
	}

	if (!bestMatch) return null;
	return buildDrinkPrice(drink, bestMatch.price, updateTime, 'live', bestMatch.matchedName);
}

/**
 * @param {Array<{name?: string | null; prices?: number[] | null}>} items
 * @param {CoffeeDrinkConfig[]} drinks
 * @param {string} updateTime
 */
export function extractDrinkPricesFromItems(items, drinks, updateTime) {
	/** @type {Partial<Record<string, CoffeeDrinkPrice>>} */
	const prices = {};

	for (const drink of drinks) {
		const match = extractDrinkPriceFromItems(items, drink, updateTime);
		if (match) {
			prices[drink.id] = match;
		}
	}

	return prices;
}

/**
 * @param {Record<string, any> | null | undefined} state
 * @param {CoffeeDrinkConfig[]} drinks
 * @param {string} updateTime
 */
export function extractDrinkPricesFromState(state, drinks, updateTime) {
	/** @type {Partial<Record<string, CoffeeDrinkPrice>>} */
	const prices = {};
	if (!state) return prices;

	/** @type {Array<{name?: string | null; prices?: number[] | null}>} */
	const items = [];
	const menuKeys = Object.keys(state).filter((key) => key.startsWith('Menu:'));

	for (const menuKey of menuKeys) {
		const menu = state[menuKey];
		if (!menu?.groups) continue;
		for (const group of menu.groups) {
			if (Array.isArray(group?.items)) {
				items.push(...group.items);
			}
		}
	}

	return extractDrinkPricesFromItems(items, drinks, updateTime);
}

/**
 * @param {string} text
 * @param {CoffeeDrinkConfig[]} drinks
 * @param {string} updateTime
 */
export function extractDrinkPricesFromText(text, drinks, updateTime) {
	/** @type {Partial<Record<string, CoffeeDrinkPrice>>} */
	const prices = {};
	if (!text) return prices;

	/**
	 * @param {string} value
	 */
	const extractFirstPrice = (value) => value.match(/\$(\d+(?:\.\d{1,2})?)/);

	const lines = text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

	for (const drink of drinks) {
		const normalizedAliases = drink.aliases.map((alias) => normalizeMenuText(alias));
		let bestMatch = /** @type {{ score: number; price: number; matchedName: string } | null} */ (
			null
		);

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const normalizedLine = normalizeMenuText(line);
			if (!normalizedLine || isExcludedDrinkMatch(normalizedLine, drink)) continue;

			const score = scoreDrinkMatch(drink, normalizedLine, normalizedAliases);
			if (score < 0) continue;

			const sameLinePrice = extractFirstPrice(line);
			const nextLinePrice =
				!sameLinePrice && i + 1 < lines.length ? extractFirstPrice(lines[i + 1]) : null;

			const priceMatch = sameLinePrice ?? nextLinePrice;
			if (!priceMatch) continue;

			const candidate = {
				score,
				price: parseFloat(priceMatch[1]),
				matchedName: line
			};
			if (!bestMatch || candidate.score > bestMatch.score) {
				bestMatch = candidate;
			}
		}

		if (bestMatch) {
			prices[drink.id] = buildDrinkPrice(
				drink,
				bestMatch.price,
				updateTime,
				'live',
				bestMatch.matchedName
			);
		}
	}

	return prices;
}

/**
 * @param {CoffeeDrinkConfig} drink
 * @param {CoffeeDrinkPrice | null | undefined} livePrice
 * @param {CoffeeDrinkPrice | null | undefined} previousPrice
 * @param {number | null | undefined} hardcodedPrice
 * @param {string} updateTime
 * @returns {CoffeeDrinkPrice | null}
 */
export function mergeDrinkPriceWithFallback(
	drink,
	livePrice,
	previousPrice,
	hardcodedPrice,
	updateTime
) {
	if (livePrice?.price != null) {
		return livePrice;
	}

	if (previousPrice?.price != null) {
		return {
			...previousPrice,
			priceSource: 'fallback',
			isStale: true
		};
	}

	if (typeof hardcodedPrice === 'number' && Number.isFinite(hardcodedPrice)) {
		return buildDrinkPrice(drink, hardcodedPrice, updateTime, 'hardcoded', null, false);
	}

	return null;
}

/**
 * @param {CoffeeDrinkConfig[]} drinks
 * @param {Partial<Record<string, CoffeeDrinkPrice>> | undefined} livePrices
 * @param {Partial<Record<string, CoffeeDrinkPrice>> | undefined} previousPrices
 * @param {Partial<Record<string, number>> | undefined} hardcodedPrices
 * @param {string} updateTime
 */
export function mergeShopDrinkPrices(
	drinks,
	livePrices = {},
	previousPrices = {},
	hardcodedPrices = {},
	updateTime
) {
	/** @type {Partial<Record<string, CoffeeDrinkPrice>>} */
	const merged = {};

	for (const drink of drinks) {
		const price = mergeDrinkPriceWithFallback(
			drink,
			livePrices[drink.id],
			previousPrices[drink.id],
			hardcodedPrices[drink.id],
			updateTime
		);
		if (price) {
			merged[drink.id] = price;
		}
	}

	return merged;
}

/**
 * @param {CoffeeIndexShop[]} shops
 */
export function summarizeMenuCoverage(shops) {
	let pricedShopCount = 0;
	let liveMenuShopCount = 0;
	let fallbackMenuShopCount = 0;
	let hardcodedMenuShopCount = 0;

	for (const shop of shops) {
		const prices = Object.values(shop.prices);
		if (prices.length === 0) continue;

		pricedShopCount++;

		if (prices.some((price) => price.priceSource === 'live')) {
			liveMenuShopCount++;
			continue;
		}
		if (prices.some((price) => price.priceSource === 'fallback')) {
			fallbackMenuShopCount++;
			continue;
		}
		if (prices.some((price) => price.priceSource === 'hardcoded')) {
			hardcodedMenuShopCount++;
		}
	}

	return {
		pricedShopCount,
		liveMenuShopCount,
		fallbackMenuShopCount,
		hardcodedMenuShopCount
	};
}

/**
 * @param {CoffeeDrinkConfig} drink
 * @param {CoffeeIndexShop[]} shops
 * @returns {CoffeeDrinkSummary}
 */
function summarizeDrink(drink, shops) {
	const prices = /** @type {CoffeeDrinkPrice[]} */ (
		shops
			.map((shop) => shop.prices[drink.id])
			.filter((price) => price && typeof price.price === 'number')
	);

	const numericPrices = prices.map((price) => price.price);
	return {
		drinkId: drink.id,
		label: drink.label,
		pricedShopCount: prices.length,
		liveShopCount: prices.filter((price) => price.priceSource === 'live').length,
		fallbackShopCount: prices.filter((price) => price.priceSource === 'fallback').length,
		hardcodedShopCount: prices.filter((price) => price.priceSource === 'hardcoded').length,
		medianPrice: computeMedian(numericPrices),
		avgPrice:
			numericPrices.length > 0
				? Math.round(
						(numericPrices.reduce((sum, value) => sum + value, 0) / numericPrices.length) * 100
					) / 100
				: null,
		minPrice: numericPrices.length > 0 ? Math.min(...numericPrices) : null,
		maxPrice: numericPrices.length > 0 ? Math.max(...numericPrices) : null
	};
}

/**
 * @param {CoffeeDrinkConfig[]} drinks
 * @param {CoffeeIndexShop[]} shops
 * @returns {CoffeeDrinkSummaryMap}
 */
export function summarizeDrinks(drinks, shops) {
	/** @type {Partial<Record<CoffeeDrinkId, CoffeeDrinkSummary>>} */
	const summaries = {};
	for (const drink of drinks) {
		summaries[drink.id] = summarizeDrink(drink, shops);
	}
	return /** @type {CoffeeDrinkSummaryMap} */ (summaries);
}

/**
 * @param {number} liveMenuShopCount
 * @param {number} shopCount
 * @param {number} [minRatio]
 */
export function hasFreshCoffeeIndexCoverage(liveMenuShopCount, shopCount, minRatio = 0.5) {
	if (shopCount <= 0) return false;
	return liveMenuShopCount / shopCount >= minRatio;
}

/**
 * @param {{
 * 	indexName: string;
 * 	primaryDrink: CoffeeDrinkId;
 * 	drinks: CoffeeDrinkConfig[];
 * 	shops: CoffeeIndexShop[];
 * 	lastSuccessfulScrapeAt: string | null;
 * 	liveMenuEligibleShopCount?: number;
 * }} options
 * @returns {CoffeeIndexSnapshot}
 */
export function buildCoffeeIndexSnapshot(options) {
	const summaries = summarizeDrinks(options.drinks, options.shops);
	const coverage = summarizeMenuCoverage(options.shops);

	return {
		timestamp: new Date().toISOString(),
		lastSuccessfulScrapeAt: options.lastSuccessfulScrapeAt,
		indexName: options.indexName,
		primaryDrink: options.primaryDrink,
		shopCount: options.shops.length,
		pricedShopCount: coverage.pricedShopCount,
		liveMenuShopCount: coverage.liveMenuShopCount,
		liveMenuEligibleShopCount: options.liveMenuEligibleShopCount ?? options.shops.length,
		fallbackMenuShopCount: coverage.fallbackMenuShopCount,
		hardcodedMenuShopCount: coverage.hardcodedMenuShopCount,
		primaryDrinkSummary: summaries[options.primaryDrink],
		drinks: summaries,
		shops: options.shops
	};
}

/**
 * @param {CoffeeIndexSnapshot} snapshot
 */
export function toCoffeeIndexHistoryEntry(snapshot) {
	return {
		timestamp: snapshot.timestamp,
		lastSuccessfulScrapeAt: snapshot.lastSuccessfulScrapeAt ?? null,
		indexName: snapshot.indexName,
		primaryDrink: snapshot.primaryDrink,
		shopCount: snapshot.shopCount,
		pricedShopCount: snapshot.pricedShopCount,
		liveMenuShopCount: snapshot.liveMenuShopCount,
		liveMenuEligibleShopCount: snapshot.liveMenuEligibleShopCount,
		fallbackMenuShopCount: snapshot.fallbackMenuShopCount,
		hardcodedMenuShopCount: snapshot.hardcodedMenuShopCount,
		primaryDrinkSummary: snapshot.primaryDrinkSummary,
		drinks: snapshot.drinks
	};
}

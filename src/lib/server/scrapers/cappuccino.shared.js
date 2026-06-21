/** @typedef {import('$lib/types/coffee').CoffeeShop} CoffeeShop */
/** @typedef {import('$lib/types/coffee').CoffeeSnapshot} CoffeeSnapshot */

/**
 * @param {Record<string, any> | null | undefined} state
 * @param {string} [itemName]
 */
export function extractPriceFromState(state, itemName = 'cappuccino') {
	if (!state) return null;

	const menuKeys = Object.keys(state).filter((key) => key.startsWith('Menu:'));

	for (const menuKey of menuKeys) {
		const menu = state[menuKey];
		if (!menu?.groups) continue;

		for (const group of menu.groups) {
			if (!group?.items) continue;

			for (const item of group.items) {
				if (item?.name?.toLowerCase().includes(itemName.toLowerCase())) {
					if (Array.isArray(item.prices) && item.prices.length > 0) {
						return item.prices[0];
					}
				}
			}
		}
	}

	return null;
}

/** @param {string} text */
export function extractCappuccinoPrice(text) {
	if (!text) return null;

	const lines = text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		const sameLineMatch = line.match(/cappuccino\s*\$(\d+(?:\.\d{1,2})?)/i);
		if (sameLineMatch) {
			return parseFloat(sameLineMatch[1]);
		}

		if (/^cappuccino$/i.test(line) && i + 1 < lines.length) {
			const nextLine = lines[i + 1];
			const priceMatch = nextLine.match(/^\$(\d+(?:\.\d{1,2})?)$/);
			if (priceMatch) {
				return parseFloat(priceMatch[1]);
			}
		}
	}

	return null;
}

/** @param {number[]} values */
export function computeMedian(values) {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);

	if (sorted.length % 2 === 0) {
		return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
	}

	return sorted[mid];
}

/** @param {CoffeeShop[]} shops */
export function summarizeCoffeeShops(shops) {
	const metrics = {
		pricedShopCount: 0,
		liveShopCount: 0,
		fallbackShopCount: 0,
		hardcodedShopCount: 0,
		unavailableShopCount: 0
	};

	for (const shop of shops) {
		if (shop.price !== null) {
			metrics.pricedShopCount++;
		}

		switch (shop.priceSource) {
			case 'live':
				metrics.liveShopCount++;
				break;
			case 'fallback':
				metrics.fallbackShopCount++;
				break;
			case 'hardcoded':
				metrics.hardcodedShopCount++;
				break;
			default:
				if (shop.price === null) {
					metrics.unavailableShopCount++;
				}
				break;
		}
	}

	return metrics;
}

/**
 * @param {CoffeeShop} scrapedShop
 * @param {CoffeeShop | null | undefined} previousShop
 */
export function mergeCoffeeShopWithFallback(scrapedShop, previousShop) {
	if (scrapedShop.price !== null || scrapedShop.source !== 'toast') {
		return {
			...scrapedShop,
			priceSource: scrapedShop.priceSource ?? (scrapedShop.price !== null ? 'live' : 'unavailable'),
			isStale: scrapedShop.price === null ? true : (scrapedShop.isStale ?? false)
		};
	}

	if (!previousShop || previousShop.price === null) {
		return {
			...scrapedShop,
			priceSource: 'unavailable',
			isStale: true
		};
	}

	return {
		...scrapedShop,
		price: previousShop.price,
		altDrink: previousShop.altDrink ?? scrapedShop.altDrink,
		altPrice: previousShop.altPrice ?? scrapedShop.altPrice,
		priceSource: 'fallback',
		isStale: true,
		updateTime: previousShop.updateTime
	};
}

/**
 * @param {number} liveShopCount
 * @param {number} expectedLiveShopCount
 * @param {number} [minFreshLiveRatio]
 */
export function hasFreshCoffeeCoverage(
	liveShopCount,
	expectedLiveShopCount,
	minFreshLiveRatio = 0.5
) {
	if (expectedLiveShopCount <= 0) return true;
	return liveShopCount / expectedLiveShopCount >= minFreshLiveRatio;
}

/** @param {CoffeeSnapshot} snapshot */
export function toCoffeeHistoryEntry(snapshot) {
	return {
		timestamp: snapshot.timestamp,
		lastSuccessfulScrapeAt: snapshot.lastSuccessfulScrapeAt ?? null,
		shopCount: snapshot.shopCount,
		pricedShopCount: snapshot.pricedShopCount ?? null,
		liveShopCount: snapshot.liveShopCount ?? null,
		fallbackShopCount: snapshot.fallbackShopCount ?? null,
		hardcodedShopCount: snapshot.hardcodedShopCount ?? null,
		medianPrice: snapshot.medianPrice,
		avgPrice: snapshot.avgPrice,
		minPrice: snapshot.minPrice,
		maxPrice: snapshot.maxPrice,
		shops: []
	};
}

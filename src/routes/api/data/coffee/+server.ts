import {
	CAPPUCCINO_BLOB_KEY,
	COFFEE_INDEX_BLOB_KEY,
	COFFEE_INDEX_DRINKS,
	COFFEE_INDEX_NAME,
	COFFEE_PRIMARY_DRINK
} from '$lib/config/coffee';
import { blobErrorResponse, tryReadBlobText } from '$lib/server/blob-endpoint';
import { summarizeDrinks, summarizeMenuCoverage } from '$lib/server/scrapers/coffee-index.shared.js';
import type {
	CoffeeData,
	CoffeeDrinkPrice,
	CoffeeIndexData,
	CoffeeIndexHistoryEntry,
	CoffeeIndexShop,
	CoffeeIndexSnapshot,
	CoffeeSnapshot
} from '$lib/types/coffee';
import type { RequestHandler } from './$types';

function toLegacyDrinkPrice(
	snapshot: CoffeeSnapshot,
	shop: CoffeeSnapshot['shops'][number],
	price: number
): CoffeeDrinkPrice {
	return {
		drinkId: 'cappuccino',
		label: 'Cappuccino',
		price,
		priceSource: shop.priceSource ?? 'fallback',
		updateTime: shop.updateTime ?? snapshot.lastSuccessfulScrapeAt ?? snapshot.timestamp,
		isStale: shop.isStale ?? shop.priceSource === 'fallback',
		matchedName: null
	};
}

function normalizeLegacyShop(snapshot: CoffeeSnapshot, shop: CoffeeSnapshot['shops'][number]): CoffeeIndexShop {
	return {
		id: shop.id,
		name: shop.name,
		address: shop.address,
		town: shop.town,
		lat: shop.lat,
		lon: shop.lon,
		source: shop.source,
		prices:
			typeof shop.price === 'number'
				? { cappuccino: toLegacyDrinkPrice(snapshot, shop, shop.price) }
				: {}
	};
}

function buildIndexSnapshotFromLegacy(snapshot: CoffeeSnapshot): CoffeeIndexSnapshot {
	const shops = snapshot.shops.map((shop) => normalizeLegacyShop(snapshot, shop));
	const coverage = summarizeMenuCoverage(shops);
	const drinks = summarizeDrinks(COFFEE_INDEX_DRINKS, shops);

	return {
		timestamp: snapshot.timestamp,
		lastSuccessfulScrapeAt: snapshot.lastSuccessfulScrapeAt ?? null,
		indexName: COFFEE_INDEX_NAME,
		primaryDrink: COFFEE_PRIMARY_DRINK,
		shopCount: snapshot.shopCount,
		pricedShopCount: coverage.pricedShopCount,
		liveMenuShopCount: coverage.liveMenuShopCount,
		liveMenuEligibleShopCount: snapshot.shopCount,
		fallbackMenuShopCount: coverage.fallbackMenuShopCount,
		hardcodedMenuShopCount: coverage.hardcodedMenuShopCount,
		primaryDrinkSummary: drinks[COFFEE_PRIMARY_DRINK],
		drinks,
		shops
	};
}

function buildHistoryEntryFromLegacy(snapshot: CoffeeSnapshot): CoffeeIndexHistoryEntry {
	const { shops: _shops, ...historyEntry } = buildIndexSnapshotFromLegacy(snapshot);
	return historyEntry;
}

function buildCoffeeIndexDataFromLegacy(data: CoffeeData): CoffeeIndexData {
	return {
		current: data.current ? buildIndexSnapshotFromLegacy(data.current) : null,
		history: (data.history ?? []).map((entry) => buildHistoryEntryFromLegacy(entry))
	};
}

export const GET: RequestHandler = async () => {
	const newFormat = await tryReadBlobText(COFFEE_INDEX_BLOB_KEY);
	if (newFormat.ok) {
		return new Response(newFormat.text, {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200'
			}
		});
	}

	const legacy = await tryReadBlobText(CAPPUCCINO_BLOB_KEY);
	if (legacy.ok) {
		const legacyData = JSON.parse(legacy.text) as CoffeeData;
		return new Response(JSON.stringify(buildCoffeeIndexDataFromLegacy(legacyData)), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
			}
		});
	}

	return blobErrorResponse(newFormat.error);
};

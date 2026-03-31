import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import {
	CAPPUCCINO_BLOB_KEY,
	COFFEE_INDEX_BLOB_KEY,
	COFFEE_INDEX_DRINKS,
	COFFEE_INDEX_NAME,
	COFFEE_PRIMARY_DRINK
} from '$lib/config/coffee';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
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

async function readBlobJson<T>(blobKey: string): Promise<T | null> {
	try {
		const blob = await head(blobKey, {
			token: env.BLOB_READ_WRITE_TOKEN
		});
		const response = await fetchWithTimeout(
			blob.downloadUrl,
			{
				headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` }
			},
			8000
		);
		if (response.ok) {
			return (await response.json()) as T;
		}
	} catch {
		// Blob not available.
	}

	return null;
}

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
	const data = await readBlobJson<CoffeeIndexData>(COFFEE_INDEX_BLOB_KEY);
	if (data) {
		return new Response(JSON.stringify(data), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200'
			}
		});
	}

	const legacyData = await readBlobJson<CoffeeData>(CAPPUCCINO_BLOB_KEY);
	if (legacyData) {
		return new Response(JSON.stringify(buildCoffeeIndexDataFromLegacy(legacyData)), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
			}
		});
	}

	return new Response(JSON.stringify({ current: null, history: [] }), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'public, s-maxage=60'
		}
	});
};

import { put, head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import {
	buildCompositeSnapshot,
	type CompositeInputs,
	type CampPriceData,
	type IkonPassData,
	type DogWalkerData,
	type RivianLeaseData
} from '$lib/server/scrapers/composite';
import { COMPOSITE_BLOB_KEY, MAX_COMPOSITE_HISTORY } from '$lib/config/composite';
import { CAPPUCCINO_BLOB_KEY, COFFEE_INDEX_BLOB_KEY } from '$lib/config/coffee';
import { WINE_INDEX_BLOB_KEY } from '$lib/config/wine';
import { FITNESS_BLOB_KEY } from '$lib/config/fitness';
import { SCHOOL_TUITION_BLOB_KEY } from '$lib/config/schools';
import type { RequestHandler } from './$types';
import type { CompositeData, CompositeSnapshot } from '$lib/types/composite';
import type { CoffeeData, CoffeeIndexData } from '$lib/types/coffee';
import type { GroceryBasketData } from '$lib/types/grocery';
import type { WineIndexData } from '$lib/types/wine';
import type { FitnessData } from '$lib/types/fitness';
import type { SchoolIndexData } from '$lib/types/school';
import type { GasPriceData } from '$lib/types/gas';
import type { HousingMetric } from '$lib/api/marin/housing';

export const config = { maxDuration: 60 };

const GROCERY_BLOB_KEY = 'marin-grocery-basket.json';
const GAS_BLOB_KEY = 'marin-gas-prices.json';
const HOUSING_BLOB_KEY = 'marin-housing.json';
const CAMP_PRICES_BLOB_KEY = 'marin-camp-prices.json';
const IKON_PASS_BLOB_KEY = 'marin-ikon-pass.json';
const DOG_WALKER_BLOB_KEY = 'marin-dog-walker.json';
const RIVIAN_LEASE_BLOB_KEY = 'marin-rivian-lease.json';

/** Read a blob by key, returning null if it doesn't exist */
async function readBlob<T>(blobKey: string): Promise<T | null> {
	try {
		const blob = await head(blobKey, { token: env.BLOB_READ_WRITE_TOKEN });
		const res = await fetchWithTimeout(
			blob.downloadUrl,
			{ headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` } },
			8000
		);
		if (res.ok) {
			return (await res.json()) as T;
		}
	} catch {
		// Blob doesn't exist yet
	}
	return null;
}

/** Strip marinNumber.items from a snapshot to keep history entries small */
function toHistoryEntry(snapshot: CompositeSnapshot): CompositeSnapshot {
	return {
		timestamp: snapshot.timestamp,
		tiers: snapshot.tiers,
		compositeScore: snapshot.compositeScore,
		marinNumber: {
			total: snapshot.marinNumber.total,
			items: [], // strip items from history
			annualized: snapshot.marinNumber.annualized
		}
	};
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();
	try {
		// Read all index blobs in parallel
		const [
			grocery,
			coffee,
			legacyCappuccino,
			wine,
			fitness,
			school,
			housing,
			gas,
			campPrices,
			ikonPass,
			dogWalker,
			rivianLease
		] = await Promise.all([
			readBlob<GroceryBasketData>(GROCERY_BLOB_KEY),
			readBlob<CoffeeIndexData>(COFFEE_INDEX_BLOB_KEY),
			readBlob<CoffeeData>(CAPPUCCINO_BLOB_KEY),
			readBlob<WineIndexData>(WINE_INDEX_BLOB_KEY),
			readBlob<FitnessData>(FITNESS_BLOB_KEY),
			readBlob<SchoolIndexData>(SCHOOL_TUITION_BLOB_KEY),
			readBlob<HousingMetric[]>(HOUSING_BLOB_KEY),
			readBlob<GasPriceData>(GAS_BLOB_KEY),
			readBlob<CampPriceData>(CAMP_PRICES_BLOB_KEY),
			readBlob<IkonPassData>(IKON_PASS_BLOB_KEY),
			readBlob<DogWalkerData>(DOG_WALKER_BLOB_KEY),
			readBlob<RivianLeaseData>(RIVIAN_LEASE_BLOB_KEY)
		]);

		const inputs: CompositeInputs = {
			grocery,
			cappuccino: coffee ?? legacyCappuccino,
			wine,
			fitness,
			school,
			housing,
			gas,
			campPrices,
			ikonPass,
			dogWalker,
			rivianLease
		};

		const snapshot = buildCompositeSnapshot(inputs);

		// Read existing composite blob to append history
		let existing: CompositeData = { current: null, history: [] };
		try {
			const blob = await head(COMPOSITE_BLOB_KEY, { token: env.BLOB_READ_WRITE_TOKEN });
			const res = await fetchWithTimeout(
				blob.downloadUrl,
				{ headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` } },
				8000
			);
			if (res.ok) {
				existing = (await res.json()) as CompositeData;
			}
		} catch {
			// No existing blob -- start fresh
		}

		// Append to history (capped), stripping items from history entries
		const history = [toHistoryEntry(snapshot), ...existing.history].slice(0, MAX_COMPOSITE_HISTORY);

		const data: CompositeData = {
			current: snapshot,
			history
		};

		await put(COMPOSITE_BLOB_KEY, JSON.stringify(data), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		const liveCount = snapshot.marinNumber.items.filter((i) => i.source === 'live').length;
		console.log(
			`[sync-composite] OK: composite=${snapshot.compositeScore}, marinNumber=$${snapshot.marinNumber.total.toLocaleString()}, ${liveCount} live indices, in ${Date.now() - start}ms`
		);

		return new Response(
			JSON.stringify({
				ok: true,
				compositeScore: snapshot.compositeScore,
				marinNumber: snapshot.marinNumber.total,
				liveIndices: liveCount,
				totalIndices: snapshot.marinNumber.items.length
			}),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[sync-composite] FAILED after ${Date.now() - start}ms:`, message);
		return new Response(JSON.stringify({ ok: false, error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

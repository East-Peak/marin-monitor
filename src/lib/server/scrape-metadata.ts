export interface ScrapeMetadataValue {
	lastSuccessfulScrapeAt?: string | null;
	lastLiveScrapeAt?: string | null;
	lastUpdated?: string | null;
}

interface TimestampedValue {
	timestamp: string;
}

export function readSuccessfulScrapeAt(
	value: ScrapeMetadataValue | null | undefined
): string | null {
	return value?.lastSuccessfulScrapeAt ?? value?.lastLiveScrapeAt ?? value?.lastUpdated ?? null;
}

export function withSuccessfulScrapeMetadata<T extends TimestampedValue>(
	snapshot: T,
	lastSuccessfulScrapeAt: string | null = snapshot.timestamp
): T & { lastSuccessfulScrapeAt: string | null } {
	return {
		...snapshot,
		lastSuccessfulScrapeAt
	};
}

export function withPreservedSuccessfulScrapeMetadata<T extends TimestampedValue>(
	snapshot: T,
	options: {
		wasLive: boolean;
		previous?: ScrapeMetadataValue | null;
		includeLegacyLastLive?: boolean;
	}
): T & { lastSuccessfulScrapeAt: string | null; lastLiveScrapeAt?: string | null } {
	const lastSuccessfulScrapeAt = options.wasLive
		? snapshot.timestamp
		: readSuccessfulScrapeAt(options.previous);

	if (options.includeLegacyLastLive) {
		return {
			...snapshot,
			lastSuccessfulScrapeAt,
			lastLiveScrapeAt: lastSuccessfulScrapeAt
		};
	}

	return {
		...snapshot,
		lastSuccessfulScrapeAt
	};
}

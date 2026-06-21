export function readSuccessfulScrapeAt(value) {
	return value?.lastSuccessfulScrapeAt ?? value?.lastLiveScrapeAt ?? value?.lastUpdated ?? null;
}

export function withSuccessfulScrapeMetadata(
	snapshot,
	lastSuccessfulScrapeAt = snapshot.timestamp
) {
	return {
		...snapshot,
		lastSuccessfulScrapeAt
	};
}

export function withPreservedSuccessfulScrapeMetadata(
	snapshot,
	{ wasLive, previous, includeLegacyLastLive = false }
) {
	const lastSuccessfulScrapeAt = wasLive ? snapshot.timestamp : readSuccessfulScrapeAt(previous);

	if (includeLegacyLastLive) {
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

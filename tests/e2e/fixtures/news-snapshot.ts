/**
 * A strictly valid GET /api/news/snapshot body (schema v1, see
 * src/lib/news/snapshot.ts) built against the real clock, so the TV's ages
 * read as expected. Times are whole seconds so the RFC 822 raw value
 * re-derives exactly the recorded instant (the strict reader checks this).
 */
export interface FixtureStory {
	title: string;
	/** null = no publication date (shown "undated"). */
	hoursAgo: number | null;
	slug: string;
}

export function snapshotEnvelope(stories: FixtureStory[], revision = 1): string {
	const nowMs = Math.floor(Date.now() / 1000) * 1000;
	const generatedAt = new Date(nowMs).toISOString();
	const items = stories.map(({ title, hoursAgo, slug }) => {
		const at =
			hoursAgo === null ? null : new Date(Math.floor((nowMs - hoursAgo * 3_600_000) / 1000) * 1000);
		return {
			id: `point-reyes-light:${slug}`,
			sourceId: 'point-reyes-light',
			source: 'Point Reyes Light',
			category: 'local',
			verification: 'local_media',
			title,
			link: `https://www.ptreyeslight.com/${slug}`,
			canonicalUrl: `https://ptreyeslight.com/${slug}`,
			summary: null,
			publishedAt: at ? at.toISOString() : null,
			publishedAtRaw: at ? at.toUTCString() : null,
			publishedAtSource: at ? 'rss:pubDate' : null,
			publishedAtStatus: at ? 'valid' : 'missing',
			publishedAtAssumedZone: null,
			eventAt: null,
			eventAtSource: null,
			updatedAt: null,
			fetchedAt: generatedAt,
			town: null,
			point: null,
			topics: [],
			categories: ['local'],
			alsoReportedBy: []
		};
	});
	return JSON.stringify({
		status: 'ok',
		snapshot: {
			schemaVersion: 1,
			revision,
			generatedAt,
			lastSuccessfulScrapeAt: generatedAt,
			sources: [
				{
					id: 'point-reyes-light',
					name: 'Point Reyes Light',
					category: 'local',
					verification: 'local_media',
					status: 'ok',
					lastAttemptAt: generatedAt,
					lastSuccessAt: generatedAt,
					lastError: null,
					consecutiveFailures: 0,
					itemCount: items.length
				}
			],
			items
		}
	});
}

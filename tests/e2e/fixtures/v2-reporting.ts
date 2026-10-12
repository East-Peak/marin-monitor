/**
 * Snapshot bodies for the v2 map + Latest reporting e2e (D1 PR 9). Strictly valid against
 * parseNewsSnapshotView (the browser re-validates every body): each source a story names
 * carries items; whole-second times; publishedAtRaw re-derives publishedAt; a retained
 * source's stories were fetched at its last success, so they must be at least
 * `retainedHoursAgo` old.
 */
export interface FixtureSource {
	id: string;
	name: string;
	category?: string;
	retainedHoursAgo?: number;
}
export interface ReportingStory {
	slug: string;
	title: string;
	source: FixtureSource;
	hoursAgo: number | null;
	category?: string;
	town?: { name: string; slug: string };
	point?: { lat: number; lon: number };
	alsoReportedBy?: FixtureSource[];
	/** Defaults to https://news.example/<slug>. */
	link?: string;
}

export const SOURCES = {
	ptReyes: { id: 'point-reyes-light', name: 'Point Reyes Light' },
	// County-scoped through COUNTY_WIDE_RULE (their producer ids).
	ij: { id: 'marin-independent-journal', name: 'Marin Independent Journal' },
	nbc: { id: 'nbc-bay-area-marin', name: 'NBC Bay Area – Marin' },
	sanRafael: { id: 'city-of-san-rafael', name: 'City of San Rafael', category: 'civic' },
	lately: { id: 'marin-lately', name: 'Marin Lately', category: 'satire' },
	pacificSun: { id: 'pacific-sun', name: 'Pacific Sun', retainedHoursAgo: 3 }
} satisfies Record<string, FixtureSource>;

export const MILL_VALLEY = { name: 'Mill Valley', slug: 'mill-valley' };
export const SAN_RAFAEL = { name: 'San Rafael', slug: 'san-rafael' };
/** City boilerplate the keyword classifier flags (it contains "fire"): the G1 bug v2 must not surface. */
export const PARKING_BOILERPLATE =
	'To report a parking violation (red zone, fire lane, blocked driveway), call the police non-emergency line';

const HOUR = 3_600_000;
const verificationOf = (category: string) =>
	category === 'satire' ? 'satire' : category === 'civic' ? 'official' : 'local_media';

export function reportingSnapshot(nowMs: number, stories: ReportingStory[]): string {
	const now = Math.floor(nowMs / 1000) * 1000;
	const generatedAt = new Date(now).toISOString();
	const lastSuccess = (s: FixtureSource) =>
		s.retainedHoursAgo === undefined
			? generatedAt
			: new Date(now - s.retainedHoursAgo * HOUR).toISOString();
	const cited = new Map<string, { source: FixtureSource; count: number }>();
	const cite = (s: FixtureSource) =>
		cited.set(s.id, { source: s, count: (cited.get(s.id)?.count ?? 0) + 1 });

	const items = stories.map((st) => {
		[st.source, ...(st.alsoReportedBy ?? [])].forEach(cite);
		const category = st.category ?? st.source.category ?? 'local';
		const at =
			st.hoursAgo === null ? null : new Date(Math.floor((now - st.hoursAgo * HOUR) / 1000) * 1000);
		return {
			id: `${st.source.id}:${st.slug}`,
			sourceId: st.source.id,
			source: st.source.name,
			category,
			verification: verificationOf(category),
			title: st.title,
			link: st.link ?? `https://news.example/${st.slug}`,
			canonicalUrl: (st.link ?? `https://news.example/${st.slug}`)
				.replace(/^https?:\/\/(www\.)?/, 'https://')
				.replace(/\/$/, ''),
			summary: null,
			publishedAt: at ? at.toISOString() : null,
			publishedAtRaw: at ? at.toUTCString() : null,
			publishedAtSource: at ? 'rss:pubDate' : null,
			publishedAtStatus: at ? 'valid' : 'missing',
			publishedAtAssumedZone: null,
			eventAt: null,
			eventAtSource: null,
			updatedAt: null,
			fetchedAt: lastSuccess(st.source),
			town: st.town ? { ...st.town, source: 'title-match' } : null,
			point: st.point ? { ...st.point, source: 'feed' } : null,
			topics: [],
			categories: [category],
			alsoReportedBy: (st.alsoReportedBy ?? []).map((s) => s.id)
		};
	});
	const sources = [...cited.values()].map(({ source, count }) => {
		const retained = source.retainedHoursAgo !== undefined;
		const category = source.category ?? 'local';
		return {
			id: source.id,
			name: source.name,
			category,
			verification: verificationOf(category),
			status: retained ? 'retained' : 'ok',
			lastAttemptAt: generatedAt,
			lastSuccessAt: lastSuccess(source),
			lastError: retained ? 'http-status: HTTP 403' : null,
			consecutiveFailures: retained ? 12 : 0,
			itemCount: count
		};
	});
	return JSON.stringify({
		status: 'ok',
		snapshot: {
			schemaVersion: 1,
			revision: 1,
			generatedAt,
			lastSuccessfulScrapeAt: generatedAt,
			sources,
			items
		}
	});
}

// tests/e2e/fixtures/phone-news.mjs
/**
 * Writes the phone preview's news snapshot (MOBILE1): producer format, dated against the
 * real clock so nothing reads stale, and shaped like production's (19 sources, ~200 stories,
 * about one in six tagged with a town), so the phone is measured on a realistic page.
 *
 *   node tests/e2e/fixtures/phone-news.mjs <out.json>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// Production's source list on 2026-10-24: id, name, category, verification, item count.
const SOURCES = [
	['marin-independent-journal', 'Marin Independent Journal', 'local', 'local_media', 8],
	['point-reyes-light', 'Point Reyes Light', 'local', 'local_media', 10],
	['pacific-sun', 'Pacific Sun', 'local', 'local_media', 10],
	['marin-magazine', 'Marin Magazine', 'local', 'local_media', 10],
	['nbc-bay-area-marin', 'NBC Bay Area – Marin', 'local', 'local_media', 30],
	['kqed-news', 'KQED News', 'local', 'local_media', 5],
	['town-of-fairfax', 'Town of Fairfax', 'civic', 'official', 10],
	['city-of-belvedere', 'City of Belvedere', 'civic', 'official', 10],
	['marin-ij-politics', 'Marin IJ – Politics', 'civic', 'local_media', 4],
	['marin-county-bos-agendas', 'Marin County BOS – Agendas', 'civic', 'official', 30],
	['marin-county-bos-minutes', 'Marin County BOS – Minutes', 'civic', 'official', 30],
	['marin-ij-crime', 'Marin IJ – Crime', 'safety', 'local_media', 7],
	['marin-ij-fire', 'Marin IJ – Fire', 'safety', 'local_media', 10],
	['marin-ij-environment', 'Marin IJ – Environment', 'outdoors', 'local_media', 6],
	['wildcare', 'WildCare', 'outdoors', 'community', 10],
	['marin-ij-housing', 'Marin IJ – Housing', 'housing', 'local_media', 7],
	['marin-lately', 'Marin Lately', 'satire', 'satire', 10]
];
const TOWNS = [
	['San Rafael', 'san-rafael'],
	['Novato', 'novato'],
	['Mill Valley', 'mill-valley'],
	['Sausalito', 'sausalito'],
	['Larkspur', 'larkspur'],
	['Fairfax', 'fairfax'],
	['Tiburon', 'tiburon'],
	['Point Reyes', 'point-reyes']
];
const SUBJECTS = ['council weighs', 'residents discuss', 'crews finish', 'district reviews'];
const THINGS = ['road repairs', 'housing plan', 'park hours', 'budget update', 'trail work'];

const out = process.argv[2];
if (!out) throw new Error('usage: phone-news.mjs <out.json>');
// Whole seconds, so the RFC 822 raw value re-derives the recorded instant exactly.
const now = Math.floor(Date.now() / 1000) * 1000;
const iso = (ms) => new Date(ms).toISOString();
const generatedAt = iso(now);

let n = 0;
const sources = [];
const items = [];
for (const [id, name, category, verification, count] of SOURCES) {
	const own = [];
	sources.push({
		id,
		name,
		category,
		verification,
		lastAttemptAt: generatedAt,
		status: 'ok',
		lastSuccessAt: generatedAt,
		lastError: null,
		consecutiveFailures: 0,
		itemCount: count,
		items: own
	});
	for (let i = 0; i < count; i++, n++) {
		const at = now - (n * 37 + 20) * 60_000; // every ~37 min, the oldest ~5 days back
		const town = n % 6 === 0 ? TOWNS[(n / 6) % TOWNS.length] : null;
		const title = `${town ? town[0] : 'Marin'} ${SUBJECTS[n % SUBJECTS.length]} ${THINGS[n % THINGS.length]} (${n + 1})`;
		const slug = `story-${n + 1}`;
		const item = {
			id: `${id}:${slug}`,
			sourceId: id,
			source: name,
			category,
			verification,
			title,
			link: `https://example.com/${id}/${slug}/`,
			canonicalUrl: `https://example.com/${id}/${slug}`,
			summary: `${title}.`,
			publishedAtRaw: new Date(at).toUTCString(),
			publishedAtSource: 'rss:pubDate',
			publishedAtAssumedZone: null,
			publishedAt: iso(at),
			publishedAtStatus: 'valid',
			eventAt: null,
			eventAtSource: null,
			updatedAt: null,
			town: town ? { name: town[0], slug: town[1], source: 'title-match' } : null,
			point: null,
			topics: [],
			fetchedAt: generatedAt
		};
		// A source keeps its own copy; the public list adds the dedupe fields.
		own.push(item);
		items.push({ ...item, categories: [category], alsoReportedBy: [] });
	}
}
items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
	out,
	JSON.stringify({
		schemaVersion: 1,
		revision: 1,
		generatedAt,
		lastSuccessfulScrapeAt: generatedAt,
		sources,
		items
	})
);

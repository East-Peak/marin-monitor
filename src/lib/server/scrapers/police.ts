/**
 * Server-side police logs scraper.
 * Ported from scripts/extract-police-logs.mjs — removes Playwright and fs writes.
 * Mill Valley now uses plain fetch() POST instead of Playwright page.evaluate().
 */
import type { NewsItem } from '$lib/types';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import {
	stripHtml,
	excerpt,
	slugify,
	normalizeWhitespace,
	decodeEntities,
	parseHtml
} from './shared';

const FAIRFAX_DOCS_URL =
	'https://townoffairfaxca.gov/wp-json/wp/v2/documents?search=Press%20log&per_page=8&_fields=id,date,title,link,meta';
const MILL_VALLEY_DOC_ENDPOINT =
	'https://www.cityofmillvalley.gov/Admin/DocumentCenter/Home/Document_AjaxBinding?renderMode=0&loadSource=7';
const ROSS_STATS_URL = 'https://www.townofrossca.gov/police/page/monthly-statistics';
const TIBURON_POLICE_FEED_URL = 'https://www.townoftiburon.org/m/newsflash?cat=8&sortBy=Category';
const TIBURON_BASE_URL = 'https://www.townoftiburon.org';
const BELVEDERE_POSTS_URL =
	'https://www.cityofbelvedere.org/wp-json/wp/v2/posts?per_page=40&_fields=id,date,link,title,excerpt,content';
const NIXLE_MAX_PAGES = 4;

const NIXLE_AGENCIES = [
	{
		source: 'Central Marin PD',
		listingUrl: 'https://local.nixle.com/central-marin-police',
		townHints: [
			{ name: 'Larkspur', slug: 'larkspur', patterns: ['larkspur', 'redwood high school'] },
			{ name: 'Corte Madera', slug: 'corte-madera', patterns: ['corte madera'] },
			{ name: 'San Anselmo', slug: 'san-anselmo', patterns: ['san anselmo'] }
		]
	},
	{
		source: 'Novato PD',
		listingUrl: 'https://local.nixle.com/novato-police-ca',
		town: 'Novato',
		townSlug: 'novato'
	},
	{
		source: 'San Rafael PD',
		listingUrl: 'https://local.nixle.com/san-rafael-police-department',
		town: 'San Rafael',
		townSlug: 'san-rafael'
	},
	{
		source: 'Sausalito PD',
		listingUrl: 'https://local.nixle.com/sausalito-police-department',
		town: 'Sausalito',
		townSlug: 'sausalito'
	}
];

const RECENT_DAYS = 75;
const MONTH_NAMES =
	'January|February|March|April|May|June|July|August|September|October|November|December';
const TIBURON_TITLE_HINTS =
	/(police|arrest|burglary|robbery|theft|dui|checkpoint|scam|traffic|safety|siren|preparedness)/i;
const TIBURON_BODY_HINTS =
	/(tiburon police|police department|calls for service|traffic citations|burglary|theft|robbery|dui|checkpoint|preparedness|public safety|traffic advisory|scam)/i;
const BELVEDERE_TITLE_HINTS = /(officer|police|emergency|alert|public safety|wellbeing|camera)/i;
const BELVEDERE_CONTENT_HINTS =
	/(alertmarin|nixle|emergency notification|security camera|wellbeing checks|firearm safety|police transparency)/i;

function isRecent(timestamp: number): boolean {
	return timestamp >= Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
}

function formatPeriod(raw: string): string {
	return raw
		.replace(/^press log\s*/i, '')
		.replace(/^r\s*-\s*/i, '')
		.replace(/^calls for service[:\s-]*/i, '')
		.replace(/\b\d{2}\.(?=[A-Z][a-z]+)/g, '')
		.replace(/\b\d{2}(?=[A-Z][a-z]+)/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function parseMonthYear(raw: string): string | null {
	const match = raw.match(new RegExp(`\\b(${MONTH_NAMES})\\s+(\\d{4})\\b`, 'i'));
	if (!match) return null;
	return new Date(`${match[1]} 15, ${match[2]} 12:00:00 PST`).toISOString();
}

async function resolveDocumentDate(
	link: string,
	fallback: string | null = null
): Promise<string | null> {
	try {
		const response = await fetchWithTimeout(link, { method: 'HEAD', redirect: 'follow' }, 8000);
		const header = response.headers.get('last-modified') || response.headers.get('date');
		if (header) {
			const timestamp = new Date(header).getTime();
			if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
		}
	} catch {
		// fall through
	}
	return fallback;
}

function appendLocation(item: NewsItem, town?: string, townSlug?: string): NewsItem {
	if (!town || !townSlug) return item;
	return {
		...item,
		town,
		townSlug,
		locationConfidence: 'town',
		locationEvidence: town
	};
}

function parseNixleDate(raw: string): string | null {
	const cleaned = normalizeWhitespace(raw)
		.replace(/^[A-Za-z]+\s+/, '')
		.replace(/(\d+)(st|nd|rd|th)\b/gi, '$1')
		.replace(/\s*::\s*/g, ' ')
		.replace(/(\d{1,2}:\d{2})\s*([ap])\.m\./i, (_, time, meridiem) => {
			return `${time} ${meridiem.toUpperCase()}M`;
		});
	const timestamp = new Date(cleaned).getTime();
	return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function inferTown(
	text: string,
	hints: { name: string; slug: string; patterns?: string[] }[] = []
): { name: string; slug: string } | null {
	const haystack = normalizeWhitespace(text).toLowerCase();
	if (!haystack || hints.length === 0) return null;
	const matches = hints.filter((hint) =>
		(hint.patterns ?? [hint.name]).some((pattern) => haystack.includes(pattern.toLowerCase()))
	);
	return matches.length === 1 ? { name: matches[0].name, slug: matches[0].slug } : null;
}

function buildDocumentItem(params: {
	id: string;
	title: string;
	link: string;
	pubDate: string;
	source: string;
	town?: string;
	townSlug?: string;
	description: string;
	topics: string[];
}): NewsItem | null {
	const timestamp = new Date(params.pubDate).getTime();
	if (!Number.isFinite(timestamp) || !isRecent(timestamp)) return null;

	return appendLocation(
		{
			id: params.id,
			title: params.title,
			link: params.link,
			pubDate: new Date(timestamp).toISOString(),
			timestamp,
			description: params.description,
			content: params.description,
			source: params.source,
			category: 'safety',
			verification: 'official',
			topics: params.topics
		},
		params.town,
		params.townSlug
	);
}

function buildHtmlItem(params: {
	id: string;
	title: string;
	link: string;
	pubDate: string;
	source: string;
	town?: string;
	townSlug?: string;
	description: string;
	content: string;
	topics: string[];
	isAlert?: boolean;
}): NewsItem | null {
	const timestamp = new Date(params.pubDate).getTime();
	if (!Number.isFinite(timestamp) || !isRecent(timestamp)) return null;

	return appendLocation(
		{
			id: params.id,
			title: params.title,
			link: params.link,
			pubDate: new Date(timestamp).toISOString(),
			timestamp,
			description: params.description,
			content: params.content,
			source: params.source,
			category: 'safety',
			verification: 'official',
			topics: params.topics,
			isAlert: params.isAlert
		},
		params.town,
		params.townSlug
	);
}

async function fetchFairfaxLogs(): Promise<NewsItem[]> {
	const response = await fetchWithTimeout(
		FAIRFAX_DOCS_URL,
		{
			headers: { Accept: 'application/json' }
		},
		8000
	);
	if (!response.ok) throw new Error(`Fairfax fetch failed: ${response.status}`);

	const docs = (await response.json()) as Array<{
		id: number;
		date: string;
		title?: { rendered?: string };
		link: string;
		meta?: { document?: string };
	}>;

	return docs
		.map((doc) =>
			buildDocumentItem({
				id: `fairfax-police-log-${doc.id}`,
				title: `Weekly police log · ${formatPeriod(doc.title?.rendered ?? 'Fairfax')}`,
				link: doc.meta?.document || doc.link,
				pubDate: doc.date,
				source: 'Fairfax Police Log',
				town: 'Fairfax',
				townSlug: 'fairfax',
				description:
					'Official Fairfax police press log PDF. Weekly report; incident-level extraction is not yet available in the dashboard.',
				topics: ['crime', 'police-log', 'weekly-report']
			})
		)
		.filter((item): item is NewsItem => item !== null);
}

async function fetchMillValleyLogs(): Promise<NewsItem[]> {
	// Plain fetch POST — no Playwright needed.
	// Mill Valley's DocumentCenter responds to JSON POST.
	const payload = {
		folderId: 852,
		getDocuments: 1,
		imageRepo: false,
		renderMode: 0,
		loadSource: 7,
		requestingModuleID: 75,
		searchString: '',
		pageNumber: 1,
		rowsPerPage: 25,
		sortColumn: 'DisplayName',
		sortOrder: 0
	};

	const response = await fetchWithTimeout(
		MILL_VALLEY_DOC_ENDPOINT,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json;charset=UTF-8' },
			body: JSON.stringify(payload)
		},
		8000
	);
	if (!response.ok) {
		throw new Error(`Mill Valley document fetch failed: ${response.status}`);
	}

	const docs = (await response.json()) as {
		Documents?: Array<{
			ID: number;
			DisplayName?: string;
			LastModifiedDateString?: string;
			URL?: string;
		}>;
	};

	return (docs.Documents || [])
		.filter((doc) => /calls for service/i.test(doc.DisplayName || ''))
		.map((doc) => {
			const pubDate = new Date(`${doc.LastModifiedDateString} 12:00:00 PST`).toISOString();
			return buildDocumentItem({
				id: `mill-valley-police-log-${doc.ID}`,
				title: `Weekly calls for service · ${formatPeriod(doc.DisplayName || 'Mill Valley')}`,
				link: `https://www.cityofmillvalley.gov${doc.URL}`,
				pubDate,
				source: 'Mill Valley Police Log',
				town: 'Mill Valley',
				townSlug: 'mill-valley',
				description:
					'Official Mill Valley police calls-for-service PDF. Weekly report; incident-level extraction is not yet available in the dashboard.',
				topics: ['crime', 'calls-for-service', 'weekly-report']
			});
		})
		.filter((item): item is NewsItem => item !== null);
}

async function fetchRossStats(): Promise<NewsItem[]> {
	const response = await fetchWithTimeout(
		ROSS_STATS_URL,
		{
			headers: { Accept: 'text/html' }
		},
		8000
	);
	if (!response.ok) throw new Error(`Ross fetch failed: ${response.status}`);

	const html = await response.text();
	const matches = [
		...html.matchAll(
			/<a href="(https:\/\/www\.townofrossca\.gov\/sites\/default\/files\/fileattachments\/police\/page\/283\/[^"]+\.pdf)"[^>]*>([^<]+)<\/a>/gi
		)
	];

	const items = await Promise.all(
		matches.map(async ([, link, rawTitle]) => {
			const title = stripHtml(rawTitle);
			const fallbackDate = parseMonthYear(title);
			const pubDate = await resolveDocumentDate(link, fallbackDate);
			if (!pubDate) return null;

			return buildDocumentItem({
				id: `ross-police-stats-${slugify(title)}`,
				title: title.replace(/^town statistics/i, 'Monthly police statistics'),
				link,
				pubDate,
				source: 'Ross Police Statistics',
				town: 'Ross',
				townSlug: 'ross',
				description:
					'Official Ross Police monthly statistics PDF. Monthly summary report; incident-level extraction is not yet available in the dashboard.',
				topics: ['crime', 'police-stats', 'monthly-report']
			});
		})
	);

	return items.filter((item): item is NewsItem => item !== null);
}

async function fetchTiburonPoliceNews(): Promise<NewsItem[]> {
	const response = await fetchWithTimeout(
		TIBURON_POLICE_FEED_URL,
		{
			headers: { Accept: 'text/html' }
		},
		8000
	);
	if (!response.ok) throw new Error(`Tiburon news flash fetch failed: ${response.status}`);

	const feedHtml = await response.text();
	const candidates = [
		...feedHtml.matchAll(
			/<a href="([^"]+)" class="article-title-link"[\s\S]*?aria-label="Open Article ([^"]+)"/gi
		)
	]
		.map(([, href, rawTitle]) => ({
			href,
			title: decodeEntities(rawTitle).trim()
		}))
		.filter((item, index, list) => list.findIndex((c) => c.href === item.href) === index)
		.filter((item) => TIBURON_TITLE_HINTS.test(item.title));

	const items = await Promise.all(
		candidates.map(async ({ href, title }) => {
			const articleId = href.match(/(\d+)(?!.*\d)/)?.[1];
			if (!articleId) return null;
			const detailUrl = `${TIBURON_BASE_URL}/CivicAlerts.aspx?AID=${articleId}`;
			const detailResponse = await fetchWithTimeout(
				detailUrl,
				{
					headers: { Accept: 'text/html' }
				},
				8000
			);
			if (!detailResponse.ok) return null;

			const detailHtml = await detailResponse.text();
			const dateMatch = detailHtml.match(/Posted on ([A-Za-z]+ \d{1,2}, \d{4})/i);
			const contentMatch = detailHtml.match(
				/<div class="article-content fr-view">([\s\S]*?)<!-- Article Footer \/ Related News -->/i
			);

			const pubDate = dateMatch ? new Date(`${dateMatch[1]} 12:00:00 PST`).toISOString() : null;
			const content = stripHtml(contentMatch?.[1] || '');
			if (!pubDate || !TIBURON_BODY_HINTS.test(`${title} ${content}`)) return null;

			const statsItem = /police stats/i.test(title);
			return buildHtmlItem({
				id: `tiburon-police-${articleId}`,
				title,
				link: detailUrl,
				pubDate,
				source: 'Tiburon Police Department',
				town: 'Tiburon',
				townSlug: 'tiburon',
				description: statsItem
					? 'Official Tiburon Police monthly statistics post.'
					: excerpt(content),
				content,
				topics: statsItem
					? ['crime', 'police-stats', 'monthly-report']
					: ['crime', 'police-release', 'official-update']
			});
		})
	);

	return items.filter((item): item is NewsItem => item !== null);
}

async function fetchBelvedereSafetyPosts(): Promise<NewsItem[]> {
	const response = await fetchWithTimeout(
		BELVEDERE_POSTS_URL,
		{
			headers: { Accept: 'application/json' }
		},
		8000
	);
	if (!response.ok) throw new Error(`Belvedere posts fetch failed: ${response.status}`);

	const posts = (await response.json()) as Array<{
		id: number;
		date: string;
		link: string;
		title?: { rendered?: string };
		excerpt?: { rendered?: string };
		content?: { rendered?: string };
	}>;

	return posts
		.map((post) => {
			const title = stripHtml(post.title?.rendered || '');
			const content = stripHtml(post.content?.rendered || '');
			const description = excerpt(post.excerpt?.rendered || content);
			const haystack = `${title} ${content}`;

			if (!BELVEDERE_TITLE_HINTS.test(title) && !BELVEDERE_CONTENT_HINTS.test(haystack)) {
				return null;
			}

			return buildHtmlItem({
				id: `belvedere-safety-${post.id}`,
				title,
				link: post.link,
				pubDate: post.date,
				source: 'Belvedere Public Safety',
				town: 'Belvedere',
				townSlug: 'belvedere',
				description,
				content,
				topics: ['public-safety', 'official-update']
			});
		})
		.filter((item): item is NewsItem => item !== null);
}

function extractNixleDate(doc: Document): string | null {
	const headerText = normalizeWhitespace(doc.querySelector('.hd.clearfix')?.textContent || '');
	const match = headerText.match(
		/[A-Za-z]+\s+[A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,\s+\d{4}\s+::\s+\d{1,2}:\d{2}\s+[ap]\.m\.\s+(?:PST|PDT)/i
	);
	return match ? parseNixleDate(match[0]) : null;
}

async function fetchNixleDetail(
	url: string
): Promise<{ title: string; pubDate: string | null; description: string; content: string } | null> {
	const response = await fetchWithTimeout(url, { headers: { Accept: 'text/html' } }, 8000);
	if (!response.ok) return null;

	const html = await response.text();
	const doc = parseHtml(html);
	const info = doc.querySelector('.full_message_info');
	if (!info) return null;

	const title =
		normalizeWhitespace(info.querySelector('h2')?.textContent || '') ||
		stripHtml(
			doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || ''
		).replace(/\s+from\s+.*$/i, '');
	const pubDate = extractNixleDate(doc);
	const ogDescription = stripHtml(
		doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || ''
	);
	const paragraphs = [...info.querySelectorAll('p:not(.agency)')]
		.map((node) => normalizeWhitespace(node.textContent || ''))
		.filter(
			(text) =>
				text &&
				!/^English$/i.test(text) &&
				!/^Español$/i.test(text) &&
				text !== title &&
				!/^Contact\b/i.test(text) &&
				!/^Address\/Location\b/i.test(text)
		);
	const body = normalizeWhitespace(paragraphs.join(' ')) || ogDescription;

	return {
		title,
		pubDate,
		description: excerpt(body || ogDescription || title),
		content: body || ogDescription || title
	};
}

async function fetchNixleAgencyAlerts(agency: {
	source: string;
	listingUrl: string;
	town?: string;
	townSlug?: string;
	townHints?: { name: string; slug: string; patterns?: string[] }[];
}): Promise<NewsItem[]> {
	const results: NewsItem[] = [];
	const baseUrl = agency.listingUrl.endsWith('/') ? agency.listingUrl : `${agency.listingUrl}/`;

	for (let pageNumber = 1; pageNumber <= NIXLE_MAX_PAGES; pageNumber += 1) {
		const pageUrl = pageNumber === 1 ? baseUrl : `${baseUrl}?page=${pageNumber}`;
		const response = await fetchWithTimeout(
			pageUrl,
			{
				headers: { Accept: 'text/html' }
			},
			8000
		);
		if (!response.ok) {
			throw new Error(`${agency.source} Nixle fetch failed: ${response.status}`);
		}

		const html = await response.text();
		const doc = parseHtml(html);
		const cards = [...doc.querySelectorAll('li[id^="pub_"]')];
		if (cards.length === 0) break;

		const pageItems = await Promise.all(
			cards.map(async (card) => {
				const detailHref = card.querySelector('a[href*="nixle.us/"]')?.getAttribute('href');
				const detailLink = detailHref ? new URL(detailHref, pageUrl).toString() : null;
				if (!detailLink) return null;

				const priority = normalizeWhitespace(
					card.querySelector('.priority')?.textContent || 'Advisory'
				);
				const priorityTopic = priority.toLowerCase().replace(/[^a-z0-9]+/g, '-');
				const detail = await fetchNixleDetail(detailLink);
				if (!detail?.pubDate || !detail.title) return null;

				const townMatch =
					inferTown(`${detail.title} ${detail.content}`, agency.townHints || []) ||
					(agency.town && agency.townSlug ? { name: agency.town, slug: agency.townSlug } : null);

				return buildHtmlItem({
					id: `nixle-${slugify(agency.source)}-${detailLink.split('/').filter(Boolean).pop()?.toLowerCase()}`,
					title: detail.title,
					link: detailLink,
					pubDate: detail.pubDate,
					source: agency.source,
					town: townMatch?.name,
					townSlug: townMatch?.slug,
					description: detail.description,
					content: detail.content,
					topics: ['public-safety', 'police-alert', priorityTopic, 'official-update'],
					isAlert: priorityTopic !== 'community'
				});
			})
		);

		const recentItems = pageItems.filter((item): item is NewsItem => item !== null);
		results.push(...recentItems);
		if (recentItems.length === 0) break;
	}

	return [...new Map(results.map((item) => [item.id, item])).values()];
}

// --- Main export ---

export async function scrapePolice(): Promise<NewsItem[]> {
	const sources = await Promise.allSettled([
		fetchFairfaxLogs(),
		fetchMillValleyLogs(),
		fetchRossStats(),
		fetchTiburonPoliceNews(),
		fetchBelvedereSafetyPosts(),
		...NIXLE_AGENCIES.map((agency) => fetchNixleAgencyAlerts(agency))
	]);

	const items = sources
		.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
		.sort((a, b) => b.timestamp - a.timestamp);

	for (const result of sources) {
		if (result.status === 'rejected') {
			console.warn(`[police-logs] ${(result.reason as Error)?.message || result.reason}`);
		}
	}

	return items;
}

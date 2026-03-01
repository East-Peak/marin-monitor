import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputPath = path.resolve(__dirname, '../static/data/marin-activity.json');

const NOW = Date.now();
const MAX_PAST_DAYS = 300;
const MAX_FUTURE_DAYS = 400;

const SHOW_SOURCES = [
	{
		source: 'Sweetwater Music Hall',
		url: 'https://sweetwatermusichall.org/events/feed/',
		town: 'Mill Valley',
		townSlug: 'mill-valley',
		lat: 37.9059,
		lon: -122.5491
	},
	{
		source: 'Rancho Nicasio',
		url: 'https://ranchonicasio.com/events/feed/',
		town: 'Nicasio',
		townSlug: 'nicasio',
		lat: 38.0594,
		lon: -122.7028
	}
];

const FARM_MARKETS = [
	{
		title: 'Thursday Marin farmers market schedule',
		url: 'https://www.agriculturalinstitute.org/thursday-marin',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9991,
		lon: -122.5234 // Marin Civic Center
	},
	{
		title: 'Sunday Marin farmers market schedule',
		url: 'https://www.agriculturalinstitute.org/sunday-marin',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9991,
		lon: -122.5234 // Marin Civic Center
	},
	{
		title: 'Point Reyes farmers market schedule',
		url: 'https://www.agriculturalinstitute.org/point-reyes',
		town: 'Point Reyes Station',
		townSlug: 'point-reyes',
		lat: 38.0702,
		lon: -122.8105 // Toby's Feed Barn
	},
	{
		title: "Rollin' Root mobile market schedule",
		url: 'https://www.agriculturalinstitute.org/rollin-root'
	},
	{
		title: 'San Rafael Summer market schedule',
		url: 'https://www.agriculturalinstitute.org/san-rafael-summer-1',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9735,
		lon: -122.5311 // Downtown San Rafael, 4th St
	}
];

const FISHING_PAGES = [
	{
		title: 'Ocean sport fishing regulations',
		url: 'https://wildlife.ca.gov/Fishing/Ocean/Regulations'
	},
	{
		title: 'San Francisco ocean fishing map and regulations',
		url: 'https://wildlife.ca.gov/Fishing/Ocean/Regulations/Fishing-Map/SF'
	},
	{
		title: 'Ocean salmon sport fishing regulations',
		url: 'https://wildlife.ca.gov/Fishing/Ocean/Regulations/Salmon'
	},
	{
		title: 'Crab trap and season regulations',
		url: 'https://wildlife.ca.gov/Fishing/Ocean/Regulations/Crab'
	}
];

const PREP_HUBS = [
	{
		source: 'Marin Catholic Athletics',
		title: 'Marin Catholic athletic calendar',
		url: 'https://www.marincatholic.org/athletics/athletic-calendar',
		town: 'Kentfield',
		townSlug: 'kentfield',
		lat: 37.9506,
		lon: -122.5578, // Marin Catholic HS
		topics: ['prep-sports', 'schedule']
	},
	{
		source: 'Archie Williams Athletics',
		title: 'Archie Williams athletics hub',
		url: 'https://archiewilliams.tamdistrict.org/athletics',
		town: 'San Anselmo',
		townSlug: 'san-anselmo',
		lat: 37.9746,
		lon: -122.5648, // Archie Williams HS
		topics: ['prep-sports', 'schedule']
	},
	{
		source: 'San Rafael Athletics',
		title: 'San Rafael High athletics hub',
		url: 'https://sanrafael.srcs.org/athletics',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9752,
		lon: -122.5248, // San Rafael HS
		topics: ['prep-sports', 'schedule']
	},
	{
		source: 'Tamalpais Union High School District',
		title: 'TUHSD athletics hub',
		url: 'https://www.tamdistrict.org/students/athletics',
		lat: 37.9341,
		lon: -122.5353, // TUHSD office, Larkspur
		topics: ['prep-sports', 'district']
	},
	{
		source: 'Archie Williams MTB',
		title: 'Archie Williams mountain bike team hub',
		url: 'https://www.awmtb.com/',
		town: 'San Anselmo',
		townSlug: 'san-anselmo',
		lat: 37.9746,
		lon: -122.5648, // Archie Williams HS
		topics: ['prep-sports', 'mountain-bike']
	}
];

const SHOW_HUBS = [
	{
		source: "Peri's Tavern",
		title: "Peri's Tavern music calendar",
		url: 'https://peristavern.com/music-calendar/',
		town: 'Fairfax',
		townSlug: 'fairfax',
		lat: 37.9871,
		lon: -122.5889,
		topics: ['music', 'shows']
	},
	{
		source: 'The Junction',
		title: 'The Junction music calendar',
		url: 'https://www.thejunc.com/music-calendar',
		town: 'Mill Valley',
		townSlug: 'mill-valley',
		lat: 37.906,
		lon: -122.5458,
		topics: ['music', 'shows']
	},
	{
		source: 'HopMonk Novato',
		title: 'HopMonk Novato live music calendar',
		url: 'https://www.hopmonk.com/livemusic',
		town: 'Novato',
		townSlug: 'novato',
		lat: 38.1074,
		lon: -122.5697,
		topics: ['music', 'shows']
	},
	{
		source: "Smiley's Saloon",
		title: "Smiley's Saloon shows and supper club hub",
		url: 'https://smileyssaloon.com/',
		town: 'Bolinas',
		townSlug: 'bolinas',
		lat: 37.9096,
		lon: -122.6864,
		topics: ['music', 'west-marin']
	},
	{
		source: 'KWMR',
		title: 'KWMR events and tickets hub',
		url: 'https://kwmr.org/events',
		town: 'Point Reyes Station',
		townSlug: 'point-reyes',
		lat: 38.0699,
		lon: -122.8097,
		topics: ['music', 'community-events', 'west-marin']
	},
	{
		source: 'Sausalito Seahorse',
		title: 'Sausalito Seahorse calendar',
		url: 'https://www.sausalitoseahorse.com/calendar/',
		town: 'Sausalito',
		townSlug: 'sausalito',
		lat: 37.8584,
		lon: -122.4853,
		topics: ['music', 'shows']
	},
	{
		source: 'Marin Symphony',
		title: 'Marin Symphony tickets and events',
		url: 'https://marinsymphony.org/tickets-events/',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9715,
		lon: -122.52, // Marin Veterans' Memorial Auditorium
		topics: ['music', 'classical']
	},
	{
		source: 'Mill Valley Library',
		title: 'Mill Valley Library calendar',
		url: 'https://millvalleylibrary.gov/calendar.aspx',
		town: 'Mill Valley',
		townSlug: 'mill-valley',
		lat: 37.9058,
		lon: -122.5478,
		topics: ['community-events', 'library']
	},
	{
		source: 'Marin County Free Library',
		title: 'Marin County Free Library events',
		url: 'https://marinlibrary.bibliocommons.com/v2/events',
		lat: 37.9991,
		lon: -122.5234, // Civic Center Library
		topics: ['community-events', 'library']
	},
	{
		source: 'San Rafael Elks',
		title: 'San Rafael Elks Lodge calendar',
		url: 'https://www.elks1108.org/calendar',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9735,
		lon: -122.5241, // Elks Lodge, 1312 Mission Ave
		topics: ['community-events', 'fraternal']
	}
];

const SHOW_EVENT_PAGES = [
	{
		source: 'Dance Palace',
		url: 'https://dancepalace.org/events/',
		town: 'Point Reyes Station',
		townSlug: 'point-reyes',
		lat: 38.0699,
		lon: -122.8089,
		topics: ['music', 'community-events', 'west-marin']
	},
	{
		source: 'Osher Marin JCC',
		url: 'https://www.marinjcc.org/events/',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9557,
		lon: -122.5376, // 200 N San Pedro Rd
		topics: ['community-events', 'arts']
	},
	{
		source: 'Tourist Club',
		url: 'https://touristclubsf.org/calendar/',
		town: 'Mill Valley',
		townSlug: 'mill-valley',
		lat: 37.8992,
		lon: -122.5554, // On Mt Tam, Ridge Ave
		topics: ['community-events', 'club']
	}
];

const SPORTS_HUBS = [
	{
		source: 'San Rafael Pacifics',
		title: 'San Rafael Pacifics schedule and tickets',
		url: 'https://www.pacificsbaseball.com/pacifics.asp?page=11&team=801&year=2026',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9697,
		lon: -122.5117, // Albert Park Diamond
		topics: ['baseball', 'independent-ball']
	},
	{
		source: 'Marin Rowing Association',
		title: 'Marin Rowing Association calendar',
		url: 'https://www.marinrowing.org/calendar',
		town: 'Greenbrae',
		townSlug: 'greenbrae',
		lat: 37.9435,
		lon: -122.5314, // Greenbrae Boardwalk
		topics: ['rowing', 'club-sports']
	},
	{
		source: 'Marin Highlanders Rugby',
		title: 'Marin Highlanders Rugby club hub',
		url: 'https://www.marinhighlandersrugby.org/',
		town: 'San Rafael',
		townSlug: 'san-rafael',
		lat: 37.9756,
		lon: -122.5123, // Piper Park
		topics: ['rugby', 'club-sports']
	}
];

const EVENT_PAGES = [
	{
		source: 'Marin Trail Stewards',
		eventName: 'Marinduro',
		url: 'https://marintrailstewards.org/marinduro',
		category: 'cycling',
		town: 'Fairfax',
		townSlug: 'fairfax',
		lat: 37.9871,
		lon: -122.5889, // Fairfax area trails
		topics: ['cycling', 'enduro'],
		datePatterns: [/(\w+\s+\d{1,2},\s*\d{4})/i],
		regPatterns: [/bikereg\.com/i],
		regLinkPattern: /href="(https:\/\/www\.bikereg\.com\/[^"]+)"/i
	},
	{
		source: 'Inside Trail Racing',
		eventName: 'Marin Ultra Challenge',
		url: 'https://insidetrail.run/events/marin-ultra-challenge/',
		category: 'endurance',
		lat: 37.8325,
		lon: -122.5388, // Rodeo Beach
		topics: ['running', 'ultra'],
		fallbackDate: 'Mar 14, 2026 08:00:00 PST',
		description: 'Official event page for the Marin Ultra Challenge at Rodeo Beach.'
	},
	{
		source: 'Miwok 100K',
		eventName: 'Miwok 100K',
		url: 'https://miwok100k.com/',
		category: 'endurance',
		lat: 37.8328,
		lon: -122.5295, // Marin Headlands / Tennessee Valley
		topics: ['running', 'ultra'],
		verification: 'official',
		datePatterns: [/(\w+\s+\d{1,2},?\s*\d{4})/i],
		regPatterns: [/ultrasignup\.com/i, /registration/i]
	},
	{
		source: 'Quad Dipsea',
		eventName: 'Quad Dipsea',
		url: 'https://www.quad-dipsea.com/',
		category: 'endurance',
		town: 'Mill Valley',
		townSlug: 'mill-valley',
		lat: 37.9072,
		lon: -122.5496, // Old Mill Park start
		topics: ['running', 'dipsea'],
		verification: 'official',
		datePatterns: [/(\w+day,?\s+\w+\s+\d{1,2},?\s*\d{4})/i, /(\w+\s+\d{1,2},?\s*\d{4})/i],
		regPatterns: [/ultrasignup\.com/i, /registration/i, /sign.?up/i]
	}
];

function stripHtml(raw = '') {
	return raw
		.replace(/<!\[CDATA\[|\]\]>/g, '')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<\/p>/gi, '\n')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&quot;/gi, '"')
		.replace(/&#039;|&apos;/gi, "'")
		.replace(/&#8211;|&#x2013;/gi, '–')
		.replace(/&#8212;|&#x2014;/gi, '—')
		.replace(/&#8217;|&#x2019;/gi, "'")
		.replace(/&#8220;|&#x201c;/gi, '"')
		.replace(/&#8221;|&#x201d;/gi, '"')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/\s+/g, ' ')
		.trim();
}

function excerpt(raw = '', maxLength = 220) {
	const text = stripHtml(raw);
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function slugify(raw = '') {
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

function isTimely(timestamp) {
	const deltaDays = (timestamp - NOW) / (1000 * 60 * 60 * 24);
	return deltaDays >= -MAX_PAST_DAYS && deltaDays <= MAX_FUTURE_DAYS;
}

function toIsoDate(dateInput) {
	if (!dateInput) return new Date().toISOString();
	if (dateInput instanceof Date) {
		return Number.isFinite(dateInput.getTime())
			? dateInput.toISOString()
			: new Date().toISOString();
	}

	const cleaned = String(dateInput)
		.replace(/(\d{1,2}:\d{2})(am|pm)\b/i, '$1 $2')
		.replace(/\s+/g, ' ')
		.trim();
	const date = new Date(cleaned);
	return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

async function fetchText(url) {
	const response = await fetch(url, {
		headers: {
			'User-Agent': 'Mozilla/5.0',
			Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
		}
	});
	if (!response.ok) throw new Error(`${url} → ${response.status}`);
	return await response.text();
}

async function fetchLastModified(url) {
	try {
		const response = await fetch(url, {
			method: 'HEAD',
			headers: { 'User-Agent': 'Mozilla/5.0' }
		});
		const header = response.headers.get('last-modified') || response.headers.get('date');
		if (header) {
			const timestamp = new Date(header).getTime();
			if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
		}
	} catch {
		// fall through
	}
	return new Date().toISOString();
}

function parseXml(xml) {
	return new JSDOM(xml, { contentType: 'text/xml' }).window.document;
}

function parseHtml(html) {
	const sanitized = html
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script(?![^>]*application\/ld\+json)[\s\S]*?<\/script>/gi, ' ');
	return new JSDOM(sanitized).window.document;
}

function buildEventTitle(eventName, dateInput, hasRegistration) {
	const parts = [eventName];
	if (dateInput) {
		const d = new Date(dateInput);
		if (Number.isFinite(d.getTime())) {
			parts.push(
				d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
			);
		}
	}
	if (hasRegistration) parts.push('Registration open');
	return parts.join(' — ');
}

async function parseEventPage(config) {
	const {
		source,
		eventName,
		url,
		category,
		town,
		townSlug,
		lat,
		lon,
		topics = [],
		datePatterns = [],
		regPatterns = [],
		regLinkPattern,
		fallbackDate,
		description: staticDesc,
		verification = 'community'
	} = config;

	let html;
	try {
		html = await fetchText(url);
	} catch {
		// Site unreachable — use static fallback if available
		if (fallbackDate || staticDesc) {
			const item = buildItem({
				category,
				source,
				title: buildEventTitle(eventName, fallbackDate, false),
				link: url,
				pubDate: fallbackDate,
				description: staticDesc || `Official ${eventName} event page.`,
				verification,
				town,
				townSlug,
				lat,
				lon,
				topics
			});
			return item ? [item] : [];
		}
		return [];
	}

	// Try JSON-LD first
	const jsonLdScripts = [
		...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)
	];
	for (const match of jsonLdScripts) {
		try {
			const parsed = JSON.parse(normalizeJsonLd(match[1]));
			const events = flattenJsonLdEvents(parsed);
			if (events.length > 0) {
				const event = events[0];
				const hasReg = regPatterns.some((p) => p.test(html));
				const item = buildItem({
					category,
					source,
					title: buildEventTitle(eventName, event.startDate, hasReg),
					link: event.url || url,
					pubDate: event.startDate || event.endDate,
					description: stripHtml(event.description || '') || staticDesc,
					verification,
					town,
					townSlug,
					lat,
					lon,
					topics
				});
				return item ? [item] : [];
			}
		} catch {
			// malformed JSON-LD, continue
		}
	}

	// Regex fallback: extract date and registration info from page text
	const pageText = stripHtml(html);
	let extractedDate = fallbackDate;
	for (const pattern of datePatterns) {
		const m = pageText.match(pattern);
		if (m) {
			const parsed = new Date(m[1]);
			if (Number.isFinite(parsed.getTime())) {
				extractedDate = m[1];
				break;
			}
		}
	}

	const hasReg = regPatterns.some((p) => p.test(html));
	let link = url;
	if (regLinkPattern) {
		const linkMatch = html.match(regLinkPattern);
		if (linkMatch) link = linkMatch[1];
	}

	const item = buildItem({
		category,
		source,
		title: buildEventTitle(eventName, extractedDate, hasReg),
		link,
		pubDate: extractedDate,
		description: staticDesc || `Official ${eventName} event page.`,
		verification,
		town,
		townSlug,
		lat,
		lon,
		topics
	});
	return item ? [item] : [];
}

function flattenJsonLdEvents(node) {
	if (!node) return [];
	if (Array.isArray(node)) {
		return node.flatMap((entry) => flattenJsonLdEvents(entry));
	}
	if (typeof node !== 'object') return [];
	if (node['@type'] === 'Event') return [node];
	if (Array.isArray(node['@graph'])) {
		return flattenJsonLdEvents(node['@graph']);
	}
	if (Array.isArray(node.itemListElement)) {
		return flattenJsonLdEvents(node.itemListElement);
	}
	if (node.item) {
		return flattenJsonLdEvents(node.item);
	}
	return [];
}

function normalizeJsonLd(raw) {
	return raw.trim();
}

function buildItem({
	category,
	source,
	title,
	link,
	pubDate,
	description,
	content,
	verification = 'community',
	town,
	townSlug,
	lat,
	lon,
	topics = []
}) {
	const iso = toIsoDate(pubDate);
	const timestamp = new Date(iso).getTime();
	if (!Number.isFinite(timestamp) || !isTimely(timestamp)) return null;

	const hasCoords = typeof lat === 'number' && typeof lon === 'number';
	return {
		id: `${category}:${slugify(source)}:${slugify(title)}:${slugify(link)}`,
		title,
		link,
		pubDate: iso,
		timestamp,
		description: description ? excerpt(description) : undefined,
		content: content ? stripHtml(content) : undefined,
		source,
		category,
		verification,
		town,
		townSlug,
		lat: hasCoords ? lat : undefined,
		lon: hasCoords ? lon : undefined,
		locationConfidence: hasCoords ? 'exact' : townSlug ? 'town' : undefined,
		locationEvidence: hasCoords ? source : town ? town : undefined,
		topics
	};
}

function getTagText(element, tagName) {
	const nodes = element.getElementsByTagName(tagName);
	return nodes.length > 0 ? nodes[0].textContent || '' : '';
}

async function parseRssFeed({ source, url, town, townSlug, lat, lon, category, topics = [] }) {
	const xml = await fetchText(url);
	const doc = parseXml(xml);
	const items = [];
	for (const item of [...doc.querySelectorAll('item')]) {
		const title = stripHtml(getTagText(item, 'title'));
		const link = stripHtml(getTagText(item, 'link'));
		const pubDate = getTagText(item, 'pubDate');
		const description = getTagText(item, 'description');
		const content = getTagText(item, 'content:encoded') || description;
		const newsItem = buildItem({
			category,
			source,
			title,
			link,
			pubDate,
			description,
			content,
			verification: 'community',
			town,
			townSlug,
			lat,
			lon,
			topics
		});
		if (newsItem) items.push(newsItem);
	}
	return items;
}

async function parseAtomFeed({ source, url, town, townSlug, lat, lon, category, topics = [] }) {
	const xml = await fetchText(url);
	const doc = parseXml(xml);
	const items = [];
	for (const entry of [...doc.querySelectorAll('entry')]) {
		const title = stripHtml(entry.querySelector('title')?.textContent || '');
		const link =
			entry.querySelector('link[rel="alternate"]')?.getAttribute('href') ||
			entry.querySelector('link')?.getAttribute('href') ||
			'';
		const pubDate =
			entry.querySelector('published')?.textContent || entry.querySelector('updated')?.textContent;
		const description =
			entry.querySelector('summary')?.textContent ||
			entry.querySelector('content')?.textContent ||
			'';
		const content = entry.querySelector('content')?.textContent || description;
		const newsItem = buildItem({
			category,
			source,
			title,
			link,
			pubDate,
			description,
			content,
			verification: 'official',
			town,
			townSlug,
			lat,
			lon,
			topics
		});
		if (newsItem) items.push(newsItem);
	}
	return items;
}

async function parseJsonLdEventPage({
	source,
	url,
	category,
	town,
	townSlug,
	lat,
	lon,
	verification = 'community',
	topics = [],
	limit = 10
}) {
	const html = await fetchText(url);
	const scripts = [
		...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)
	];
	const events = [];

	for (const match of scripts) {
		try {
			const parsed = JSON.parse(normalizeJsonLd(match[1]));
			events.push(...flattenJsonLdEvents(parsed));
		} catch {
			// Ignore malformed JSON-LD blocks and keep scanning.
		}
	}

	return events
		.map((event) =>
			buildItem({
				category,
				source,
				title: stripHtml(event.name || 'Upcoming event'),
				link: event.url || url,
				pubDate: event.startDate || event.endDate || new Date().toISOString(),
				description: stripHtml(event.description || ''),
				content: stripHtml(
					[
						event.location?.name,
						event.organizer?.name,
						event.eventAttendanceMode,
						event.eventStatus
					]
						.filter(Boolean)
						.join(' · ')
				),
				verification,
				town,
				townSlug,
				lat,
				lon,
				topics
			})
		)
		.filter(Boolean)
		.filter((item) => item.timestamp >= NOW - 24 * 60 * 60 * 1000)
		.sort((a, b) => a.timestamp - b.timestamp)
		.slice(0, limit);
}

function inferTownFromText(text) {
	const lower = text.toLowerCase();
	if (lower.includes('novato')) return { town: 'Novato', townSlug: 'novato' };
	if (lower.includes('mill valley') || lower.includes('mt. tam') || lower.includes('mt tam')) {
		return { town: 'Mill Valley', townSlug: 'mill-valley' };
	}
	if (lower.includes('fairfax')) return { town: 'Fairfax', townSlug: 'fairfax' };
	if (lower.includes('san rafael')) return { town: 'San Rafael', townSlug: 'san-rafael' };
	if (lower.includes('point reyes')) {
		return { town: 'Point Reyes Station', townSlug: 'point-reyes' };
	}
	if (lower.includes('stinson')) return { town: 'Stinson Beach', townSlug: 'stinson-beach' };
	return {};
}

async function parseMacsEvents() {
	const html = await fetchText('https://macsat19broadway.com/events/');
	const cards = [
		...html.matchAll(
			/<article class="event-card">[\s\S]*?<span class="event-date">([^<]+)<\/span>[\s\S]*?<h3 class="event-title">([\s\S]*?)<\/h3>[\s\S]*?<a href="([^"]+)"[\s\S]*?class="event-btn"/gi
		)
	];

	return cards
		.map((match) =>
			buildItem({
				category: 'shows',
				source: "Mac's at 19 Broadway",
				title: stripHtml(match[2]),
				link: stripHtml(match[3]),
				pubDate: stripHtml(match[1]),
				description: 'Upcoming Fairfax show at Mac’s at 19 Broadway.',
				content: 'Fairfax live music, comedy, and nightlife calendar.',
				verification: 'community',
				town: 'Fairfax',
				townSlug: 'fairfax',
				lat: 37.9871,
				lon: -122.5889, // 19 Broadway, Fairfax
				topics: ['music', 'shows']
			})
		)
		.filter(Boolean)
		.sort((a, b) => a.timestamp - b.timestamp)
		.slice(0, 10);
}

async function parseWebscorer() {
	const html = await fetchText('https://www.webscorer.com/b17racing');
	const doc = parseHtml(html);
	const rows = [];
	for (const row of [...doc.querySelectorAll('tr')]) {
		const titleLink = row.querySelector('a[href^="/race?raceid="]');
		if (!titleLink) continue;
		const title =
			stripHtml(titleLink.textContent || '') ||
			stripHtml(titleLink.querySelector('img')?.getAttribute('alt') || '');
		const raceType = stripHtml(row.querySelector('.racetype')?.textContent || '');
		const date = stripHtml(row.querySelector('[id*="lbRaceDate"]')?.textContent || '');
		const location = stripHtml(row.querySelector('[id*="lbRaceLocation"]')?.textContent || '');
		const sport = stripHtml(row.querySelector('[id*="lbRaceSport"]')?.textContent || '');
		const haystack = `${title} ${location} ${sport}`.toLowerCase();
		if (!/(stafford|novato|tam|mill valley|marin|fairfax|larkspur)/i.test(haystack)) continue;
		const link = new URL(titleLink.getAttribute('href'), 'https://www.webscorer.com').toString();
		const pubDate = `${date} 12:00:00 PST`;
		const townData = inferTownFromText(`${title} ${location}`);
		const category = /running/i.test(sport) ? 'endurance' : 'cycling';
		const item = buildItem({
			category,
			source: 'B-17 / Webscorer',
			title: raceType ? `${title} — ${raceType}` : title,
			link,
			pubDate,
			description: `${location} · ${sport}`,
			content: `${location} ${sport}`,
			verification: 'community',
			town: townData.town,
			townSlug: townData.townSlug,
			topics: category === 'cycling' ? ['cycling', 'race-results'] : ['running', 'hill-climb']
		});
		if (item) rows.push(item);
	}
	return rows;
}

async function parseDipseaHome() {
	const html = await fetchText('https://www.dipsea.org/');
	const matches = [
		...html.matchAll(
			/<b>([^<]+)<\/b>([\s\S]*?)<a href="(https:\/\/www\.dipsea\.org\/news\/[^"]+)"[\s\S]*?<span class='date'>Posted ([^<]+)<\/span>/gi
		)
	];
	const items = [];
	for (const match of matches.slice(0, 3)) {
		const [, rawTitle, rawBody, link, posted] = match;
		const item = buildItem({
			category: 'endurance',
			source: 'Dipsea Race',
			title: stripHtml(rawTitle).replace(/:$/, ''),
			link,
			pubDate: posted,
			description: stripHtml(rawBody),
			content: stripHtml(rawBody),
			verification: 'official',
			town: 'Mill Valley',
			townSlug: 'mill-valley',
			lat: 37.906,
			lon: -122.5491, // Dipsea Steps, Mill Valley
			topics: ['running', 'trail-race']
		});
		if (item) items.push(item);
	}
	if (items.length > 0) return items;

	const fallbackDate = await fetchLastModified('https://www.dipsea.org/');
	const fallback = buildItem({
		category: 'endurance',
		source: 'Dipsea Race',
		title: 'Dipsea race hub and season updates',
		link: 'https://www.dipsea.org/',
		pubDate: fallbackDate,
		description: 'Official Dipsea race site for race information, entry details, and latest news.',
		verification: 'official',
		town: 'Mill Valley',
		townSlug: 'mill-valley',
		lat: 37.906,
		lon: -122.5491, // Dipsea Steps, Mill Valley
		topics: ['running', 'trail-race']
	});
	return fallback ? [fallback] : [];
}

async function parseSinglePageItem({
	source,
	category,
	title,
	url,
	description,
	town,
	townSlug,
	lat,
	lon,
	verification = 'community',
	topics = [],
	pubDate
}) {
	const effectivePubDate = pubDate ?? (await fetchLastModified(url));
	const item = buildItem({
		category,
		source,
		title,
		link: url,
		pubDate: effectivePubDate,
		description,
		verification,
		town,
		townSlug,
		lat,
		lon,
		topics
	});
	return item ? [item] : [];
}

async function parseRedwoodBarkSports() {
	return parseRssFeed({
		source: 'Redwood Bark',
		url: 'https://redwoodbark.org/category/sports/feed/',
		category: 'prep',
		town: 'Larkspur',
		townSlug: 'larkspur',
		lat: 37.9341,
		lon: -122.5353, // Redwood High School
		topics: ['prep-sports']
	});
}

async function parseNorcalRaces() {
	const html = await fetchText('https://www.norcalmtb.org/races/');
	const text = stripHtml(html);
	const match = text.match(/Race 4:\s*Stafford, Novato\s*4\/25\s*5\/2/i);
	if (!match) return [];
	const item = buildItem({
		category: 'prep',
		source: 'NorCal MTB',
		title: 'Race 4: Stafford, Novato',
		link: 'https://www.norcalmtb.org/races/',
		pubDate: 'Apr 25, 2026 09:00:00 PST',
		description: 'NorCal MTB race weekend at Stafford Lake with Novato on the league calendar.',
		verification: 'official',
		town: 'Novato',
		townSlug: 'novato',
		lat: 38.1285,
		lon: -122.6041, // Stafford Lake
		topics: ['prep-sports', 'mountain-bike']
	});
	return item ? [item] : [];
}

async function parseShowsHubs() {
	const items = [];

	items.push(...(await parseMacsEvents()));

	for (const page of SHOW_EVENT_PAGES) {
		items.push(
			...(await parseJsonLdEventPage({
				source: page.source,
				url: page.url,
				category: 'shows',
				town: page.town,
				townSlug: page.townSlug,
				lat: page.lat,
				lon: page.lon,
				verification: 'community',
				topics: page.topics
			}))
		);
	}

	for (const hub of SHOW_HUBS) {
		items.push(
			...(await parseSinglePageItem({
				source: hub.source,
				category: 'shows',
				title: hub.title,
				url: hub.url,
				description: 'Curated Marin venue or community calendar worth checking directly.',
				verification: 'community',
				town: hub.town,
				townSlug: hub.townSlug,
				lat: hub.lat,
				lon: hub.lon,
				topics: hub.topics
			}))
		);
	}

	return items;
}

async function parsePacificsSchedule() {
	const scheduleUrl = 'https://www.pacificsbaseball.com/pacifics.asp?page=11&team=801&year=2026';
	try {
		const html = await fetchText(scheduleUrl);
		const items = [];
		const now = Date.now();

		// Schedule data is embedded in JS arrays like:
		// ['img','url','','Vallejo Seaweed @ San Rafael Pacifics 05-21-2026 6:00:00 PM','5/21/2026']
		// Match the "Opponent @ San Rafael Pacifics MM-DD-YYYY H:MM:SS AM/PM" pattern
		const gamePattern =
			/(.+?)\s+@\s+San Rafael Pacifics\s+(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}:\d{2}:\d{2}\s*(?:AM|PM))/gi;

		let match;
		while ((match = gamePattern.exec(html)) !== null) {
			const [, opponentRaw, month, day, year, timeRaw] = match;
			// Clean up opponent name — might have leading punctuation from JS array
			const opponent = opponentRaw.replace(/^[^a-zA-Z]+/, '').trim();
			const dateStr = `${month}/${day}/${year} ${timeRaw.replace(/\s+/g, ' ').trim()}`;
			const gameDate = new Date(dateStr);
			if (!Number.isFinite(gameDate.getTime())) continue;
			const gameTimestamp = gameDate.getTime();

			// Only future home games (within next 120 days)
			if (gameTimestamp < now || gameTimestamp > now + 120 * 24 * 60 * 60 * 1000) continue;

			const dayStr = gameDate.toLocaleDateString('en-US', {
				weekday: 'short',
				month: 'short',
				day: 'numeric'
			});
			const timeStr = gameDate.toLocaleTimeString('en-US', {
				hour: 'numeric',
				minute: '2-digit'
			});
			const title = `Pacifics vs ${opponent} · ${dayStr}, ${timeStr}`;

			const item = buildItem({
				category: 'prep',
				source: 'San Rafael Pacifics',
				title,
				link: scheduleUrl,
				pubDate: gameDate.toISOString(),
				description: `San Rafael Pacifics home game at Albert Park. ${timeStr} first pitch.`,
				verification: 'community',
				town: 'San Rafael',
				townSlug: 'san-rafael',
				lat: 37.9697,
				lon: -122.5117, // Albert Park Diamond
				topics: ['baseball', 'independent-ball']
			});
			if (item) items.push(item);
		}

		if (items.length > 0) return items.slice(0, 5);
	} catch {
		// Fall through to hub fallback
	}

	// Fallback: return hub link
	const pacificsHub = SPORTS_HUBS.find((h) => h.source === 'San Rafael Pacifics');
	if (!pacificsHub) return [];
	return parseSinglePageItem({
		source: pacificsHub.source,
		category: 'prep',
		title: pacificsHub.title,
		url: pacificsHub.url,
		description: 'Local sports hub for schedules, fixtures, club updates, or season information.',
		verification: 'community',
		town: pacificsHub.town,
		townSlug: pacificsHub.townSlug,
		topics: pacificsHub.topics
	});
}

async function parseSportsHubs() {
	const items = [];

	// Pacifics: try schedule scraping first
	items.push(...(await safeParse('Pacifics schedule', parsePacificsSchedule)));

	for (const hub of SPORTS_HUBS) {
		// Skip Pacifics — handled above with dedicated scraper
		if (hub.source === 'San Rafael Pacifics') continue;
		items.push(
			...(await parseSinglePageItem({
				source: hub.source,
				category: 'prep',
				title: hub.title,
				url: hub.url,
				description:
					'Local sports hub for schedules, fixtures, club updates, or season information.',
				verification: 'community',
				town: hub.town,
				townSlug: hub.townSlug,
				lat: hub.lat,
				lon: hub.lon,
				topics: hub.topics
			}))
		);
	}

	return items;
}

async function parsePrepHubs() {
	const items = [];
	for (const hub of PREP_HUBS) {
		items.push(
			...(await parseSinglePageItem({
				source: hub.source,
				category: 'prep',
				title: hub.title,
				url: hub.url,
				description: 'Official athletics or team hub for a Marin-area school or league program.',
				verification: 'official',
				town: hub.town,
				townSlug: hub.townSlug,
				lat: hub.lat,
				lon: hub.lon,
				topics: hub.topics
			}))
		);
	}
	return items;
}

async function scrapeFarmMarketSchedule(market) {
	try {
		const html = await fetchText(market.url);
		const text = stripHtml(html);

		// Try to extract day/time patterns like "Every Saturday", "9am–2pm", "8am - 1pm"
		const dayMatch = text.match(
			/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i
		);
		const timeMatch = text.match(
			/(\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*[-–—to]+\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))/i
		);
		const seasonMatch = text.match(
			/((?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\s*[-–—]+\s*(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s*\d{4})/i
		);
		const locationMatch = text.match(
			/(?:at|location:?)\s+([^.!?\n]{5,60}(?:center|barn|street|plaza|downtown|fourth|civic))/i
		);
		const yearRoundMatch = /rain or shine|year[\s-]?round/i.test(text);

		const parts = [];
		if (dayMatch) parts.push(dayMatch[0]);
		if (timeMatch) parts.push(timeMatch[1].replace(/\s+/g, ' ').trim());
		if (seasonMatch) parts.push(seasonMatch[1]);
		else if (yearRoundMatch) parts.push('Year-round');

		let location = market.town || '';
		if (locationMatch) location = locationMatch[1].trim();

		const title =
			parts.length > 0
				? `${market.title.replace(/ schedule$/, '')} · ${parts.join(', ')}`
				: market.title;

		const desc =
			parts.length > 0
				? `${parts.join(' · ')}${location ? ` at ${location}` : ''}`
				: 'Official market schedule from the Agricultural Institute of Marin.';

		return { title, description: desc };
	} catch {
		return {
			title: market.title,
			description: 'Official market schedule from the Agricultural Institute of Marin.'
		};
	}
}

async function parseFarmMarkets() {
	const items = [];
	for (const market of FARM_MARKETS) {
		const scraped = await scrapeFarmMarketSchedule(market);
		items.push(
			...(await parseSinglePageItem({
				source: 'Agricultural Institute of Marin',
				category: 'farm',
				title: scraped.title,
				url: market.url,
				description: scraped.description,
				verification: 'official',
				town: market.town,
				townSlug: market.townSlug,
				lat: market.lat,
				lon: market.lon,
				topics: ['farmers-market', 'produce']
			}))
		);
	}
	return items;
}

async function parsePointReyesCheese() {
	const entries = await parseAtomFeed({
		source: 'Point Reyes Farmstead Cheese',
		url: 'https://www.pointreyescheese.com/blogs/news.atom',
		category: 'farm',
		town: 'Point Reyes Station',
		townSlug: 'point-reyes',
		lat: 38.0764,
		lon: -122.8012, // Point Reyes Farmstead Cheese Co
		topics: ['cheese', 'farm-market']
	});
	if (entries.length > 0) return entries;
	return parseSinglePageItem({
		source: 'Point Reyes Farmstead Cheese',
		category: 'farm',
		title: 'Point Reyes Farmstead Cheese journal',
		url: 'https://www.pointreyescheese.com/blogs/news',
		description: 'Official Point Reyes Farmstead Cheese news and seasonal product updates.',
		verification: 'official',
		town: 'Point Reyes Station',
		townSlug: 'point-reyes',
		lat: 38.0764,
		lon: -122.8012, // Point Reyes Farmstead Cheese Co
		topics: ['cheese', 'farm-market']
	});
}

async function parseFishingPages() {
	const items = [];
	for (const page of FISHING_PAGES) {
		items.push(
			...(await parseSinglePageItem({
				source: 'California Department of Fish & Wildlife',
				category: 'outdoors',
				title: page.title,
				url: page.url,
				description:
					'Official California fishing regulations and season information relevant to the Marin / SF coast.',
				verification: 'official',
				topics: ['fishing', 'regulations']
			}))
		);
	}
	return items;
}

async function parseFilteredFeedCategory({
	url,
	source,
	category,
	town,
	townSlug,
	keywords,
	topics
}) {
	const items = await parseRssFeed({ source, url, category, town, townSlug, topics });
	return items.filter((item) => {
		const haystack = `${item.title} ${item.description || ''} ${item.content || ''}`.toLowerCase();
		return keywords.some((keyword) => haystack.includes(keyword));
	});
}

async function safeParse(label, fn) {
	try {
		return await fn();
	} catch (err) {
		console.warn(`[WARN] ${label}: ${err.message}`);
		return [];
	}
}

async function main() {
	const collected = [];

	for (const source of SHOW_SOURCES) {
		collected.push(
			...(await safeParse(`RSS ${source.source}`, () =>
				parseRssFeed({
					...source,
					category: 'shows',
					topics: ['music', 'shows']
				})
			))
		);
	}

	collected.push(...(await safeParse('Shows hubs', parseShowsHubs)));
	collected.push(...(await safeParse('Webscorer', parseWebscorer)));

	// Config-driven event pages (Marinduro, Miwok, Quad Dipsea, Marin Ultra Challenge)
	for (const eventConfig of EVENT_PAGES) {
		collected.push(
			...(await safeParse(`Event: ${eventConfig.eventName}`, () => parseEventPage(eventConfig)))
		);
	}

	collected.push(...(await safeParse('Dipsea', parseDipseaHome)));
	collected.push(...(await safeParse('Redwood Bark', parseRedwoodBarkSports)));
	collected.push(...(await safeParse('NorCal MTB', parseNorcalRaces)));
	collected.push(...(await safeParse('Prep hubs', parsePrepHubs)));
	collected.push(...(await safeParse('Sports hubs', parseSportsHubs)));
	collected.push(...(await safeParse('Farm markets', parseFarmMarkets)));
	collected.push(...(await safeParse('Pt Reyes Cheese', parsePointReyesCheese)));
	collected.push(...(await safeParse('Fishing pages', parseFishingPages)));

	// Fishing: Point Reyes Light (expanded keywords)
	collected.push(
		...(await safeParse('Pt Reyes Light fishing', () =>
			parseFilteredFeedCategory({
				url: 'https://www.ptreyeslight.com/feed/',
				source: 'Point Reyes Light',
				category: 'outdoors',
				keywords: [
					'fish',
					'fishing',
					'salmon',
					'crab',
					'oyster',
					'dungeness',
					'halibut',
					'rockfish',
					'herring',
					'squid',
					'mackerel',
					'mussels',
					'clam',
					'abalone',
					'striped bass',
					'sturgeon',
					'steelhead',
					'trout',
					'albacore'
				],
				topics: ['fishing', 'west-marin']
			})
		))
	);

	// Fishing: Marin IJ filtered
	collected.push(
		...(await safeParse('Marin IJ fishing', () =>
			parseFilteredFeedCategory({
				url: 'https://www.marinij.com/feed/',
				source: 'Marin Independent Journal',
				category: 'outdoors',
				keywords: [
					'fishing',
					'salmon',
					'crab',
					'dungeness',
					'oyster',
					'halibut',
					'fish stock',
					'trawl',
					'commercial fishing',
					'shellfish',
					'aquaculture'
				],
				topics: ['fishing', 'local-news']
			})
		))
	);

	// Farm: Marin Magazine filtered
	collected.push(
		...(await safeParse('Marin Magazine farm', () =>
			parseFilteredFeedCategory({
				url: 'https://marinmagazine.com/feed/',
				source: 'Marin Magazine',
				category: 'farm',
				keywords: [
					'farmers market',
					'market',
					'cheese',
					'creamery',
					'produce',
					'wine',
					'beer',
					'brewery'
				],
				topics: ['farmers-market', 'food-drink']
			})
		))
	);

	// --- Stage 1: Link-based dedupe (normalize Sweetwater numeric suffixes) ---
	const linkDeduped = [];
	const seenLinks = new Set();
	for (const item of collected.filter(Boolean).sort((a, b) => b.timestamp - a.timestamp)) {
		const normalizedLink = item.link.replace(/-\d+(\/|$)/, '$1');
		const key = `${item.category}:${normalizedLink}`;
		if (seenLinks.has(key)) continue;
		seenLinks.add(key);
		linkDeduped.push(item);
	}

	// --- Stage 2: Title-based dedupe for recurring events ---
	// Same source + same normalized title = recurring event; keep only the next upcoming occurrence.
	const now = Date.now();
	const titleGroups = new Map();
	for (const item of linkDeduped) {
		const normTitle = item.title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, ' ')
			.trim();
		const groupKey = `${item.category}:${item.source}:${normTitle}`;
		if (!titleGroups.has(groupKey)) titleGroups.set(groupKey, []);
		titleGroups.get(groupKey).push(item);
	}

	const deduped = [];
	for (const [, group] of titleGroups) {
		if (group.length === 1) {
			deduped.push(group[0]);
			continue;
		}
		// Sort by timestamp ascending, pick the first future occurrence (or most recent past if none future)
		group.sort((a, b) => a.timestamp - b.timestamp);
		const nextUpcoming = group.find((item) => item.timestamp >= now);
		deduped.push(nextUpcoming || group[group.length - 1]);
	}

	// Re-sort final output newest-first
	deduped.sort((a, b) => b.timestamp - a.timestamp);

	await fs.writeFile(outputPath, JSON.stringify(deduped, null, 2));

	const byCategory = deduped.reduce((acc, item) => {
		acc[item.category] = (acc[item.category] || 0) + 1;
		return acc;
	}, {});

	console.log(`Wrote ${deduped.length} activity items to ${outputPath}`);
	console.log(byCategory);
}

await main();

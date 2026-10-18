/**
 * The v2 map's shows and sheriff reports (NEWSPIN1), each placed only as precisely as its
 * evidence. A show is a row under its venue's dot, and only at a confirmed venue (placeOf); a
 * report is a row under its town's count, at the town, with the county's masked address as text.
 * Both windows are re-applied on every render, so kept data ages out.
 */
import type { NewsItem } from '$lib/types';
import { TOWN_BY_SLUG } from '$lib/config/towns';
import { venueById } from '$lib/config/venues';
import { measuredFromEntry } from './measured';
import { PACIFIC, formatAsOf } from './pacific-time';
import { placeOf } from './map-place';
import { datasetEntry, type DatasetFetch } from './source-adapters';
import { upcomingShows, type UpcomingShow } from './upcoming-shows';
import type { BlotterView } from './v2-blotter';
import type { LayerPoint, LayerRead } from './v2-map-layers';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;
const fmt = (opts: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, ...opts });
const DAY = fmt({ weekday: 'short', month: 'short', day: 'numeric' });
const DAY_TIME = fmt({
	weekday: 'short',
	month: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit'
});
/** ICU puts a narrow no-break space before AM/PM; the UI uses a plain one. */
const plain = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ');
/** A date-only show's day, read at its Pacific noon so no zone moves it. */
const when = (s: UpcomingShow) =>
	plain(s.at === null ? DAY.format(Date.parse(`${s.day}T12:00:00-07:00`)) : DAY_TIME.format(s.at));

const NOT_READ: Omit<LayerRead, 'state'> = {
	asOf: null,
	kept: null,
	note: null,
	points: [],
	complete: false
};

function keptNote(retainedAfter: string | null, observedAt: number | null, now: number) {
	if (retainedAfter === null) return null;
	const from = observedAt === null ? 'an earlier read' : formatAsOf(observedAt, now);
	return `Kept from ${from} · ${retainedAfter}`;
}

export function showsLayer(
	fetch: DatasetFetch | undefined,
	items: readonly NewsItem[] | null,
	now: number
): LayerRead {
	const entry = datasetEntry('activity', 'venue calendars', fetch, null);
	const m = measuredFromEntry(entry, items, 'venue calendars', now);
	if (m.kind !== 'value') return { state: m.kind, ...NOT_READ };
	const upcoming = upcomingShows(m.value, now);
	const byVenue = new Map<string, UpcomingShow[]>();
	for (const s of upcoming) {
		const place = placeOf(s.item);
		if (place.kind !== 'place') continue;
		const venueId = place.id.slice('venue:'.length);
		byVenue.set(venueId, [...(byVenue.get(venueId) ?? []), s]);
	}
	const mapped = [...byVenue.values()].reduce((sum, shows) => sum + shows.length, 0);
	const points: LayerPoint[] = [];
	// Venues in order of their next show; each venue's shows by start under it.
	for (const [venueId, shows] of byVenue) {
		const venue = venueById(venueId)!;
		const from = `${venue.name} · venue list`;
		const at = { lon: venue.lon, lat: venue.lat };
		points.push({
			id: `venue:${venue.id}`,
			...at,
			title: venue.name,
			at: null,
			heading: true,
			rank: points.length,
			townSlug: venue.townSlug,
			props: { itemId: `venue:${venue.id}`, name: venue.name, count: shows.length },
			detail: {
				title: venue.name,
				meta: [from, `${plural(shows.length, 'show')} · next 10 days`],
				paragraphs: shows.map((s) => `${when(s)} · ${s.item.title.split(' | ')[0]}`),
				source: null
			}
		});
		for (const s of shows)
			points.push({
				id: `event:${s.item.id}`,
				...at,
				title: s.item.title.split(' | ')[0],
				at: s.at,
				listOnly: true,
				rank: points.length,
				townSlug: venue.townSlug,
				props: { itemId: `event:${s.item.id}` },
				detail: {
					title: s.item.title.split(' | ')[0],
					meta: [from, when(s)],
					paragraphs: s.item.description ? [s.item.description] : [],
					source: { label: `Open on ${s.item.source}`, href: s.item.link }
				}
			});
	}
	const unmapped = upcoming.length - mapped;
	return {
		state: 'value',
		asOf: m.observedAt,
		kept: keptNote(m.retainedAfter, m.observedAt, now),
		note: `${plural(mapped, 'show')} mapped · ${plural(unmapped, 'upcoming show')} not mapped (no confirmed venue)`,
		points,
		complete: true
	};
}

const COUNTY_PAGE_LABEL = "Open the county's report data";

export function blotterLayer(view: BlotterView, now: number): LayerRead {
	if (view.state !== 'value') return { state: view.state, ...NOT_READ };
	const byTown = new Map<string, NewsItem[]>();
	let unplaced = 0;
	for (const r of view.reports) {
		const place = placeOf(r);
		if (place.kind !== 'town') unplaced++;
		else byTown.set(place.townSlug, [...(byTown.get(place.townSlug) ?? []), r]);
	}
	const points: LayerPoint[] = [];
	// Towns in order of their latest report (the read is newest first).
	for (const [slug, reports] of byTown) {
		const town = TOWN_BY_SLUG[slug];
		const at = { lon: town.lon, lat: town.lat };
		const from = 'Marin Sheriff · placed by town (the county masks addresses)';
		points.push({
			id: `town:${slug}`,
			...at,
			title: `${town.name} · ${plural(reports.length, 'sheriff report')}, last 36 h`,
			at: null,
			heading: true,
			rank: points.length,
			townSlug: slug,
			props: { itemId: `town:${slug}`, name: town.name, count: reports.length },
			detail: {
				title: `${town.name} · ${plural(reports.length, 'sheriff report')}, last 36 h`,
				meta: [from],
				paragraphs: reports.map((r) => `${r.title} · ${formatAsOf(r.timestamp, now)}`),
				source: { label: COUNTY_PAGE_LABEL, href: reports[0].link }
			}
		});
		for (const r of reports)
			points.push({
				id: r.id,
				...at,
				title: r.title,
				at: r.timestamp,
				listOnly: true,
				rank: points.length,
				townSlug: slug,
				props: { itemId: r.id },
				detail: {
					title: r.title,
					meta: [from, town.name, formatAsOf(r.timestamp, now)],
					paragraphs: [],
					empty: 'The county publishes the hundred-block, not the address.',
					source: { label: COUNTY_PAGE_LABEL, href: r.link }
				}
			});
	}
	const reportsLine = view.count === null ? null : plural(view.count, 'report');
	const notes = [
		reportsLine ?? (view.reports.length ? plural(view.reports.length, 'report') : null),
		view.hidden === null
			? null
			: `${view.hidden} not shown (not a property or public-place report)`,
		view.capped ? 'latest 30' : null,
		unplaced ? `${unplaced} without a Marin town` : null
	].filter(Boolean);
	return {
		state: 'value',
		asOf: view.asOf,
		kept: view.kept,
		note: notes.length ? notes.join(' · ') : null,
		points,
		complete: view.count !== null
	};
}

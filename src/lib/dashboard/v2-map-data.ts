/**
 * The v2 map's data (Decision 3; Codex r3 #1, #4). The map draws only what this controller
 * established: the snapshot view (news), its own Fix It items (311) and its earthquakes,
 * each read through its part's status entry (Decision M). Nothing comes from a shared store.
 * Kept-after-failure features are marked, and the inspector says from when. Coverage counts
 * the enabled layers' drawable, town-filtered inputs and names only their sources.
 */
import { snapshotItemToNewsItem } from '$lib/api/marin/news-snapshot';
import { CATEGORY_TO_LAYER } from '$lib/stores/map';
import type { NewsSnapshotView } from '$lib/news/snapshot';
import type { MapFeatureInspectorData, MapLayer, NewsItem } from '$lib/types';
import {
	inspectorModel,
	type InspectorModel,
	type InspectorState
} from '$lib/components/map/map-inspection';
import type { OwnedLayerData } from '$lib/components/map/map-layer-switches';
import { feedCoverage } from './latest-reporting';
import { emptyWording, mapMeasured, measuredFromEntry, type Measured } from './measured';
import { formatAsOf } from './pacific-time';
import { SNAPSHOT_OBSERVATION_MAX_AGE_MS } from './source-adapters';
import {
	effectiveState,
	presentSection,
	type SectionPresentation,
	type SourceEntryState,
	type SourceStatusEntry
} from './source-status';

export type V2MapLayerKey = 'news' | '311' | 'earthquakes';
/** What the map judged each payload-timed part by: its effective state and its payload time. */
export type V2Provenance = Record<
	'311' | 'earthquakes',
	{ state: SourceEntryState; observedAt: number | null }
>;

export interface V2MapData {
	layerData: OwnedLayerData;
	earthquakes: NewsItem[];
	notes: ReadonlyMap<string, string>;
	coverage: SectionPresentation;
	/** "Nothing on the map right now" only when emptyWording authorizes every enabled layer (Codex r4 #1). */
	empty: string | null;
	layers: Record<V2MapLayerKey, Measured<unknown>['kind']>;
	loading: string[];
	/** The enabled layers' drawable news and 311 items: what the inspector and tooltip may show (Codex 9b #1, #3). */
	inspectable: NewsItem[];
	/** Every enabled layer read fresh by this owner, with a known time: only then is "nothing here" a fact (Codex 9b #2). */
	established: boolean;
	provenance: V2Provenance;
}

const drawable = (i: NewsItem) =>
	(typeof i.lat === 'number' && typeof i.lon === 'number') || Boolean(i.townSlug);
const inTown = (town: string | null) => (i: NewsItem) => !town || i.townSlug === town;

function keptNote(m: Measured<unknown>, now: number): string | null {
	if (m.kind !== 'value' || m.retainedAfter === null) return null;
	return m.observedAt === null
		? `Kept from an earlier read (time not reported) · ${m.retainedAfter}`
		: `Kept from ${formatAsOf(m.observedAt, now)} · ${m.retainedAfter}`;
}

function provenanceOf(e: SourceStatusEntry | undefined, now: number): V2Provenance['311'] {
	return e
		? { state: effectiveState(e, now), observedAt: e.observedAt }
		: { state: 'loading', observedAt: null };
}

export function v2MapData(input: {
	view: NewsSnapshotView | null;
	fixIt: NewsItem[] | null;
	earthquakes: NewsItem[];
	sources: readonly SourceStatusEntry[];
	activeLayers: Readonly<Partial<Record<MapLayer, boolean>>>;
	town: string | null;
	now: number;
}): V2MapData {
	const { view, fixIt, sources, activeLayers, town, now } = input;
	const entry = (id: string) => sources.find((e) => e.id === id);
	const newsM = measuredFromEntry(entry('part:snapshot'), view, 'News snapshot', now);
	const fixM = measuredFromEntry(entry('part:seeclickfix'), fixIt, 'Fix It Marin (311)', now);
	// The quake list is this controller's own writable ([] until its first commit): it is
	// shown only through its part's settled entry.
	const quakeM = measuredFromEntry(
		entry('part:earthquakes'),
		input.earthquakes,
		'USGS earthquakes',
		now
	);

	const stories = newsM.kind === 'value' ? newsM.value.items : [];
	const news = stories.map(snapshotItemToNewsItem);
	const threeOneOne = fixM.kind === 'value' ? fixM.value : [];
	const earthquakes = quakeM.kind === 'value' ? quakeM.value : [];

	// Retention: the whole news layer when the view was kept; else per kept feed.
	const notes = new Map<string, string>();
	const retainedNews = new Set<string>();
	const layerNote = keptNote(newsM, now);
	stories.forEach((story) => {
		const feed = entry(`news:${story.sourceId}`);
		const note =
			layerNote ??
			(feed && effectiveState(feed, now) === 'stale'
				? `Feed not updated since ${feed.observedAt === null ? 'an unreported time' : formatAsOf(feed.observedAt, now)}`
				: null);
		if (note) {
			retainedNews.add(story.id);
			notes.set(story.id, note);
		}
	});
	const fixNote = keptNote(fixM, now);
	if (fixNote) for (const i of threeOneOne) notes.set(i.id, fixNote);
	const quakeNote = keptNote(quakeM, now);
	if (quakeNote) for (const i of earthquakes) notes.set(i.id, quakeNote);

	// Coverage over what is actually enabled and drawable (Codex r3 #4). The snapshot read is
	// transport, not coverage: it counts only while loading or failing (Codex r4 #1).
	const newsOn = news.filter((i) => activeLayers[CATEGORY_TO_LAYER[i.category]] && drawable(i));
	const fixOn = activeLayers['311'] ? threeOneOne.filter(drawable) : [];
	const newsLayerOn = Object.values(CATEGORY_TO_LAYER).some((l) => l !== '311' && activeLayers[l]);
	const read = entry('part:snapshot');
	const feedIds = new Set(
		(newsM.kind === 'value' ? newsM.value.sources : [])
			.filter((src) => activeLayers[CATEGORY_TO_LAYER[src.category]])
			.map((src) => `news:${src.id}`)
	);
	const newsFeeds = sources.filter((e) => feedIds.has(e.id));
	const entries = [
		...(newsLayerOn
			? [...(read && effectiveState(read, now) !== 'ok' ? [read] : []), ...newsFeeds]
			: []),
		...(activeLayers['311'] ? sources.filter((e) => e.id === 'part:seeclickfix') : []),
		...sources.filter((e) => e.id === 'part:earthquakes')
	];
	const shownNews = newsOn.filter(inTown(town));
	const shownFix = fixOn.filter(inTown(town));
	// "Nothing on the map" needs every enabled layer's fresh, successful coverage (Codex r4 #1).
	// Each layer is judged by its own max age: news by the snapshot's, 311 and quakes by their entry's.
	const layers: { coverage: Measured<readonly unknown[]>; maxAgeMs: number | null }[] = [
		...(newsLayerOn
			? [
					{
						coverage: feedCoverage(newsM, newsFeeds, shownNews, now, {
							label: 'Map news',
							noun: 'news feed'
						}),
						maxAgeMs: SNAPSHOT_OBSERVATION_MAX_AGE_MS
					}
				]
			: []),
		...(activeLayers['311']
			? [
					{
						coverage: mapMeasured(fixM, () => shownFix),
						maxAgeMs: entry('part:seeclickfix')?.maxAgeMs ?? null
					}
				]
			: []),
		{
			coverage: mapMeasured(quakeM, () => earthquakes),
			maxAgeMs: entry('part:earthquakes')?.maxAgeMs ?? null
		}
	];
	const layerCoverage = layers.map((l) => l.coverage);
	const authorized = layers.every(
		({ coverage, maxAgeMs }) => emptyWording(coverage, 'empty', { now, maxAgeMs }) !== null
	);
	const empty = authorized ? 'Nothing on the map right now' : null;
	const presented = presentSection(
		entries,
		{
			total: newsOn.length + fixOn.length + earthquakes.length,
			matching: shownNews.length + shownFix.length + earthquakes.length
		},
		now
	);
	// Every enabled layer read fresh by this owner (the inspector's zero claims; Codex 9b #2).
	const established = layerCoverage.every(
		(c) => c.kind === 'value' && c.retainedAfter === null && c.observedAt !== null
	);
	// A kept (retained or expired) layer can't vouch that the town has nothing; a failed layer is
	// named as failing by the status line, as batch 2's contract has it.
	// Retention is judged before the town filter: an empty town view of kept news would read
	// "every feed failed" and hide that the layer is only kept (Codex 9c #1).
	const unfiltered: Measured<readonly unknown[]>[] = [
		...(newsLayerOn
			? [feedCoverage(newsM, newsFeeds, newsOn, now, { label: 'Map news', noun: 'news feed' })]
			: []),
		...(activeLayers['311'] ? [mapMeasured(fixM, () => fixOn)] : []),
		mapMeasured(quakeM, () => earthquakes)
	];
	const kept = unfiltered.some((c) => c.kind === 'value' && c.retainedAfter !== null);
	const vouched =
		presented.state === 'empty' ? authorized : presented.state !== 'no-match' || !kept;
	const coverage: SectionPresentation = vouched
		? presented
		: {
				...presented,
				state: layerCoverage.every((c) => c.kind === 'unavailable')
					? 'unavailable'
					: layerCoverage.some((c) => c.kind === 'value' && c.retainedAfter !== null)
						? 'stale'
						: 'unknown',
				asOf: null
			};

	return {
		layerData: {
			revision: 0,
			news,
			threeOneOne,
			retained: {
				news: retainedNews,
				threeOneOne: fixNote !== null,
				earthquakes: quakeNote !== null
			}
		},
		earthquakes,
		notes,
		coverage,
		empty,
		layers: { news: newsM.kind, '311': fixM.kind, earthquakes: quakeM.kind },
		inspectable: [...newsOn, ...fixOn],
		established,
		provenance: {
			'311': provenanceOf(entry('part:seeclickfix'), now),
			earthquakes: provenanceOf(entry('part:earthquakes'), now)
		},
		loading: ['part:snapshot', 'part:seeclickfix', 'part:earthquakes'].filter(
			(id) => (entry(id)?.state ?? 'loading') === 'loading'
		)
	};
}

/**
 * The map inspector over what the map vouches for. A town click with no established coverage
 * opens nothing rather than "0 stories" (the status line already says why; Codex 9b #2).
 */
export function v2Inspector(
	state: InspectorState | null,
	data: Pick<V2MapData, 'inspectable' | 'established'>,
	townName: (slug: string) => string
): InspectorModel | null {
	const model = inspectorModel(state, data.inspectable, townName);
	return model && model.mode === 'town' && model.items.length === 0 && !data.established
		? null
		: model;
}

/**
 * An open feature inspector, re-read against the current data: its kept note follows the
 * latest refresh, and a 311/quake feature no longer drawn closes (Codex 9b #4).
 */
export function v2FeatureView(
	feature: MapFeatureInspectorData | null,
	data: Pick<V2MapData, 'layerData' | 'earthquakes' | 'notes'>
): MapFeatureInspectorData | null {
	if (!feature?.itemId) return feature;
	const id = feature.itemId;
	const drawn = [...data.layerData.threeOneOne, ...data.earthquakes].some((i) => i.id === id);
	if (!drawn) return null;
	const note = data.notes.get(id);
	const { note: _old, ...rest } = feature;
	return note ? { ...rest, note } : rest;
}

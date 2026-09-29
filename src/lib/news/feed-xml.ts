/**
 * RSS 2.0 / RSS 1.0 / Atom → raw entries, identical in the browser and on the
 * server. Streaming tokenizer (htmlparser2 in XML mode), no DOM.
 *
 * Only structure is extracted here; text stays raw (XML entities decoded,
 * markup inside CDATA untouched) and dates stay strings. Normalization —
 * HTML → text, date validation, provenance — lives in normalize.ts.
 *
 * Deliberate rules:
 * - Fields come from DIRECT children of <item>/<entry>; first occurrence wins.
 * - Entries count only in their format's place: RSS 2.0 <rss><channel><item>,
 *   RSS 1.0 <rdf:RDF><item>, Atom <feed><entry>. RSS needs a <channel>.
 * - Atom <updated> is a modification time and is NEVER a publication candidate.
 * - Not well-formed (xml-well-formed.ts) → rejected before extraction, so a
 *   broken response can never replace last-good items or count as success.
 */
import { Parser } from 'htmlparser2';
import { checkWellFormed } from './xml-well-formed';

export type PublishedAtSource = 'rss:pubDate' | 'rss:dc:date' | 'atom:published';

export interface DateCandidate {
	readonly source: PublishedAtSource;
	readonly raw: string;
}

export interface RawFeedEntry {
	title: string | null;
	link: string | null;
	guid: string | null;
	description: string | null;
	content: string | null;
	/** Publication-time candidates, in priority order. */
	published: DateCandidate[];
	/** Atom <updated>. Never a publication time. */
	updated: string | null;
	/** Feed-native coordinates (georss:point or geo:lat/geo:long). */
	point: { lat: number; lon: number } | null;
}

export interface ParsedFeed {
	format: 'rss' | 'atom';
	entries: RawFeedEntry[];
}

export class FeedParseError extends Error {
	override name = 'FeedParseError';
}

type Field =
	| 'title'
	| 'link'
	| 'guid'
	| 'description'
	| 'content'
	| 'updated'
	| 'point'
	| 'lat'
	| 'lon'
	| PublishedAtSource;

const RSS_FIELDS: ReadonlyMap<string, Field> = new Map([
	['title', 'title'],
	['link', 'link'],
	['guid', 'guid'],
	['description', 'description'],
	['content:encoded', 'content'],
	['pubDate', 'rss:pubDate'],
	['dc:date', 'rss:dc:date'],
	['georss:point', 'point'],
	['geo:lat', 'lat'],
	['geo:long', 'lon']
]);

const ATOM_FIELDS: ReadonlyMap<string, Field> = new Map([
	['title', 'title'],
	['id', 'guid'],
	['summary', 'description'],
	['content', 'content'],
	['published', 'atom:published'],
	['updated', 'updated'],
	['georss:point', 'point']
]);

const PUBLISHED_ORDER: readonly PublishedAtSource[] = [
	'rss:pubDate',
	'rss:dc:date',
	'atom:published'
];

function text(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

function parsePoint(fields: Partial<Record<Field, string>>): RawFeedEntry['point'] {
	const point = text(fields.point);
	const [lat, lon] = point
		? point.split(/\s+/).map(Number)
		: [Number(text(fields.lat) ?? NaN), Number(text(fields.lon) ?? NaN)];
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
	if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
	return { lat, lon };
}

interface EntryState {
	fields: Partial<Record<Field, string>>;
	atomAlternate: string | null;
	atomFirstLink: string | null;
}

function toEntry(state: EntryState): RawFeedEntry {
	const { fields } = state;
	return {
		title: text(fields.title),
		link: text(fields.link) ?? state.atomAlternate ?? state.atomFirstLink,
		guid: text(fields.guid),
		description: text(fields.description),
		content: text(fields.content),
		published: PUBLISHED_ORDER.flatMap((source) => {
			const raw = text(fields[source]);
			return raw ? [{ source, raw }] : [];
		}),
		updated: text(fields.updated),
		point: parsePoint(fields)
	};
}

/** Element names whose children are entries, per format. */
function isEntryStart(
	format: 'rss' | 'rdf' | 'atom',
	name: string,
	path: readonly string[]
): boolean {
	if (format === 'atom') return name === 'entry' && path.length === 1;
	if (format === 'rdf') return name === 'item' && path.length === 1;
	return name === 'item' && path.length === 2 && path[1] === 'channel';
}

const ROOT_FORMATS: ReadonlyMap<string, 'rss' | 'rdf' | 'atom'> = new Map([
	['rss', 'rss'],
	['rdf:RDF', 'rdf'],
	['feed', 'atom']
]);

export function parseFeedXml(xml: string): ParsedFeed {
	// 1. Complete lexical well-formedness (xml-well-formed.ts) — nothing is
	//    extracted from a document that is not whole.
	const { root, problem } = checkWellFormed(xml);
	const rootFormat = root === null ? null : (ROOT_FORMATS.get(root) ?? null);
	if (root !== null && rootFormat === null) {
		throw new FeedParseError(`not an RSS or Atom document (root <${root}>)`);
	}
	if (problem !== null) throw new FeedParseError(problem);
	const format = rootFormat as 'rss' | 'rdf' | 'atom';

	// 2. Extraction from the now well-formed document.
	const s = {
		hasChannel: false,
		path: [] as string[],
		entry: null as EntryState | null,
		entryDepth: 0,
		field: null as Field | null,
		fieldDepth: 0,
		buffer: ''
	};
	const entries: RawFeedEntry[] = [];

	const parser = new Parser(
		{
			onopentag(name, attribs) {
				const parentPath = [...s.path];
				s.path.push(name);
				const depth = s.path.length;
				if (depth === 2 && name === 'channel') s.hasChannel = true;
				if (s.entry === null) {
					if (isEntryStart(format, name, parentPath)) {
						s.entry = { fields: {}, atomAlternate: null, atomFirstLink: null };
						s.entryDepth = depth;
					}
					return;
				}
				if (s.field !== null || depth !== s.entryDepth + 1) return;
				if (format === 'atom' && name === 'link') {
					const href = attribs.href?.trim();
					if (!href) return;
					if ((attribs.rel ?? 'alternate') === 'alternate') s.entry.atomAlternate ??= href;
					s.entry.atomFirstLink ??= href;
					return;
				}
				const field = (format === 'atom' ? ATOM_FIELDS : RSS_FIELDS).get(name);
				if (field && s.entry.fields[field] === undefined) {
					s.field = field;
					s.fieldDepth = depth;
					s.buffer = '';
				}
			},
			ontext(chunk) {
				if (s.field !== null) s.buffer += chunk;
			},
			onclosetag() {
				const depth = s.path.length;
				s.path.pop();
				if (s.entry === null) return;
				if (s.field !== null && depth === s.fieldDepth) {
					s.entry.fields[s.field] = s.buffer;
					s.field = null;
				}
				if (depth === s.entryDepth) {
					entries.push(toEntry(s.entry));
					s.entry = null;
				}
			}
		},
		{ xmlMode: true, decodeEntities: true }
	);
	parser.write(xml);
	parser.end();

	// 3. Format structure.
	if (format !== 'atom' && !s.hasChannel) throw new FeedParseError('RSS document has no <channel>');
	return { format: format === 'atom' ? 'atom' : 'rss', entries };
}

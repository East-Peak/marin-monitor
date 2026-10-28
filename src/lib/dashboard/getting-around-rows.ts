/**
 * Getting Around as StatusRows (plan-text-system.md rules 2–3; TEXT0 rev B). Pure: each part's
 * lines and rows become one row anatomy, label above body, provenance in meta. A one-source part
 * (roads, airports) gathers its time once at its foot; transit, mixed, keeps a source on every
 * row. Never two destinations in a row: a link row is one external page, a detail row's links
 * live inside its panel.
 */
import { LINKS, type GettingAroundView, type Line, type Part, type Row } from './getting-around';
import type { SourceEntryState } from './source-status';
import { detailRow, linkRow, staticRow, webHref, type StatusRow } from './status-row';

export type PartKey = 'roads' | 'transit' | 'airports';

/** A row and where it came from: an agency or airport's status line, the part's note, or a listed item. */
export interface PartItem {
	from: 'line' | 'note' | 'item';
	/** A line's evaluated state (an all-clear stands only on ok); null for items. */
	state: SourceEntryState | null;
	row: StatusRow;
}

export interface PartView {
	key: PartKey;
	title: string;
	scope: string | null;
	state: SourceEntryState | null;
	items: PartItem[];
	foot: { provenance: string | null; link: { href: string; label: string } };
}

const TITLES: Record<PartKey, { title: string; href: string; label: string }> = {
	roads: {
		title: 'Roads: Marin & the airport routes',
		href: LINKS.traffic,
		label: 'Traffic map (511)'
	},
	transit: { title: 'Transit', href: LINKS.transit, label: 'All transit alerts (511)' },
	airports: { title: 'Airports', href: LINKS.faa, label: 'FAA status' }
};
const QUIET_LEAD = '511 lists no alerts for these agencies. Check each one directly:';
const ALL_511 = { label: '511', body: 'All transit alerts on 511', href: LINKS.transit };
const CURRENT: ReadonlySet<SourceEntryState> = new Set(['ok', 'reference']);

/** A checked destination as a panel link, or nothing (a feed's URL is not trusted blindly). */
const link = (label: string, url: string | null) => {
	const href = webHref(url);
	return href ? [{ label, body: new URL(href).hostname.replace(/^www\./, ''), href }] : [];
};

/** A line's source and time; a read we can't call current names its source, never another's time. */
function lineSource(p: Part, l: Line): string | null {
	if (!l.source) return null;
	return CURRENT.has(l.state) ? (p.sources[l.source] ?? l.source) : l.source;
}

function lineRow(p: Part, l: Line): StatusRow {
	const meta = [lineSource(p, l)];
	const common = { id: l.id, label: l.label, body: l.text, bodyAttention: !CURRENT.has(l.state) };
	if (l.links.length)
		return detailRow({
			...common,
			meta,
			detail: {
				title: l.label,
				paragraphs: [QUIET_LEAD],
				meta: meta.filter((m): m is string => m !== null),
				links: l.links.flatMap((k) => link(k.label, k.url))
			}
		});
	const href = webHref(l.url);
	return href ? linkRow({ ...common, meta, href }) : staticRow({ ...common, meta });
}

function itemRow(p: Part, r: Row): StatusRow {
	const provenance = r.source ? (p.sources[r.source] ?? r.source) : null;
	const common = {
		id: r.id,
		label: r.label,
		chips: r.tags,
		tone: r.tone,
		body: r.body,
		original: r.original,
		meta: [provenance, ...r.meta]
	};
	if (r.full)
		return detailRow({
			...common,
			clamp: true,
			detail: {
				title: r.label,
				paragraphs: r.full,
				meta: [provenance, ...r.meta.map((m) => m.text)].filter((m): m is string => m !== null),
				links: [...link('This alert', r.url), ALL_511]
			}
		});
	const href = webHref(r.url);
	return href ? linkRow({ ...common, href }) : staticRow(common);
}

function partView(key: PartKey, p: Part): PartView {
	const t = TITLES[key];
	const note: PartItem[] = p.note
		? [
				{
					from: 'note',
					state: p.state,
					row: staticRow({
						id: `${key}-note`,
						body: p.note,
						bodyAttention: p.state !== null && !CURRENT.has(p.state),
						meta: p.noteMeta
					})
				}
			]
		: [];
	const label = p.link?.label ?? t.label;
	return {
		key,
		title: t.title,
		scope: p.scope,
		state: p.state,
		items: [
			...p.lines.map((l): PartItem => ({ from: 'line', state: l.state, row: lineRow(p, l) })),
			...note,
			...p.rows.map((r): PartItem => ({ from: 'item', state: null, row: itemRow(p, r) }))
		],
		foot: {
			provenance: p.meta,
			link: { href: p.link?.url ?? t.href, label: `${p.more ? `${p.more} more · ` : ''}${label} ↗` }
		}
	};
}

/** Road problems first: there is no drive-time source yet (design 2026-10-16). */
export function gettingAroundParts(view: GettingAroundView): PartView[] {
	return [
		partView('roads', view.roads),
		partView('transit', view.transit),
		partView('airports', view.airports)
	];
}

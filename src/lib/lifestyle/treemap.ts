/**
 * The month as a map: which sections get a tile, where each sits, and what each says. Pure. The
 * areas are the engine's section totals; nothing here computes anything but layout and shares.
 */
import type { Section } from './model';
import { spendingSections, type SectionShare } from './view';

/** The gap between tiles, taken from each tile's own box so the floor is measured on what shows. */
export const TILE_GAP = 2;
/** Sections under this share of spending start out in "The rest". */
const START_THRESHOLD = 3;
const TILE_PAD = { x: 4, y: 2 };

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (share: number) => (share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`);
const capitalised = (s: string) => s[0].toUpperCase() + s.slice(1);
const list = (xs: readonly string[]) =>
	xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

interface Box {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** A squarified treemap (Bruls, Huizing, van Wijk). Same input, same boxes. */
export function squarify<T extends { readonly value: number }>(
	items: readonly T[],
	width: number,
	height: number
): (T & Box)[] {
	const total = items.reduce((sum, i) => sum + i.value, 0);
	if (total <= 0) return [];
	const scale = (width * height) / total;
	const out: (T & Box)[] = [];
	let [x, y, w, h] = [0, 0, width, height];
	let row: { item: T; area: number }[] = [];

	const worst = (r: typeof row, side: number) => {
		const areas = r.map((a) => a.area);
		const sum = areas.reduce((a, b) => a + b, 0);
		return Math.max(
			(side * side * Math.max(...areas)) / (sum * sum),
			(sum * sum) / (side * side * Math.min(...areas))
		);
	};
	const flush = () => {
		const sum = row.reduce((a, b) => a + b.area, 0);
		const across = w >= h ? sum / h : sum / w;
		let along = w >= h ? y : x;
		for (const { item, area } of row) {
			const length = area / across;
			out.push(
				w >= h
					? { ...item, x, y: along, w: across, h: length }
					: { ...item, x: along, y, w: length, h: across }
			);
			along += length;
		}
		if (w >= h) [x, w] = [x + across, w - across];
		else [y, h] = [y + across, h - across];
		row = [];
	};

	for (const item of items) {
		const next = { item, area: item.value * scale };
		const side = Math.min(w, h);
		if (row.length && worst([...row, next], side) > worst(row, side)) flush();
		row.push(next);
	}
	if (row.length) flush();
	return out;
}

export type TileId = Section | 'rest';

export interface Tile extends Box {
	readonly id: TileId;
	readonly sections: readonly { readonly section: Section; readonly monthly: number }[];
	readonly value: number;
	/** Some line in it can't be read, so its area is only what's priced so far. */
	readonly partial: boolean;
	/** The section it lands on: "The rest" lands on the first of its own. */
	readonly anchor: Section;
}

export interface MonthMap {
	readonly tiles: readonly Tile[];
	/** Total spending, the map's whole area: a negative section isn't in it. */
	readonly total: number;
	/** The percentage under which a section went into "The rest". */
	readonly threshold: number;
}

type Spending = ReturnType<typeof spendingSections>[number];

function grouped(spending: readonly Spending[], total: number, threshold: number) {
	const small = spending.filter((s) => (100 * s.monthly) / total < threshold);
	// A bucket of one says nothing its own tile wouldn't.
	const bucket = small.length > 1 ? small : [];
	const tile = (id: TileId, sections: readonly Spending[]) => ({
		id,
		sections: sections.map(({ section, monthly }) => ({ section, monthly })),
		value: sections.reduce((sum, s) => sum + s.monthly, 0),
		partial: sections.some((s) => s.partial),
		anchor: sections[0].section
	});
	return [
		...spending.filter((s) => !bucket.includes(s)).map((s) => tile(s.section, [s])),
		...(bucket.length ? [tile('rest', bucket)] : [])
	].sort((a, z) => z.value - a.value);
}

/** The map of a box: the threshold starts at 3% and rises until every tile clears `floor`. */
export function planMap(
	sections: readonly SectionShare[],
	width: number,
	height: number,
	floor: number
): MonthMap {
	const spending = spendingSections(sections);
	const total = spending.reduce((sum, s) => sum + s.monthly, 0);
	let plan: MonthMap = { tiles: [], total, threshold: START_THRESHOLD };
	if (!spending.length) return plan;
	for (let threshold = START_THRESHOLD; threshold <= 100; threshold++) {
		const tiles = squarify(grouped(spending, total, threshold), width, height).map((t) => ({
			...t,
			x: t.x + TILE_GAP / 2,
			y: t.y + TILE_GAP / 2,
			w: t.w - TILE_GAP,
			h: t.h - TILE_GAP
		}));
		plan = { tiles, total, threshold };
		if (tiles.every((t) => t.w >= floor && t.h >= floor)) break;
	}
	return plan;
}

export const tileName = (id: TileId) => (id === 'rest' ? 'The rest' : capitalised(id));

/** What a tile says when it's read: its readout, and its link's accessible name. */
export function tileWords(tile: Tile, total: number) {
	const name = tileName(tile.id);
	const head = `${usd(tile.value)} a month${tile.partial ? ' so far' : ''} · ${pct(tile.value / total)} of spending`;
	const tail =
		tile.id === 'rest'
			? tile.sections.map((s) => `${capitalised(s.section)} ${usd(s.monthly)}`).join(' · ')
			: null;
	return { name, head, tail, full: `${name} · ${head}${tail ? `: ${tail}` : ''}` };
}

/** Whatever the tiles can't show: never a silent gap. Null when the whole month is on the map. */
export function mapCaption(sections: readonly SectionShare[], soFar: boolean): string | null {
	const unreadable = sections.filter((s) => s.monthly === null || (s.monthly === 0 && s.partial));
	const parts = [
		...(soFar ? ['Spending so far.'] : []),
		...sections.flatMap((s) =>
			s.monthly !== null && s.monthly < 0
				? [
						`The ${s.section} brings in ${usd(-s.monthly)} a month${s.partial ? ' so far' : ''}, not shown.`
					]
				: []
		),
		...(unreadable.length ? [`Can’t be read: ${list(unreadable.map((s) => s.section))}.`] : [])
	];
	return parts.length ? parts.join(' ') : null;
}

export interface TextMetrics {
	/** The width of a tile's label text, in px. */
	readonly measure: (text: string) => number;
	readonly lineHeight: number;
}

export type LabelFit = 'two' | 'one' | 'wrap' | 'name' | null;

/**
 * How a label fits a tile, whole or not at all: never cut mid-word. Name and amount stacked, on
 * one line, or with the name wrapped at its spaces; then the name alone (Stuart, COST2-0).
 */
export function labelFit(
	name: string,
	amount: string,
	width: number,
	height: number,
	{ measure, lineHeight }: TextMetrics
): LabelFit {
	const w = width - 2 * TILE_PAD.x;
	const h = height - 2 * TILE_PAD.y;
	const n = measure(name);
	const a = measure(amount);
	const words = name.split(' ');
	const widest = Math.max(...words.map(measure));
	if (h >= 2 * lineHeight && Math.max(n, a) <= w) return 'two';
	if (h >= lineHeight && n + 6 + a <= w) return 'one';
	if (words.length > 1 && h >= (words.length + 1) * lineHeight && Math.max(widest, a) <= w)
		return 'wrap';
	if (h >= lineHeight && n <= w) return 'name';
	return null;
}

/** Where a section lands on /cost/<town>. */
export const sectionAnchor = (section: Section) => `section-${section}`;

/** Each fill's label ink: at least 4.5:1, and the fills don't change by theme. */
export const TILE_INK = (section: Section) => (section === 'cars' ? '#ffffff' : '#030712');

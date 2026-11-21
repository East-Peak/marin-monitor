/**
 * /cost: the households side by side (COSTX1). Pure: each household's budget as its own page
 * reads it (householdPage, so its sections keep SectionShare's "so far", unknown and actual-zero
 * semantics), set out by section on one shared dollar scale.
 *
 * - Lines are never paired across households: the sheets share no concept id, so each
 *   household's lines stay under its own cell with its own labels (R1).
 * - Every bar is on one domain with a zero baseline, signed, with no minimum width (R7): never
 *   the household page's per-household `widthPct`.
 * - A row makes a comparative claim (an existing rank fact, with its own copy) only when every
 *   household's section is priced in full on in-date reads, in a snapshot that is itself in date
 *   (R2, R4).
 */
import type { Highlight } from './highlight-copy';
import { SECTIONS, type PricedLine, type Section } from './model';
import type { HouseholdPage } from './view';

export interface CompareColumn {
	/** The household's sheet id, as highlights key it. */
	readonly id: string;
	/** Null when its budget can't be read. */
	readonly page: HouseholdPage | null;
}

/**
 * value: priced in full. zero: priced in full at exactly $0. partial: some lines can't be read,
 * so the amount is only "so far". unknown: none of its lines can be read. unread: the household's
 * whole budget can't be read. absent: the household has no line in the section.
 */
export type CellState = 'value' | 'zero' | 'partial' | 'unknown' | 'unread' | 'absent';

/** A bar's two ends, as percentages of the shared domain's width. */
export interface BarSpan {
	readonly from: number;
	readonly to: number;
}

export interface CompareCell {
	readonly id: string;
	readonly state: CellState;
	/** Null when unknown, unread or absent; "so far" when partial. */
	readonly monthly: number | null;
	/** Some line is priced from a stale input. */
	readonly stale: boolean;
	/** The household's own lines in the section, largest first. */
	readonly lines: readonly PricedLine[];
	readonly bar: BarSpan | null;
}

export interface CompareRow {
	readonly section: Section;
	readonly cells: readonly CompareCell[];
	/** Every household priced in full, on in-date reads: only then may the row compare. */
	readonly comparable: boolean;
	/** An existing rank fact for the section, shown only when comparable. */
	readonly highlight: Highlight | null;
}

export interface Domain {
	readonly min: number;
	readonly max: number;
}

export interface Comparison {
	readonly domain: Domain;
	/** Where zero sits across the bar, as a percentage. */
	readonly zeroPct: number;
	readonly rows: readonly CompareRow[];
}

/** From the least to the greatest amount, zero always inside; never zero-width. */
export function sharedDomain(values: readonly (number | null)[]): Domain {
	const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
	const min = Math.min(0, ...known);
	const max = Math.max(0, ...known);
	return min === max ? { min: 0, max: 1 } : { min, max };
}

/** A bar from the zero baseline to the value; none for zero or unknown. */
export function barSpan(value: number | null, d: Domain): BarSpan | null {
	if (value === null || value === 0 || !Number.isFinite(value)) return null;
	const at = (v: number) => (100 * (v - d.min)) / (d.max - d.min);
	return { from: at(Math.min(0, value)), to: at(Math.max(0, value)) };
}

const COMPARABLE: ReadonlySet<CellState> = new Set(['value', 'zero']);

function cellOf(column: CompareColumn, section: Section): Omit<CompareCell, 'bar'> {
	const base = { id: column.id, stale: false, lines: [] as readonly PricedLine[] };
	if (!column.page) return { ...base, state: 'unread', monthly: null };
	const s = column.page.sections.find((x) => x.section === section);
	if (!s) return { ...base, state: 'absent', monthly: null };
	const stale = s.lines.some((l) => l.availability === 'stale');
	const state: CellState =
		s.monthly === null ? 'unknown' : s.partial ? 'partial' : s.monthly === 0 ? 'zero' : 'value';
	return { id: column.id, state, monthly: s.monthly, stale, lines: s.lines };
}

export function compareHouseholds(
	columns: readonly CompareColumn[],
	highlights: Readonly<Record<string, readonly Highlight[]>> | null,
	/** The whole snapshot is out of date: every line may be, so nothing is compared. */
	{ stale = false }: { stale?: boolean } = {}
): Comparison {
	const present = new Set(columns.flatMap((c) => c.page?.sections.map((s) => s.section) ?? []));
	const sections = SECTIONS.filter((s) => present.has(s));
	const raw = sections.map((section) => ({
		section,
		cells: columns.map((c) => cellOf(c, section))
	}));
	const domain = sharedDomain(raw.flatMap((r) => r.cells.map((c) => c.monthly)));
	const ranks = Object.values(highlights ?? {})
		.flat()
		.filter((h) => h.rule === 'rank');
	const peak = (r: { cells: readonly { monthly: number | null }[] }) =>
		Math.max(...r.cells.map((c) => c.monthly ?? -Infinity));
	const rows = raw
		.map(({ section, cells }): CompareRow => {
			const comparable = !stale && cells.every((c) => COMPARABLE.has(c.state) && !c.stale);
			return {
				section,
				cells: cells.map((c) => ({ ...c, bar: barSpan(c.monthly, domain) })),
				comparable,
				highlight: comparable ? (ranks.find((h) => h.key === `rank:${section}`) ?? null) : null
			};
		})
		// Largest household amount first; SECTIONS order breaks a tie (the sort is stable).
		.sort((a, z) => (peak(a) === peak(z) ? 0 : peak(z) - peak(a)));
	return { domain, zeroPct: (100 * -domain.min) / (domain.max - domain.min), rows };
}

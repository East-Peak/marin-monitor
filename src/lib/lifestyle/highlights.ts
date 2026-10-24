/**
 * The Lifestyle Index's highlights (LIFE3): three rules that pick what is
 * remarkable in a household's budget, as facts. The words are in
 * highlight-copy.ts, all in one place.
 *
 * - Comparisons set a number against its pre-assigned anchor, in that
 *   anchor's own units (Decision 5): an anchor that is not ok, or not in the
 *   template's units, suppresses the comparison; no other anchor stands in.
 * - Rank sets a section against the same section in the other households
 *   priced in full this run.
 * - Movers compare like-for-like runs only (Decision 7).
 *
 * An incomplete household has no highlights (Decision 1). A highlight whose
 * numbers rest on a persona input is marked modelled.
 */
import type { Anchor, AnchorUnits } from './anchors';
import { compareRuns, type HistoryEntry } from './history';
import {
	SECTIONS,
	type HouseholdSheet,
	type InputClass,
	type PricedBudget,
	type PricedInput,
	type PricedLine,
	type Section
} from './model';
import { sourceLink } from './view';

/** A highlight shows at its threshold, never below it. */
export const THRESHOLDS = {
	/** Break-even, in Marin median household incomes. */
	breakEvenVsMedian: 2,
	/** The main earner's wage, in teacher salaries. */
	earnerVsTeacher: 2,
	/** A year's spending, in years of a minimum-wage take-home. */
	spendingVsMinimumWage: 2,
	/** One line's year, in minimum-wage take-homes. */
	lineVsMinimumWage: 1,
	/** The leader's section, in multiples of the runner-up's. */
	rankLead: 1.5,
	/** A line's move, dollars a month either way. */
	moverMonthly: 5
} as const;

/** The most movers a household shows. */
export const MOVERS_SHOWN = 2;

/** Each comparison's anchor and the units it must be in. */
export const COMPARISONS = {
	breakEvenVsMedian: { anchor: 'medianHouseholdIncome', units: 'gross household' },
	earnerVsTeacher: { anchor: 'teacherSalary', units: 'gross individual' },
	spendingVsMinimumWage: { anchor: 'minimumWageTakeHome', units: 'net individual' },
	lineVsMinimumWage: { anchor: 'minimumWageTakeHome', units: 'net individual' }
} as const satisfies Record<string, { anchor: Anchor['id']; units: AnchorUnits }>;
type ComparisonId = keyof typeof COMPARISONS;

export interface AnchorRef {
	readonly id: Anchor['id'];
	readonly label: string;
	readonly units: AnchorUnits;
	readonly value: number;
}

interface Base {
	/** The household's sheet id: the copy names it. */
	readonly town: string;
	readonly modelled: boolean;
	/** Where the numbers come from: hosts of cited sources, our own reads by name. */
	readonly sources: readonly string[];
}
interface Compared extends Base {
	readonly anchor: AnchorRef;
	/** Per year, in the anchor's units. */
	readonly value: number;
	readonly ratio: number;
}

export type Fact =
	| (Compared & { readonly template: 'breakEvenVsMedian' })
	| (Compared & { readonly template: 'earnerVsTeacher'; readonly share: number })
	| (Compared & { readonly template: 'spendingVsMinimumWage' })
	| (Compared & {
			readonly template: 'lineVsMinimumWage';
			readonly lineId: string;
			readonly label: string;
	  })
	| (Base & {
			readonly template: 'rank';
			readonly section: Section;
			readonly monthly: number;
			/** Households priced in full this run, this one included. */
			readonly compared: number;
			readonly of: number;
			/** Null when no other household spends on the section. */
			readonly runnerUp: {
				readonly town: string;
				readonly monthly: number;
			} | null;
	  })
	| (Base & {
			readonly template: 'mover';
			readonly lineId: string;
			readonly label: string;
			readonly before: number;
			readonly after: number;
			readonly change: number;
			/** When the earlier run priced it. */
			readonly since: string;
			/** The inputs that moved (persona inputs held still, by construction). */
			readonly inputs: readonly {
				label: string;
				class: InputClass;
				before: number | null;
				after: number | null;
			}[];
	  })
	| (Base & {
			readonly template: 'moversQuiet';
			readonly since: string;
			/** Lines compared, of the lines priced now: a line not ok in either run is not compared. */
			readonly compared: number;
			readonly of: number;
	  })
	| (Base & { readonly template: 'moversNotComparable' });

export interface HighlightContext {
	readonly runId: string;
	readonly budgets: readonly PricedBudget[];
	readonly anchors: readonly Anchor[];
	/** Null when history could not be read: then nothing is said about movers. */
	readonly history: readonly HistoryEntry[] | null;
	readonly sheets: readonly HouseholdSheet[];
}

const hasPersona = (lines: readonly PricedLine[]) =>
	lines.some((l) => l.inputs.some((i) => i.class === 'persona'));

/** A cited source by its host; our own read by its name. */
function sourceName(source: string): string {
	const link = sourceLink(source);
	if (link) return link.host;
	try {
		return new URL(source.trim().split(/\s/)[0]).hostname.replace(/^www\./, '');
	} catch {
		return source;
	}
}

function sourcesOf(inputs: readonly PricedInput[]): string[] {
	return [
		...new Set(
			inputs.flatMap((i) => (i.class === 'persona' || !i.source ? [] : [sourceName(i.source)]))
		)
	];
}

const byId = (a: { id: string }, z: { id: string }) => (a.id < z.id ? -1 : a.id > z.id ? 1 : 0);

function comparisons(b: PricedBudget, sheet: HouseholdSheet, anchors: readonly Anchor[]): Fact[] {
	const anchorFor = (id: ComparisonId): Anchor | null => {
		const want = COMPARISONS[id];
		const a = anchors.find((x) => x.id === want.anchor);
		return a && a.availability === 'ok' && a.units === want.units && a.value > 0 ? a : null;
	};
	const ref = (a: Anchor): AnchorRef => ({
		id: a.id,
		label: a.label,
		units: a.units,
		value: a.value
	});
	/**
	 * A line's comparison names the line's sources and the anchor's; a whole-budget one names
	 * only the anchor's (the budget's are every line's, on the household page).
	 */
	const base = (a: Anchor, lines: readonly PricedLine[], whole = false) => ({
		town: sheet.id,
		anchor: ref(a),
		modelled: hasPersona(lines),
		sources: [
			...new Set([
				...sourcesOf(a.inputs),
				...(whole ? [] : sourcesOf(lines.flatMap((l) => l.inputs)))
			])
		]
	});
	const facts: Fact[] = [];
	const gross = b.breakEven?.gross ?? null;

	const median = anchorFor('breakEvenVsMedian');
	if (median && gross !== null && gross / median.value >= THRESHOLDS.breakEvenVsMedian) {
		facts.push({
			template: 'breakEvenVsMedian',
			...base(median, b.lines, true),
			value: gross,
			ratio: gross / median.value
		});
	}

	// The main earner's wage, an individual's, against one teacher's.
	const teacher = anchorFor('earnerVsTeacher');
	const share = Math.max(...sheet.split);
	if (teacher && gross !== null && (gross * share) / teacher.value >= THRESHOLDS.earnerVsTeacher) {
		facts.push({
			template: 'earnerVsTeacher',
			...base(teacher, b.lines, true),
			value: gross * share,
			ratio: (gross * share) / teacher.value,
			share
		});
	}

	const takeHome = anchorFor('spendingVsMinimumWage');
	const spending = b.burnMonthly * 12;
	if (takeHome && spending / takeHome.value >= THRESHOLDS.spendingVsMinimumWage) {
		facts.push({
			template: 'spendingVsMinimumWage',
			...base(takeHome, b.lines, true),
			value: spending,
			ratio: spending / takeHome.value
		});
	}

	// Housing is everyone's: the line worth naming is the biggest outside it.
	const lineAnchor = anchorFor('lineVsMinimumWage');
	const line = b.lines
		.filter((l) => l.section !== 'housing' && l.availability === 'ok' && l.monthly !== null)
		.sort((a, z) => (z.monthly as number) - (a.monthly as number) || byId(a, z))[0];
	if (
		lineAnchor &&
		line &&
		((line.monthly as number) * 12) / lineAnchor.value >= THRESHOLDS.lineVsMinimumWage
	) {
		const annual = (line.monthly as number) * 12;
		facts.push({
			template: 'lineVsMinimumWage',
			...base(lineAnchor, [line]),
			value: annual,
			ratio: annual / lineAnchor.value,
			lineId: line.id,
			label: line.label
		});
	}
	return facts;
}

/**
 * Each household's widest lead over the runner-up in a section, among the
 * households priced in full. A tie for first is no one's lead; a section with
 * a line that is not ok in any of them is not ranked.
 */
function ranks(complete: readonly PricedBudget[], sheets: readonly HouseholdSheet[]) {
	const out = new Map<string, Fact>();
	if (complete.length < 2) return out;
	const best = new Map<string, { lead: number; fact: Fact }>();
	for (const section of SECTIONS) {
		const inSection = (b: PricedBudget) => b.lines.filter((l) => l.section === section);
		if (complete.some((b) => inSection(b).some((l) => l.availability !== 'ok'))) continue;
		const spend = complete
			.map((b) => ({ b, monthly: b.sections[section] ?? 0 }))
			.sort((a, z) => z.monthly - a.monthly);
		const [first, second] = spend;
		if (first.monthly <= 0 || first.monthly === second.monthly) continue;
		const lead = second.monthly > 0 ? first.monthly / second.monthly : Infinity;
		if (lead < THRESHOLDS.rankLead) continue;
		// SECTIONS order breaks a tie between leads: the first one found stands.
		if ((best.get(first.b.town)?.lead ?? -1) >= lead) continue;
		const lines = inSection(first.b);
		best.set(first.b.town, {
			lead,
			fact: {
				template: 'rank',
				town: first.b.town,
				modelled: hasPersona(lines),
				sources: sourcesOf(lines.flatMap((l) => l.inputs)),
				section,
				monthly: first.monthly,
				compared: complete.length,
				of: sheets.length,
				runnerUp: second.monthly > 0 ? { town: second.b.town, monthly: second.monthly } : null
			}
		});
	}
	for (const [town, { fact }] of best) out.set(town, fact);
	return out;
}

function movers(
	b: PricedBudget,
	sheet: HouseholdSheet,
	runId: string,
	history: readonly HistoryEntry[]
): Fact[] {
	const base = { town: sheet.id, modelled: false, sources: [] };
	const mine = history.filter((e) => e.town === b.town);
	const at = mine.findIndex((e) => e.runId === runId);
	const after = at === -1 ? null : mine[at];
	const before = at === -1 ? null : (mine[at + 1] ?? null);
	const cmp = after ? compareRuns(before, after) : null;
	if (!after || !before || !cmp?.comparable) return [{ template: 'moversNotComparable', ...base }];

	const lineNow = new Map(b.lines.map((l) => [l.id, l]));
	const earlier = new Map(before.lines.map((l) => [l.id, l]));
	const moves = cmp.moves
		.filter((m) => Math.abs(m.change) >= THRESHOLDS.moverMonthly)
		.filter((m) => lineNow.get(m.id)?.availability === 'ok')
		.sort((a, z) => Math.abs(z.change) - Math.abs(a.change) || byId(a, z))
		.slice(0, MOVERS_SHOWN);
	if (moves.length === 0) {
		// "No line moved" is a claim about the lines compared, and says how many those were.
		const of = after.lines.length;
		return [
			{ template: 'moversQuiet', ...base, since: before.pricedAt, compared: of - cmp.unpaired, of }
		];
	}

	return moves.map((m): Fact => {
		const line = lineNow.get(m.id)!;
		const prior = earlier.get(m.id)!.inputs;
		const moved = line.inputs.filter(
			(i) => i.class !== 'persona' && prior[i.name] && prior[i.name][0] !== i.value
		);
		return {
			template: 'mover',
			town: sheet.id,
			modelled: hasPersona([line]),
			sources: sourcesOf(moved),
			lineId: m.id,
			label: line.label,
			before: m.before,
			after: m.after,
			change: m.change,
			since: before.pricedAt,
			inputs: moved.map((i) => ({
				label: i.label,
				class: i.class,
				before: prior[i.name][0],
				after: i.value
			}))
		};
	});
}

/**
 * Each household's highlights, keyed by its sheet id, in the order a surface
 * shows them: the line, the rank, the movers, then the whole-budget comparisons.
 */
export function highlightFacts(ctx: HighlightContext): Readonly<Record<string, readonly Fact[]>> {
	const shipped = ctx.budgets.filter((b) => ctx.sheets.some((s) => s.id === b.town));
	const complete = shipped.filter((b) => b.complete && b.breakEven !== null);
	const rank = ranks(complete, ctx.sheets);
	return Object.fromEntries(
		complete.map((b) => {
			const sheet = ctx.sheets.find((s) => s.id === b.town)!;
			const compared = comparisons(b, sheet, ctx.anchors);
			const line = compared.filter((f) => f.template === 'lineVsMinimumWage');
			const whole = compared.filter((f) => f.template !== 'lineVsMinimumWage');
			const r = rank.get(b.town);
			return [
				b.town,
				[
					...line,
					...(r ? [r] : []),
					...(ctx.history ? movers(b, sheet, ctx.runId, ctx.history) : []),
					...whole
				]
			];
		})
	);
}

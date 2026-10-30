/**
 * The Lifestyle Index as shown: the card's summary of one household, the
 * household page's equation and budget, and how an input reads. Pure: the
 * numbers are the engine's, never re-derived here beyond sums and shares.
 */
import { pacificDate } from '$lib/dashboard/pacific-time';
import type { Highlight } from './highlight-copy';
import type {
	Availability,
	HouseholdSheet,
	InputClass,
	PricedBudget,
	PricedInput,
	PricedLine,
	Section
} from './model';

/** The mockup's section colours, shared by the card, the page and the TV. */
export const SECTION_COLOR: Readonly<Record<Section, string>> = {
	housing: '#3b82f6',
	help: '#a855f7',
	business: '#ef4444',
	food: '#f59e0b',
	kids: '#14b8a6',
	cars: '#64748b',
	travel: '#0ea5e9',
	utilities: '#84cc16',
	health: '#ec4899',
	wellness: '#10b981',
	giving: '#eab308',
	belonging: '#f97316'
};

/** Every surface that shows a household's number carries this beside it (Decision 6). */
export const FICTION_LABEL = 'fictional household · modelled spending';

export const townSlug = (town: string) => town.toLowerCase().trim().replace(/\s+/g, '-');

export const sheetForSlug = (sheets: readonly HouseholdSheet[], slug: string) =>
	sheets.find((s) => townSlug(s.town) === slug) ?? null;

/** The default household turns over at Pacific midnight, visiting each in turn. */
export function dailySlug(slugs: readonly string[], nowMs: number): string {
	const day = Math.floor(Date.parse(`${pacificDate(nowMs)}T00:00:00Z`) / 86_400_000);
	return slugs[((day % slugs.length) + slugs.length) % slugs.length];
}

export interface SectionShare {
	readonly section: Section;
	/** Null when none of its lines could be priced: unknown, never $0. */
	readonly monthly: number | null;
	/** Of the monthly burn. */
	readonly share: number | null;
	/** Some of its lines can't be read, so `monthly` is only "so far". */
	readonly partial: boolean;
}

export interface SummaryLine {
	readonly id: string;
	readonly label: string;
	readonly monthly: number;
	readonly classes: readonly InputClass[];
	readonly availability: Availability;
}

/** One row of the card's receipt: a signature line, priced or not, never dropped. */
export interface ReceiptLine {
	readonly id: string;
	readonly label: string;
	/** Null when it can't be read. */
	readonly monthly: number | null;
	readonly availability: Availability;
	/** Only on a $0 line, which needs saying why (Stuart, COST0). */
	readonly note?: string;
}

export interface HouseholdSummary {
	readonly slug: string;
	readonly town: string;
	readonly name: string;
	readonly pricedAt: string;
	readonly burnMonthly: number;
	/** Null when the budget is incomplete: never shown then. */
	readonly breakEven: number | null;
	readonly complete: boolean;
	/** Required lines that could not be priced. */
	readonly missing: readonly string[];
	/** Lines priced from a stale input. */
	readonly stale: number;
	readonly sections: readonly SectionShare[];
	/** Kept for open tabs on the old client: a long-running TV may not have reloaded. */
	readonly top: readonly SummaryLine[];
	readonly receipt: readonly ReceiptLine[];
	readonly lineCount: number;
	/** Fewer than `lineCount`: the burn is "so far". */
	readonly pricedLines: number;
	readonly inputs: Readonly<Record<InputClass, number>>;
	/** Share of spending in lines whose inputs are all persona. */
	readonly personaOnly: number;
	/** Present only under the highlights flag; empty for an incomplete household. */
	readonly highlights?: readonly Highlight[];
}

/** While any line can't be read, every total is only what's been priced so far. */
export const pricedSoFar = (h: HouseholdSummary) => !h.complete || h.pricedLines < h.lineCount;

/** The count under a receipt: the whole budget, or how much of it is priced. */
export const lineTally = (h: HouseholdSummary) =>
	pricedSoFar(h) ? `${h.pricedLines} of ${h.lineCount} lines priced` : `${h.lineCount} lines`;

/** The card's data, as /api/data/lifestyle serves it. */
export interface LifestyleCard {
	readonly computedAt: string;
	/** The last run with every budget complete on in-date live reads. */
	readonly lastSuccessfulScrapeAt: string | null;
	readonly households: readonly HouseholdSummary[];
}

/** Where a budget line lands on /cost/<town>. */
export const lineAnchor = (id: string) => `line-${id.replaceAll('.', '-')}`;

/**
 * A stored budget as the current sheet reads it, so an old blob needs no migration: a signature
 * line it doesn't have is an unread line everywhere, and a line's note is the sheet's.
 */
function againstSheet(b: PricedBudget, sheet: HouseholdSheet): PricedBudget {
	const specs = new Map(sheet.lines.map((l) => [l.id, l]));
	const stored = new Set(b.lines.map((l) => l.id));
	const absent = sheet.lines.filter((l) => l.signature && !stored.has(l.id));
	const complete = b.complete && !absent.some((l) => l.required);
	return {
		...b,
		lines: [
			...b.lines.map((l) => (specs.has(l.id) ? { ...l, note: specs.get(l.id)?.note } : l)),
			...absent.map(
				(l): PricedLine => ({
					id: l.id,
					section: l.section,
					label: l.label,
					required: l.required,
					monthly: null,
					availability: 'unavailable',
					classes: [],
					inputs: [],
					reason: 'Not priced yet: the next weekly run reads it.'
				})
			)
		],
		complete,
		breakEven: complete ? b.breakEven : null
	};
}

/** The budgets the highlights compare: a line the card can't read counts as unread there too. */
export const budgetsAgainstSheets = (
	budgets: readonly PricedBudget[],
	sheets: readonly HouseholdSheet[]
) =>
	budgets.map((b) => {
		const sheet = sheets.find((s) => s.id === b.town);
		return sheet ? againstSheet(b, sheet) : b;
	});

/** Every section with a line, even one none of whose lines could be priced (it spends unknown). */
function sectionShares(b: PricedBudget): SectionShare[] {
	return [...new Set(b.lines.map((l) => l.section))]
		.map((section) => {
			const lines = b.lines.filter((l) => l.section === section);
			const priced = lines.some((l) => l.monthly !== null);
			const monthly = priced ? (b.sections[section] ?? 0) : null;
			return {
				section,
				monthly,
				share: monthly === null ? null : b.burnMonthly > 0 ? monthly / b.burnMonthly : 0,
				partial: lines.some((l) => l.monthly === null)
			};
		})
		.sort((a, z) => (z.monthly ?? -Infinity) - (a.monthly ?? -Infinity));
}

/** The sections a bar can draw: unknown has no width, and neither has a net-income section (a profitable business). */
export const spendingSections = (sections: readonly SectionShare[]) =>
	sections.filter(
		(s): s is SectionShare & { monthly: number; share: number } =>
			s.monthly !== null && s.share !== null && s.monthly > 0
	);

const byMonthly = (a: PricedLine, z: PricedLine) =>
	(z.monthly ?? -Infinity) - (a.monthly ?? -Infinity);

export function householdSummary(stored: PricedBudget, sheet: HouseholdSheet): HouseholdSummary {
	const b = againstSheet(stored, sheet);
	const signature = new Set(sheet.lines.filter((l) => l.signature).map((l) => l.id));
	const inputs = { live: 0, cited: 0, persona: 0 };
	for (const i of b.lines.flatMap((l) => l.inputs)) inputs[i.class]++;
	return {
		slug: townSlug(sheet.town),
		town: sheet.town,
		name: sheet.name,
		pricedAt: b.pricedAt,
		burnMonthly: b.burnMonthly,
		breakEven: b.complete ? (b.breakEven?.gross ?? null) : null,
		complete: b.complete,
		missing: b.lines.filter((l) => l.required && l.monthly === null).map((l) => l.label),
		stale: b.lines.filter((l) => l.availability === 'stale').length,
		sections: sectionShares(b),
		top: b.lines
			.filter((l) => l.monthly !== null)
			.sort(byMonthly)
			.slice(0, 3)
			.map((l) => ({
				id: l.id,
				label: l.label,
				monthly: l.monthly as number,
				classes: l.classes,
				availability: l.availability
			})),
		receipt: b.lines
			.filter((l) => signature.has(l.id))
			.sort(byMonthly)
			.map((l) => ({
				id: l.id,
				label: l.label,
				monthly: l.monthly,
				availability: l.availability,
				...(l.monthly === 0 && l.note ? { note: l.note } : {})
			})),
		lineCount: b.lines.length,
		pricedLines: b.lines.filter((l) => l.monthly !== null).length,
		inputs,
		personaOnly: b.personaShare.only
	};
}

export interface Equation {
	readonly gross: number;
	/** What comes off wages before take-home, each a positive amount. */
	readonly rows: readonly { label: string; amount: number }[];
	readonly takeHome: number;
	readonly spending: number;
	readonly afterTaxSavings: number;
	/** The earners' split of wages, e.g. "85/15". */
	readonly split: string;
}

export interface PageSection extends SectionShare {
	readonly lines: readonly PricedLine[];
	/** Bar width against the biggest section. */
	readonly widthPct: number;
}

export interface HouseholdPage {
	readonly summary: HouseholdSummary;
	readonly who: string;
	readonly savingsNote: string;
	readonly taxYear: number;
	/** Null when the budget is incomplete. */
	readonly equation: Equation | null;
	readonly sections: readonly PageSection[];
	/** The lines on the card, marked in the budget. */
	readonly signatures: readonly string[];
	readonly marketTracker: PricedInput;
	readonly notModelled: readonly string[];
}

export function householdPage(stored: PricedBudget, sheet: HouseholdSheet): HouseholdPage {
	const b = againstSheet(stored, sheet);
	const summary = householdSummary(b, sheet);
	const be = b.complete ? b.breakEven : null;
	let equation: Equation | null = null;
	if (be) {
		const t = be.taxes;
		const deferrals = t.gross - t.agi;
		equation = {
			gross: be.gross,
			rows: [
				{ label: 'Federal income tax', amount: t.federal.tax },
				{ label: 'California income tax', amount: t.california.tax },
				{
					label: 'Social Security + Medicare',
					amount: t.payroll.socialSecurity + t.payroll.medicare
				},
				{ label: 'California SDI', amount: t.payroll.sdi },
				...(deferrals > 0 ? [{ label: '401(k) deferrals, pre-tax', amount: deferrals }] : [])
			],
			takeHome: t.takeHome,
			spending: b.burnMonthly * 12,
			afterTaxSavings: sheet.afterTaxSavings,
			split: sheet.split.map((s) => Math.round(s * 100)).join('/')
		};
	}
	const shares = sectionShares(b);
	const biggest = Math.max(...shares.map((s) => s.monthly ?? 0), 0);
	return {
		summary,
		who: sheet.who,
		savingsNote: sheet.savingsNote,
		taxYear: b.taxYear,
		equation,
		sections: shares.map((s) => ({
			...s,
			widthPct: biggest > 0 ? Math.max(0, (100 * (s.monthly ?? 0)) / biggest) : 0,
			lines: b.lines.filter((l) => l.section === s.section).sort(byMonthly)
		})),
		signatures: summary.receipt.map((l) => l.id),
		marketTracker: b.marketTracker,
		notModelled: sheet.notModelled
	};
}

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

/** The numbers written in a label, each with whether it is written as a percentage. */
const numbersIn = (label: string) =>
	[...label.matchAll(/\d[\d,]*(?:\.\d+)?(%?)/g)].map((m) => ({
		n: Number(m[0].replace(/[,%]/g, '')),
		pct: m[1] === '%'
	}));
const same = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a));

/**
 * An input's label, and its value unless the label already states it: as itself, as a
 * fraction written as a percentage with "%" (0.02 → "2%"), or as a down payment's complement (0.8 → "20% down").
 */
export function formatInput(i: Pick<PricedInput, 'label' | 'class' | 'value'>): string {
	if (i.value === null) return i.label;
	const v = i.value;
	const down = /\bdown\b/i.test(i.label);
	const stated = numbersIn(i.label).some(
		({ n, pct }) => same(n, v) || (pct && (same(n, v * 100) || (down && same(n, (1 - v) * 100))))
	);
	return stated ? i.label : `${i.label} · ${NUMBER.format(v)}`;
}

/** A cited source is "<https URL> (<period; scope>)": linked by its host. Anything else is text. */
export function sourceLink(
	source: string
): { href: string; host: string; detail: string | null } | null {
	const m = /^(https:\/\/\S+)(?:\s+\((.*)\))?$/.exec(source.trim());
	if (!m) return null;
	try {
		const host = new URL(m[1]).hostname.replace(/^www\./, '');
		return { href: m[1], host, detail: m[2] ?? null };
	} catch {
		return null;
	}
}

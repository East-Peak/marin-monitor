/**
 * The Lifestyle Index as shown: the card's summary of one household, the
 * household page's equation and budget, and how an input reads. Pure: the
 * numbers are the engine's, never re-derived here beyond sums and shares.
 */
import { pacificDate } from '$lib/dashboard/pacific-time';
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
	readonly monthly: number;
	/** Of the monthly burn. */
	readonly share: number;
}

export interface SummaryLine {
	readonly id: string;
	readonly label: string;
	readonly monthly: number;
	readonly classes: readonly InputClass[];
	readonly availability: Availability;
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
	readonly top: readonly SummaryLine[];
	readonly inputs: Readonly<Record<InputClass, number>>;
	/** Share of spending in lines whose inputs are all persona. */
	readonly personaOnly: number;
}

/** The card's data, as /api/data/lifestyle serves it. */
export interface LifestyleCard {
	readonly computedAt: string;
	/** The last run with every budget complete on in-date live reads. */
	readonly lastSuccessfulScrapeAt: string | null;
	readonly households: readonly HouseholdSummary[];
}

/** Every section with a line, even one none of whose lines could be priced (it spends 0). */
function sectionShares(b: PricedBudget): SectionShare[] {
	return [...new Set(b.lines.map((l) => l.section))]
		.map((section) => {
			const monthly = b.sections[section] ?? 0;
			return { section, monthly, share: b.burnMonthly > 0 ? monthly / b.burnMonthly : 0 };
		})
		.sort((a, z) => z.monthly - a.monthly);
}

const byMonthly = (a: PricedLine, z: PricedLine) =>
	(z.monthly ?? -Infinity) - (a.monthly ?? -Infinity);

export function householdSummary(b: PricedBudget, sheet: HouseholdSheet): HouseholdSummary {
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
	readonly marketTracker: PricedInput;
	readonly notModelled: readonly string[];
}

export function householdPage(b: PricedBudget, sheet: HouseholdSheet): HouseholdPage {
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
	const biggest = Math.max(...shares.map((s) => s.monthly), 0);
	return {
		summary,
		who: sheet.who,
		savingsNote: sheet.savingsNote,
		taxYear: b.taxYear,
		equation,
		sections: shares.map((s) => ({
			...s,
			widthPct: biggest > 0 ? Math.max(0, (100 * s.monthly) / biggest) : 0,
			lines: b.lines.filter((l) => l.section === s.section).sort(byMonthly)
		})),
		marketTracker: b.marketTracker,
		notModelled: sheet.notModelled
	};
}

const NUMBER = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

/** The numbers written in a label ("$1,800/mo", "+0.121%", "20% down" → 1800, 0.121, 20). */
const numbersIn = (label: string) =>
	(label.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, '')));

/**
 * An input's label, and its value unless the label already states it: as itself, as a
 * percentage (0.02 → "2%"), or as its complement (0.8 → "20% down").
 */
export function formatInput(i: Pick<PricedInput, 'label' | 'class' | 'value'>): string {
	if (i.value === null) return i.label;
	const v = i.value;
	const forms = [v, v * 100, ...(v > 0 && v < 1 ? [(1 - v) * 100] : [])];
	const stated = numbersIn(i.label).some((n) =>
		forms.some((f) => Math.abs(n - f) < 1e-9 * Math.max(1, n))
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

/**
 * A named source's ALL-CAPS headlines, shown as sentences (plan-text-system.md rule 4). Pure and
 * cautious: only text that is entirely capitals, only from a source listed here, and any token it
 * can't place returns the original whole. Matching keys, dedupe and the detail keep the original;
 * this is for the row a reader scans.
 */

interface SourceCase {
	/** Names kept as names, longest first so "San Rafael Transit Center" wins over "San Rafael". */
	phrases: readonly string[];
	/** Acronyms and identifiers kept in capitals. */
	keep: ReadonlySet<string>;
	/** Ordinary words it may lower; any other word keeps the whole original (Codex 1a #1). */
	words: ReadonlySet<string>;
}

/** The plain words of transit notices, base forms; inflections are found by `known`. */
const NOTICE_WORDS = new Set(
	(
		'a about across additional advisory after all along also an and any are around arrival as at ' +
		'available be been before begin below between bicycle bike board boarding both bridge bus but buy by ' +
		'cancel cancellation change close closure community connection construction continue customer ' +
		'daily day delay depart departure detour disruption do due during each early effective end ' +
		'entrance evening event expansion expect extra fare ferry few flood following for from game gate ' +
		'go high holiday hour if in information into is it its lane last late leave limited line lot ' +
		'maintenance make may meeting modified morning move new next night nighttime no normal not notice ' +
		'now of off on only open or other our out over overnight park parking passenger plan platform please ' +
		'reduce regular relocate remain reopen repair reroute resume ride rider road run sail sailing ' +
		'schedule service shuttle some special start station stop storm study suspend suspension take ' +
		'temporary temporarily terminal than that the their this through ticket tide to today tomorrow ' +
		'toward trip until update upcoming use via wait weather week weekday weekend while will with work'
	)
		.toUpperCase()
		.split(' ')
);

const GOLDEN_GATE: SourceCase = {
	phrases: [
		'Manzanita Park & Ride',
		'San Rafael Transit Center',
		'Larkspur Ferry Terminal',
		'Golden Gate Transit',
		'Golden Gate Ferry',
		'Golden Gate Bridge',
		'Larkspur Ferry',
		'Sausalito Ferry',
		'Tiburon Ferry',
		'Ferry Building',
		'Transit Center',
		'Marin Transit',
		'Park & Ride',
		'Civic Center',
		'Angel Island',
		'Corte Madera',
		'Mill Valley',
		'Golden Gate',
		'San Francisco',
		'San Rafael',
		'Santa Rosa',
		'Marin City',
		'Larkspur',
		'Sausalito',
		'Tiburon',
		'Petaluma',
		'Novato',
		'Sonoma',
		'Marin'
	].sort((a, b) => b.length - a.length),
	keep: new Set([
		'SMART',
		'BART',
		'ADA',
		'SF',
		'US',
		'NB',
		'SB',
		'EB',
		'WB',
		'AM',
		'PM',
		'GGFERRY'
	]),
	words: NOTICE_WORDS
};

/** A known word, or an inflection of one: STOPS, DELAYED, CLOSED, CANCELLED, REROUTED, SAILINGS. */
function known(word: string, words: ReadonlySet<string>): boolean {
	if (words.has(word)) return true;
	for (const suffix of ['S', 'ES', 'D', 'ED', 'ING', 'LY']) {
		if (!word.endsWith(suffix)) continue;
		const stem = word.slice(0, -suffix.length);
		if (words.has(stem) || words.has(stem + 'E')) return true;
		// A doubled consonant before the ending: CANCELLED → CANCEL.
		if (stem.length > 2 && stem.at(-1) === stem.at(-2) && words.has(stem.slice(0, -1))) return true;
	}
	return false;
}

const SOURCES: Readonly<Record<string, SourceCase>> = { 'goldengate.org': GOLDEN_GATE };

const MONTHS = new Set(
	[
		'JANUARY',
		'FEBRUARY',
		'MARCH',
		'APRIL',
		'MAY',
		'JUNE',
		'JULY',
		'AUGUST',
		'SEPTEMBER',
		'OCTOBER',
		'NOVEMBER',
		'DECEMBER'
	].flatMap((m) => [m, m.slice(0, 3), ...(m === 'SEPTEMBER' ? ['SEPT'] : [])])
);
/** A date or figure as written: "10/19-10/23", "11/5", "6", "7:30". */
const NUMERIC = /^[\d/:.-]+$/;
/** A route identifier: "101X". */
const ROUTE_ID = /^\d+[A-Z]$/;
const HELD = /\uE000(\d+)\uE000/g;

const capital = (word: string) => word.charAt(0) + word.slice(1).toLowerCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function sourceSentenceCase(text: string, source: string): string {
	const rules = SOURCES[source];
	if (!rules || /[a-z]/.test(text) || !/[A-Z]/.test(text)) return text;

	const held: string[] = [];
	let out = text;
	for (const p of rules.phrases) {
		out = out.replace(
			new RegExp(`(?<![A-Z])${escape(p.toUpperCase())}(?![A-Z])`, 'g'),
			() => `\uE000${held.push(p) - 1}\uE000`
		);
	}

	const words = out.split(/(\s+)/);
	const core = (w: string) => w.replace(/^[^A-Z0-9#]+|[^A-Z0-9]+$/g, '');
	let first = -1;
	for (let i = 0; i < words.length; i += 2) {
		const w = words[i];
		const c = core(w);
		if (!c || w.includes('\uE000')) {
			if (first < 0 && w.includes('\uE000')) first = -2; // a name leads: already capitalised
			continue;
		}
		const next = core(words[i + 2] ?? '');
		let shown: string;
		if (NUMERIC.test(c) || ROUTE_ID.test(c) || rules.keep.has(c)) shown = w;
		else if (/^[A-Z]$/.test(c) && c !== 'A' && c !== 'I') shown = w;
		else if (MONTHS.has(c) && NUMERIC.test(next)) shown = capital(w);
		else if ((c === 'ROUTE' || c === 'ROUTES') && (NUMERIC.test(next) || ROUTE_ID.test(next)))
			shown = capital(w);
		else if (/^[A-Z]+$/.test(c) && (c === 'ROUTE' || c === 'ROUTES' || known(c, rules.words)))
			shown = w.toLowerCase();
		else return text; // a token it can't place: an unlisted name, acronym or code
		words[i] = shown;
		if (first === -1 && /[A-Za-z]/.test(c)) first = i;
	}
	if (first >= 0)
		words[first] = words[first].replace(
			/^([^A-Za-z]*)([a-z])/,
			(_, lead: string, ch: string) => lead + ch.toUpperCase()
		);
	return words.join('').replace(HELD, (_, n: string) => held[Number(n)]);
}

/** goldengate.org prefixes headlines with "ALERT"; rows drop it (Stuart, 2026-10-28). */
export function dropAlertPrefix(headline: string): string {
	return headline.replace(/^ALERT(?::\s*|\s+)(?=\S)/, '');
}

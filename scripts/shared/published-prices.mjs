// @ts-check
/**
 * Parsers for the Cost sheets' published series (COSTDATA-1). Each reads the
 * publisher's own document and returns exactly what the sheet prices, with the
 * source's own period or end date; anything it cannot vouch for throws, so the
 * producer writes nothing and the last good read ages honestly.
 */

const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/** @param {number} year @param {number} month 1-12 */
const monthEnd = (year, month) => new Date(Date.UTC(year, month, 0)).toISOString();

// ── USDA Cost of Food (Low-Cost, Moderate-Cost and Liberal plans) ───────────

/** The monthly report for `month` (1-12) of `year`. */
export function usdaReportUrl(/** @type {number} */ year, /** @type {number} */ month) {
	const mon = MONTHS[month - 1].slice(0, 3);
	return `https://www.fna.usda.gov/sites/default/files/resource-files/CostofFood${mon}${year}LowModLib.pdf`;
}

/** The sheets' ids for the table's rows: [group heading, age band]. */
const USDA_ROWS = /** @type {const} */ ({
	'usda.liberal.c6to8': ['Child', '6-8'],
	'usda.liberal.c9to11': ['Child', '9-11'],
	'usda.liberal.f12to13': ['Female', '12-13'],
	'usda.liberal.f19to50': ['Female', '19-50'],
	'usda.liberal.f51to70': ['Female', '51-70'],
	'usda.liberal.m12to13': ['Male', '12-13'],
	'usda.liberal.m14to18': ['Male', '14-18'],
	'usda.liberal.m19to50': ['Male', '19-50'],
	'usda.liberal.m51to70': ['Male', '51-70']
});

/**
 * The Liberal plan's monthly cost per age-sex group, from `pdftotext -layout`
 * of the report. Each row has six dollar columns: low, moderate and liberal,
 * weekly then monthly; the liberal monthly is the sixth.
 * @param {string} text
 * @returns {{ period: string, periodEnd: string, values: Record<string, number> }}
 */
export function parseUsdaCostOfFood(text) {
	const title = /U\.S\. Average,\s+([A-Z][a-z]+)\s+(\d{4})/.exec(text);
	const month = title ? MONTHS.indexOf(title[1]) + 1 : 0;
	if (!title || month === 0)
		throw new Error('USDA report has no "U.S. Average, <Month> <Year>" title');
	const year = Number(title[2]);

	/** @type {Record<string, string[]>} */
	const groups = {};
	let group = '';
	for (const line of text.split('\n')) {
		const heading = /^\s*(Child|Female|Male):\s*$/.exec(line);
		if (heading) {
			group = heading[1];
			continue;
		}
		const row = /^\s*(\d+(?:-\d+)?\+?) years?\s+(.*)$/.exec(line);
		if (row && group) groups[`${group} ${row[1]}`] = row[2].match(/\$[\d,]+\.\d\d/g) ?? [];
	}
	/** @type {Record<string, number>} */
	const values = {};
	for (const [id, [g, band]] of Object.entries(USDA_ROWS)) {
		const cells = groups[`${g} ${band}`];
		if (!cells) throw new Error(`USDA report has no ${g} ${band} row`);
		if (cells.length !== 6)
			throw new Error(`USDA ${g} ${band} row has ${cells.length} of 6 columns`);
		values[id] = Number(cells[5].replace(/[$,]/g, ''));
	}
	return { period: `${title[1]} ${year}`, periodEnd: monthEnd(year, month), values };
}

// ── PG&E Schedule EV2 ───────────────────────────────────────────────────────

export const PGE_EV2_URL =
	'https://www.pge.com/tariffs/assets/pdf/tariffbook/ELEC_SCHEDS_EV2%20(Sch).pdf';

/**
 * The Winter row of EV2's total bundled energy rates (the sheets price the
 * winter rate, not "the rate in effect", which steps every June and October),
 * and the effective date printed on that sheet.
 * @param {string} text `pdftotext -layout` of the schedule
 * @returns {{ effective: string, values: Record<string, number> }}
 */
export function parsePgeEv2(text) {
	const start = text.indexOf('TOTAL BUNDLED RATES');
	if (start < 0) throw new Error('EV2 schedule has no TOTAL BUNDLED RATES table');
	const sheet = text.slice(start);
	const winter = /Winter Usage\s+\$(\d\.\d{5})[^$\n]*\$(\d\.\d{5})[^$\n]*\$(\d\.\d{5})/.exec(sheet);
	if (!winter) throw new Error('EV2 total bundled rates have no Winter Usage row');
	const effective = /Effective\s+([A-Z][a-z]+) (\d{1,2}), (\d{4})/.exec(sheet);
	const month = effective ? MONTHS.indexOf(effective[1]) + 1 : 0;
	if (!effective || month === 0) throw new Error('EV2 rates sheet has no effective date');
	const pad = (/** @type {number|string} */ n) => String(n).padStart(2, '0');
	return {
		effective: `${effective[3]}-${pad(month)}-${pad(effective[2])}`,
		values: { 'pge.ev2a.peak': Number(winter[1]), 'pge.ev2a.offPeak': Number(winter[3]) }
	};
}

// ── Range Rover Sport lease ─────────────────────────────────────────────────

export const RANGE_ROVER_URL =
	'https://www.rangerover.com/en-us/current-offers/range-rover-sport-offers.html';
/** What Ross's sheet prices: this trim, this term. */
const RANGE_ROVER_TRIM = 'Range Rover Sport P360 SE';
const RANGE_ROVER_MONTHS = 24;

/** @param {string} html */
const pageText = (html) =>
	html
		.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;|&#160;/g, ' ')
		.replace(/&#39;|&rsquo;/g, '’')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ');

/** @param {string} s */
const dollars = (s) => Number(s.replace(/[$,]/g, ''));

/**
 * The lease offer, every part from the one offer and its own disclosure: the
 * headline's monthly, term and due at signing must agree with the
 * disclosure's, and the due at signing must be the sum of its stated parts.
 * @param {string} html
 * @returns {{ trim: string, monthly: number, months: number, dueAtSigning: number, region: 'US', validUntil: string }}
 */
export function parseRangeRoverOffer(html) {
	const text = pageText(html);
	const head =
		/(\d{4} Range Rover Sport [A-Z0-9]+ [A-Z]+) Price From \$[\d,]+\*? LEASE FOR (\$[\d,]+) PER MONTH FOR (\d+) MONTHS\*? (\$[\d,]+) CASH DUE AT SIGNING/.exec(
			text
		);
	if (!head) throw new Error('Range Rover offer headline not found');
	const [, trim, monthlyText, monthsText, dueText] = head;
	if (!trim.endsWith(RANGE_ROVER_TRIM)) throw new Error(`Range Rover offer trim is ${trim}`);
	const months = Number(monthsText);
	if (months !== RANGE_ROVER_MONTHS) throw new Error(`Range Rover offer term is ${months} months`);

	const terms =
		/with (\d+)-month lease is based on[\s\S]*?Customer must take new vehicle delivery from retailer stock by (\d{2})\/(\d{2})\/(\d{4})/.exec(
			text
		);
	if (!terms) throw new Error('Range Rover offer disclosure has no end date');
	if (Number(terms[1]) !== months)
		throw new Error('Range Rover offer term disagrees with its disclosure');
	const disclosure = terms[0];

	const parts =
		/(\$[\d,]+) due at signing includes (\$[\d,]+) down payment, (\$[\d,]+) security deposit, (\$[\d,]+) acquisition fee and first month/.exec(
			disclosure
		);
	if (!parts) throw new Error('Range Rover offer disclosure has no due at signing breakdown');
	const monthly = dollars(monthlyText);
	const dueAtSigning = dollars(dueText);
	const sum = dollars(parts[2]) + dollars(parts[3]) + dollars(parts[4]) + monthly;
	if (dollars(parts[1]) !== dueAtSigning || sum !== dueAtSigning) {
		throw new Error('Range Rover offer due at signing disagrees with its parts');
	}
	if (!/U\.S\. residency restrictions apply/.test(disclosure)) {
		throw new Error('Range Rover offer is not a US offer');
	}
	return {
		trim,
		monthly,
		months,
		dueAtSigning,
		region: 'US',
		validUntil: `${terms[4]}-${terms[2]}-${terms[3]}`
	};
}

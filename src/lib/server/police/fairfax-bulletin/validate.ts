/**
 * Deterministic checks on one extraction (spec Decision 2). They resist
 * fabrication and misreads; they cannot prove completeness, so page
 * occupancy is deliberately not checked (blank pages and continuation-only
 * pages are legal).
 */
import { daysBetween, isoDate, parseUsDate } from './dates';
import { bulletinExtractionSchema, type ExtractionIncident } from './schema';

export const MAX_INCIDENTS_PER_PAGE = 60;
const MAX_RANGE_DAYS = 10;

export interface ValidIncident extends ExtractionIncident {
	/** From the incident-number prefix; whether it is the report or occurrence date is unconfirmed. */
	reportedDate: string;
}

export interface ValidBulletin {
	range: { start: string; end: string };
	incidents: ValidIncident[];
}

export type Validation = { ok: true; bulletin: ValidBulletin } | { ok: false; errors: string[] };

interface ValidationContext {
	pageCount: number;
	/** The WP document title; compared to the header range only when it parses. */
	wpTitle?: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const TITLE_RANGE =
	/\b([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*thru\s*(?:([a-z]{3})[a-z]*\.?\s+)?(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i;

/** "Press log Sep 9th thru15th, 2026" → ISO range; null when it does not parse. */
export function parseTitleRange(title: string): { start: string; end: string } | null {
	const match = TITLE_RANGE.exec(title);
	if (!match) return null;
	const startMonth = MONTHS.indexOf(match[1].toLowerCase()) + 1;
	const endMonth = match[3] ? MONTHS.indexOf(match[3].toLowerCase()) + 1 : startMonth;
	if (startMonth === 0 || endMonth === 0) return null;
	const endYear = +match[5];
	const startYear = startMonth > endMonth ? endYear - 1 : endYear;
	const start = isoDate(startYear, startMonth, +match[2]);
	const end = isoDate(endYear, endMonth, +match[4]);
	return start && end ? { start, end } : null;
}

function headerRange(rangeStart: string, rangeEnd: string, errors: string[]) {
	const start = parseUsDate(rangeStart);
	const end = parseUsDate(rangeEnd);
	const span = start && end ? daysBetween(start, end) : NaN;
	if (!start || !end || !(span >= 0 && span <= MAX_RANGE_DAYS)) {
		errors.push(`unusable header range ${rangeStart} - ${rangeEnd}`);
		return null;
	}
	return { start, end };
}

function incidentErrors(
	incident: ExtractionIncident,
	range: { start: string; end: string } | null,
	pageCount: number
): { reportedDate: string | null; errors: string[] } {
	const { incidentNo, time, callType, disposition, startPage, endPage } = incident;
	const errors: string[] = [];
	let reportedDate: string | null = null;
	if (!/^\d{10}$/.test(incidentNo)) {
		errors.push(`${incidentNo}: incident number is not 10 digits`);
	} else {
		reportedDate = isoDate(
			2000 + +incidentNo.slice(0, 2),
			+incidentNo.slice(2, 4),
			+incidentNo.slice(4, 6)
		);
		if (!reportedDate) errors.push(`${incidentNo}: invalid date in incident number`);
		else if (range && (reportedDate < range.start || reportedDate > range.end)) {
			errors.push(`${incidentNo}: ${reportedDate} is outside ${range.start} - ${range.end}`);
		}
	}
	if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.push(`${incidentNo}: bad time ${time}`);
	if (!callType.trim()) errors.push(`${incidentNo}: missing call type`);
	if (!disposition.trim()) errors.push(`${incidentNo}: missing disposition`);
	if (!(startPage >= 1 && startPage <= endPage && endPage <= pageCount)) {
		errors.push(`${incidentNo}: page refs ${startPage}-${endPage} outside 1-${pageCount}`);
	}
	return { reportedDate, errors };
}

export function validateExtraction(input: unknown, ctx: ValidationContext): Validation {
	const parsed = bulletinExtractionSchema.safeParse(input);
	if (!parsed.success) {
		return {
			ok: false,
			errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
		};
	}
	const { rangeStart, rangeEnd, incidents } = parsed.data;
	const errors: string[] = [];
	const range = headerRange(rangeStart, rangeEnd, errors);

	const title = ctx.wpTitle ? parseTitleRange(ctx.wpTitle) : null;
	if (range && title && (title.start !== range.start || title.end !== range.end)) {
		errors.push(`header range ${range.start} - ${range.end} contradicts WP title "${ctx.wpTitle}"`);
	}
	if (incidents.length === 0) errors.push('no incidents');

	const valid: ValidIncident[] = [];
	const perPage = new Map<number, number>();
	incidents.forEach((incident, index) => {
		const checked = incidentErrors(incident, range, ctx.pageCount);
		errors.push(...checked.errors);
		const previous = incidents[index - 1]?.incidentNo;
		if (previous === incident.incidentNo) errors.push(`duplicate incident ${incident.incidentNo}`);
		else if (previous !== undefined && previous > incident.incidentNo) {
			errors.push(`incidents not ascending at ${incident.incidentNo} (after ${previous})`);
		}
		perPage.set(incident.startPage, (perPage.get(incident.startPage) ?? 0) + 1);
		if (checked.reportedDate) valid.push({ ...incident, reportedDate: checked.reportedDate });
	});
	for (const [page, count] of perPage) {
		if (count > MAX_INCIDENTS_PER_PAGE) errors.push(`page ${page} has ${count} incidents`);
	}

	if (errors.length > 0 || !range) return { ok: false, errors };
	return { ok: true, bulletin: { range, incidents: valid } };
}

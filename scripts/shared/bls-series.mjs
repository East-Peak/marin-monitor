// @ts-check
/**
 * The BLS series behind the Grocery panel's lead (COSTDATA-2): CPI-U food at
 * home, San Francisco area, not seasonally adjusted. It is an index, never
 * dollars. The public v1 API needs no key. The parser keeps only what BLS
 * published: a month it printed as "-" is a gap with BLS's own reason, never
 * a value, and the series' own periods decide its frequency, which is never
 * assumed.
 */

export const BLS_SERIES_ID = 'CUURS49BSAF11';
export const BLS_URL = 'https://api.bls.gov/publicAPI/v1/timeseries/data/';
export const BLS_SOURCE_URL = `https://data.bls.gov/timeseries/${BLS_SERIES_ID}`;

/**
 * A month is published about 45 days after it ends, so a monthly series is
 * stale once its newest month ended 75 days ago (health's policy says the same).
 */
export const BLS_MAX_AGE_DAYS = 75;

const MONTH_NAMES = [
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

/** The years the request covers: this one and the three before it (v1 allows ten). */
export function blsRequestBody(/** @type {Date} */ now) {
	const year = now.getUTCFullYear();
	return { seriesid: [BLS_SERIES_ID], startyear: String(year - 3), endyear: String(year) };
}

/** @param {string} period YYYY-MM */
const monthIndex = (period) => Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1;

/**
 * @param {any} json BLS's v1 response
 * @returns {{
 *   seriesId: string,
 *   frequency: 'monthly',
 *   maxAgeDays: number,
 *   period: string,
 *   periodEnd: string,
 *   observations: { period: string, value: number }[],
 *   gaps: { period: string, reason: string }[]
 * }}
 */
export function parseBlsSeries(json) {
	if (json?.status !== 'REQUEST_SUCCEEDED') {
		const why = Array.isArray(json?.message) ? json.message.join('; ') : '';
		throw new Error(`BLS request ${json?.status ?? 'returned nothing'}${why ? `: ${why}` : ''}`);
	}
	const series = json.Results?.series?.[0];
	if (series?.seriesID !== BLS_SERIES_ID)
		throw new Error(`BLS answered with series ${series?.seriesID}, not ${BLS_SERIES_ID}`);

	/** @type {Map<string, number>} */
	const values = new Map();
	/** @type {Map<string, string>} */
	const gaps = new Map();
	for (const row of Array.isArray(series.data) ? series.data : []) {
		// M13 is the annual average: not a month, never an observation.
		const m = /^M(0[1-9]|1[0-2])$/.exec(String(row.period));
		if (!m || !/^\d{4}$/.test(String(row.year))) continue;
		const period = `${row.year}-${m[1]}`;
		if (values.has(period) || gaps.has(period)) throw new Error(`BLS gave ${period} twice`);
		if (row.value === '-') {
			const note = (Array.isArray(row.footnotes) ? row.footnotes : []).find(
				(/** @type {any} */ f) => typeof f?.text === 'string' && f.text
			);
			gaps.set(period, note ? note.text : 'BLS published no value');
			continue;
		}
		const value = Number(row.value);
		if (typeof row.value !== 'string' || !Number.isFinite(value) || value <= 0)
			throw new Error(`BLS value for ${period} is not an index: ${JSON.stringify(row.value)}`);
		values.set(period, value);
	}
	if (values.size === 0) throw new Error('BLS response has no observation');

	const observations = [...values]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([period, value]) => ({ period, value }));

	// The frequency is the series' own: the commonest step between published months.
	const published = [...values.keys(), ...gaps.keys()].map(monthIndex).sort((a, b) => a - b);
	/** @type {Map<number, number>} */
	const steps = new Map();
	for (let i = 1; i < published.length; i++) {
		const step = published[i] - published[i - 1];
		steps.set(step, (steps.get(step) ?? 0) + 1);
	}
	const [commonest] = [...steps].sort((a, b) => b[1] - a[1])[0] ?? [];
	if (commonest !== 1)
		throw new Error('BLS series is not monthly (its published months are not consecutive)');

	const newest = observations[observations.length - 1].period;
	const year = Number(newest.slice(0, 4));
	const month = Number(newest.slice(5, 7));
	return {
		seriesId: BLS_SERIES_ID,
		frequency: 'monthly',
		maxAgeDays: BLS_MAX_AGE_DAYS,
		period: `${MONTH_NAMES[month - 1]} ${year}`,
		periodEnd: new Date(Date.UTC(year, month, 0)).toISOString(),
		observations,
		gaps: [...gaps]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([period, reason]) => ({ period, reason }))
	};
}

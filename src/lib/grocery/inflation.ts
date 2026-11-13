/**
 * SF-area grocery inflation (COSTDATA-2): a view over the BLS blob written by
 * scripts/sync-bls-food-at-home.mjs. Every figure keeps its own reference
 * month. The 12-month change compares the same month a year earlier, never
 * twelve observations back; a month BLS did not publish is a gap with its
 * reason, never a value. An index is not dollars and never enters a household.
 */

export interface InflationObservation {
	period: string;
	label: string;
	/** Null: BLS published no value this month. */
	value: number | null;
	reason?: string;
}

interface InflationBase {
	seriesId: string;
	url: string;
	frequency: 'monthly';
}

export type GroceryInflation =
	| {
			status: 'ok';
			seriesId: string;
			url: string;
			frequency: 'monthly';
			checkedAt: string;
			observations: InflationObservation[];
			/** The newest month whose same month a year earlier exists. */
			lead: { period: string; label: string; pct: number; against: string };
			latest: {
				period: string;
				label: string;
				value: number;
				monthPct: number | null;
				monthLabel: string | null;
			};
			/** The latest month's own 12-month change, or why there is none. */
			latestYoy: { label: string; pct: number | null; reason: string | null };
	  }
	| ({
			status: 'stale';
			reason: string;
			lastGood: { period: string; checkedAt: string };
	  } & Partial<InflationBase>)
	| { status: 'unavailable'; reason: string };

const DAY_MS = 86_400_000;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PERIOD = /^(\d{4})-(0[1-9]|1[0-2])$/;

const label = (period: string) => `${MON[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
const shift = (period: string, months: number) => {
	const t = Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1 + months;
	return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const rec = (v: unknown): Record<string, unknown> | null =>
	typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const unavailable = (reason: string): GroceryInflation => ({ status: 'unavailable', reason });

export function groceryInflation(raw: unknown, now: Date): GroceryInflation {
	const c = rec(rec(raw)?.current);
	if (!c) return unavailable('no BLS read yet');
	// The sync's last attempt failed: whatever figures sit beside the marker are not current.
	const failure = rec(c.failure);
	if (failure) {
		const why = typeof failure.reason === 'string' ? failure.reason : 'no reason given';
		return unavailable(`the last BLS sync failed: ${why}`);
	}
	const values = new Map<string, number>();
	for (const o of Array.isArray(c.observations) ? c.observations : []) {
		const r = rec(o);
		if (
			!r ||
			typeof r.period !== 'string' ||
			!PERIOD.test(r.period) ||
			typeof r.value !== 'number' ||
			!Number.isFinite(r.value) ||
			r.value <= 0 ||
			values.has(r.period)
		)
			return unavailable('the BLS read is malformed');
		values.set(r.period, r.value);
	}
	if (values.size === 0) return unavailable('the BLS read has no observation');
	const reasons = new Map<string, string>();
	for (const g of Array.isArray(c.gaps) ? c.gaps : []) {
		const r = rec(g);
		if (r && typeof r.period === 'string' && typeof r.reason === 'string')
			reasons.set(r.period, r.reason);
	}
	const periods = [...values.keys()].sort();
	const newest = periods[periods.length - 1];
	const checkedAt = typeof c.lastSuccessfulScrapeAt === 'string' ? c.lastSuccessfulScrapeAt : null;
	const periodEnd = typeof c.periodEnd === 'string' ? Date.parse(c.periodEnd) : NaN;
	const maxAgeDays = typeof c.maxAgeDays === 'number' && c.maxAgeDays > 0 ? c.maxAgeDays : 75;
	if (checkedAt === null || !Number.isFinite(periodEnd) || typeof c.seriesId !== 'string')
		return unavailable('the BLS read has no period or check time');
	if (now.getTime() - periodEnd > maxAgeDays * DAY_MS) {
		return {
			status: 'stale',
			reason: `newest month ${label(newest)} is older than ${maxAgeDays} days`,
			lastGood: { period: label(newest), checkedAt },
			seriesId: c.seriesId,
			url: typeof c.url === 'string' ? c.url : '',
			frequency: 'monthly'
		};
	}

	const yoy = (p: string) => {
		const then = values.get(shift(p, -12));
		const v = values.get(p);
		return v !== undefined && then !== undefined ? (v / then - 1) * 100 : null;
	};
	const leadPeriod = [...periods].reverse().find((p) => yoy(p) !== null);
	if (!leadPeriod) return unavailable('no month has a same month a year earlier');

	// Every month from the first to the last, so a gap is drawn as a gap.
	const observations: InflationObservation[] = [];
	for (let p = periods[0]; p <= newest; p = shift(p, 1)) {
		const value = values.get(p);
		observations.push(
			value !== undefined
				? { period: p, label: label(p), value }
				: {
						period: p,
						label: label(p),
						value: null,
						reason: reasons.get(p) ?? 'BLS published no value'
					}
		);
	}

	const before = shift(newest, -1);
	const monthAgo = values.get(before);
	const newestYoy = yoy(newest);
	const yearAgo = shift(newest, -12);
	return {
		status: 'ok',
		seriesId: c.seriesId,
		url: typeof c.url === 'string' ? c.url : '',
		frequency: 'monthly',
		checkedAt,
		observations,
		lead: {
			period: leadPeriod,
			label: label(leadPeriod),
			pct: yoy(leadPeriod)!,
			against: label(shift(leadPeriod, -12))
		},
		latest: {
			period: newest,
			label: label(newest),
			value: values.get(newest)!,
			monthPct: monthAgo === undefined ? null : (values.get(newest)! / monthAgo - 1) * 100,
			monthLabel: monthAgo === undefined ? null : label(before)
		},
		latestYoy: {
			label: label(newest),
			pct: newestYoy,
			reason:
				newestYoy !== null
					? null
					: `BLS published no ${label(yearAgo)}${reasons.has(yearAgo) ? `: ${reasons.get(yearAgo)}` : ''}`
		}
	};
}

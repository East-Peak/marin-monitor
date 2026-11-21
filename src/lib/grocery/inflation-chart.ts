/**
 * The dashboard's CPI tile as a chart (COSTX1): a typed adapter over the BLS view that keeps
 * every month, a month BLS did not publish kept as a point with its reason (R10). It is never
 * skipped, interpolated or read as zero, and an index is never dollars.
 */
import type { ReadoutStop } from '$lib/dashboard/chart-readout';
import type { GroceryInflation } from './inflation';

type Ok = GroceryInflation & { status: 'ok' };

export interface InflationPoint {
	readonly period: string;
	readonly label: string;
	/** The month's own time: its first day at noon UTC. */
	readonly at: number;
	/** Null: BLS published no value this month. */
	readonly value: number | null;
	readonly reason: string | null;
}

export interface InflationChart {
	/** The newest published 12-month change, with the two months it spans (R5). */
	readonly headline: { readonly text: string; readonly span: string };
	/** Why the newest month has no 12-month change of its own; null when it heads the tile. */
	readonly newestNote: string | null;
	/** The newest month against the month before, labelled with both; null without one (R6). */
	readonly month: { readonly text: string; readonly label: string } | null;
	readonly points: readonly InflationPoint[];
	readonly gaps: readonly InflationPoint[];
}

const pct = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}%`;

/** "Sep → Oct 2026" inside one year, "Dec 2025 → Jan 2026" across two. */
export function monthSpan(from: string, to: string): string {
	const [month, year] = from.split(' ');
	return year === to.split(' ')[1] ? `${month} → ${to}` : `${from} → ${to}`;
}

export function inflationChart(v: Ok): InflationChart {
	const points = v.observations.map(
		(o): InflationPoint => ({
			period: o.period,
			label: o.label,
			at: Date.parse(`${o.period}-01T12:00:00Z`),
			value: o.value,
			reason: o.value === null ? (o.reason ?? 'BLS published no value') : null
		})
	);
	const { latest, latestYoy, lead } = v;
	return {
		headline: { text: pct(lead.pct), span: monthSpan(lead.against, lead.label) },
		newestNote:
			latestYoy.pct === null
				? `${latest.label} index ${latest.value.toFixed(1)}: its 12-month change isn’t published.${latestYoy.reason ? ` ${latestYoy.reason}.` : ''}`
				: null,
		month:
			latest.monthPct === null || latest.monthLabel === null
				? null
				: {
						text: pct(latest.monthPct),
						label: `${monthSpan(latest.monthLabel, latest.label)}, not seasonally adjusted`
					},
		points,
		gaps: points.filter((p) => p.value === null)
	};
}

/** A stop per month; a missing month is a stop of its own, said as missing with its reason. */
export function inflationStops(
	points: readonly InflationPoint[],
	y: (value: number) => number
): ReadoutStop[] {
	return points.map((p) =>
		p.value === null
			? {
					at: p.at,
					y: null,
					words: { lead: '', figure: 'Missing', tail: `${p.label} · ${p.reason}` }
				}
			: {
					at: p.at,
					y: y(p.value),
					words: { lead: '', figure: p.value.toFixed(1), tail: `${p.label} · index` }
				}
	);
}

/** Published months with no published neighbour: a line can't draw them, so they get a dot. */
export const isolated = (points: readonly InflationPoint[]) =>
	points.filter(
		(p, i) => p.value !== null && points[i - 1]?.value == null && points[i + 1]?.value == null
	);

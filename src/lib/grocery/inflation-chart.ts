/**
 * The index chart's geometry, pure: one slot per month from the first to the
 * last, a separate run each side of a month BLS did not publish (a gap is
 * drawn as a gap and never bridged), and a scale labelled in index points.
 */
import type { InflationObservation } from './inflation';

const MARGIN = { top: 12, right: 12, bottom: 22, left: 30 };

export interface InflationChart {
	width: number;
	height: number;
	/** One slot per month, gap months included. */
	months: number;
	plot: { left: number; right: number; top: number; bottom: number };
	x: (index: number) => number;
	y: (value: number) => number;
	runs: { line: string; area: string }[];
	gaps: { index: number; x: number; label: string; reason: string }[];
	yTicks: { y: number; label: string }[];
	/** January of each year, where the axis names a year. */
	xTicks: { x: number; label: string; index: number }[];
	last: { index: number; x: number; y: number } | null;
}

const nice = (n: number, up: boolean, step: number) =>
	(up ? Math.ceil(n / step) : Math.floor(n / step)) * step;

export function inflationChart(
	observations: readonly InflationObservation[],
	{ width, height }: { width: number; height: number }
): InflationChart {
	const plot = {
		left: MARGIN.left,
		right: width - MARGIN.right,
		top: MARGIN.top,
		bottom: height - MARGIN.bottom
	};
	const values = observations.flatMap((o) => (o.value === null ? [] : [o.value]));
	const step = 5;
	const lo = nice(Math.min(...values), false, step);
	const hi = nice(Math.max(...values), true, step);
	const n = observations.length;
	const x = (i: number) => plot.left + (n <= 1 ? 0 : (i / (n - 1)) * (plot.right - plot.left));
	const y = (v: number) => plot.top + ((hi - v) / (hi - lo || 1)) * (plot.bottom - plot.top);

	const runs: InflationChart['runs'] = [];
	let cur: number[] = [];
	const flush = () => {
		if (cur.length) {
			const pts = cur.map(
				(i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(observations[i].value!).toFixed(1)}`
			);
			const line = pts.join('');
			runs.push({
				line,
				area: `${line}L${x(cur[cur.length - 1]).toFixed(1)},${plot.bottom}L${x(cur[0]).toFixed(1)},${plot.bottom}Z`
			});
		}
		cur = [];
	};
	observations.forEach((o, i) => (o.value === null ? flush() : cur.push(i)));
	flush();

	const tickStep = Math.max(step, Math.ceil((hi - lo) / 3 / step) * step);
	const ticks: number[] = [];
	for (let v = lo; v <= hi; v += tickStep) ticks.push(v);
	const lastIndex = observations
		.map((o) => o.value)
		.reduce<number>((a, v, i) => (v === null ? a : i), -1);
	return {
		width,
		height,
		months: n,
		plot,
		x,
		y,
		runs,
		gaps: observations.flatMap((o, i) =>
			o.value === null ? [{ index: i, x: x(i), label: o.label, reason: o.reason ?? '' }] : []
		),
		yTicks: ticks.map((v) => ({ y: y(v), label: String(v) })),
		xTicks: observations.flatMap((o, i) =>
			o.period.endsWith('-01') ? [{ x: x(i), label: o.label.replace(/^Jan /, ''), index: i }] : []
		),
		last:
			lastIndex < 0
				? null
				: { index: lastIndex, x: x(lastIndex), y: y(observations[lastIndex].value!) }
	};
}

/** The month under a pointer at `px`: always a real slot, never beyond the ends. */
export function nearestMonth(chart: InflationChart, px: number): number {
	const last = chart.months - 1;
	if (last <= 0) return 0;
	const i = Math.round(((px - chart.plot.left) / (chart.plot.right - chart.plot.left)) * last);
	return Math.max(0, Math.min(last, i));
}

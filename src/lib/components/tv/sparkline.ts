import { scaleLinear } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';

export interface TvSparkline {
	linePath: string;
	areaPath: string;
	w: number;
	h: number;
}

/**
 * Build a compact sparkline that stays visible for flat series and single-point histories.
 * Single values are duplicated so the UI still shows a trend stub instead of disappearing.
 */
export function buildTvSparkline(
	values: Array<number | null | undefined>,
	svgW: number,
	svgH: number
): TvSparkline | null {
	const clean = values.filter((value): value is number => Number.isFinite(value));
	if (clean.length === 0) return null;

	const points = clean.length === 1 ? [clean[0], clean[0]] : clean;

	let min = Math.min(...points);
	let max = Math.max(...points);

	if (min === max) {
		const pad = Math.abs(min) > 0 ? Math.abs(min) * 0.05 : 1;
		min -= pad;
		max += pad;
	} else {
		const pad = (max - min) * 0.08;
		min -= pad;
		max += pad;
	}

	const x = scaleLinear()
		.domain([0, points.length - 1])
		.range([1, svgW - 1]);
	const y = scaleLinear()
		.domain([min, max])
		.range([svgH - 1, 1]);

	const linePath = line<number>()
		.x((_, i) => x(i))
		.y((d) => y(d))
		.curve(curveMonotoneX)(points);

	const areaPath = area<number>()
		.x((_, i) => x(i))
		.y0(svgH - 1)
		.y1((d) => y(d))
		.curve(curveMonotoneX)(points);

	if (!linePath || !areaPath) return null;

	return {
		linePath,
		areaPath,
		w: svgW,
		h: svgH
	};
}

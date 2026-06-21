/**
 * Shared chart utility — extracted from duplicated D3 panel code.
 *
 * Pure TypeScript: takes data + dimensions + config, returns computed SVG
 * path strings, scale functions, axis labels, and dot positions. No DOM
 * manipulation — panels use the output to render their own SVGs.
 */

import { scaleLinear } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';

interface ChartDataPoint {
	value: number;
	label?: string;
}

interface ChartMargins {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export interface ChartConfig {
	width: number;
	height: number;
	margins?: ChartMargins;
	accentColor: string;
	data: ChartDataPoint[];
}

interface ChartDot {
	x: number;
	y: number;
	value: number;
}

interface ChartAxisLabel {
	index: number;
	x: number;
	label: string;
}

export interface ChartPaths {
	linePath: string;
	areaPath: string;
	dots: ChartDot[];
	yMin: number;
	yMax: number;
	xScale: (index: number) => number;
	yScale: (value: number) => number;
	axisLabels: {
		x: ChartAxisLabel[];
	};
}

const DEFAULT_MARGINS: ChartMargins = { top: 12, right: 10, bottom: 24, left: 44 };

/**
 * Build computed chart geometry from data points + dimensions.
 *
 * Returns SVG path strings (line + filled area), dot positions, scale
 * functions, and axis label positions. Mirrors the pattern used across
 * all 9 dashboard panels (scaleLinear, curveMonotoneX, 2% y-padding).
 *
 * Returns null when there are fewer than 2 data points.
 */
export function buildChart(config: ChartConfig): ChartPaths | null {
	const { width, height, data } = config;
	if (data.length < 2) return null;

	const margins = config.margins ?? DEFAULT_MARGINS;
	const innerW = width - margins.left - margins.right;
	const innerH = height - margins.top - margins.bottom;

	// --- Scales -----------------------------------------------------------

	const values = data.map((d) => d.value);
	const rawMin = Math.min(...values);
	const rawMax = Math.max(...values);

	let yMin: number;
	let yMax: number;

	if (rawMin === rawMax) {
		// Flat line: add symmetric padding so the scale is non-degenerate
		const pad = Math.abs(rawMin) > 0 ? Math.abs(rawMin) * 0.05 : 1;
		yMin = rawMin - pad;
		yMax = rawMax + pad;
	} else {
		// 2% padding around data range. For all-positive data this matches
		// the original panel pattern (min * 0.98 / max * 1.02). For negative
		// values we use absolute range padding to always expand outward.
		const range = rawMax - rawMin;
		yMin = rawMin - range * 0.02;
		yMax = rawMax + range * 0.02;
	}

	const xScale = scaleLinear()
		.domain([0, data.length - 1])
		.range([0, innerW]);

	const yScale = scaleLinear().domain([yMin, yMax]).range([innerH, 0]);

	// --- SVG paths --------------------------------------------------------

	const lineGen = line<ChartDataPoint>()
		.x((_d, i) => xScale(i))
		.y((d) => yScale(d.value))
		.curve(curveMonotoneX);

	const areaGen = area<ChartDataPoint>()
		.x((_d, i) => xScale(i))
		.y0(innerH)
		.y1((d) => yScale(d.value))
		.curve(curveMonotoneX);

	const linePath = lineGen(data);
	const areaPath = areaGen(data);

	if (!linePath || !areaPath) return null;

	// --- Dots -------------------------------------------------------------

	const dots: ChartDot[] = data.map((d, i) => ({
		x: xScale(i),
		y: yScale(d.value),
		value: d.value
	}));

	// --- Axis labels ------------------------------------------------------

	const labelIndices = [0, Math.floor(data.length / 2), data.length - 1];
	const xLabels: ChartAxisLabel[] = labelIndices.map((idx) => ({
		index: idx,
		x: xScale(idx),
		label: data[idx].label ?? ''
	}));

	return {
		linePath,
		areaPath,
		dots,
		yMin,
		yMax,
		xScale,
		yScale,
		axisLabels: { x: xLabels }
	};
}

<script lang="ts">
	import type { PlotScale, ReadoutStop } from '$lib/dashboard/chart-readout';
	import { clockTime } from '$lib/dashboard/chart-readout';
	import type { HourColumn } from '$lib/dashboard/hour-columns';
	import ChartReadout from './ChartReadout.svelte';

	/**
	 * Weather tile C's one grid, charts 1 and 4: an hour column each, with the temperature line
	 * through the columns' centres, so a column's number and the line can't disagree. Observed is
	 * solid, the forecast lighter and dotted, and an empty column breaks the line.
	 */
	let { cols, label, resetKey }: { cols: readonly HourColumn[]; label: string; resetKey: string } =
		$props();

	const H = 3_600_000;
	const COL_MIN = 38;
	const TOP = 8;
	const LINE_H = 60;
	const HEIGHT = TOP + LINE_H + 62;

	let measured = $state(0);
	const width = $derived(measured || cols.length * 44);
	const colW = $derived(width / cols.length);
	const xOf = (i: number) => colW * (i + 0.5);

	const temps = $derived(cols.flatMap((c) => (c.f === null ? [] : [c.f])));
	const lo = $derived(Math.min(...temps) - 1);
	const hi = $derived(Math.max(...temps) + 1);
	const yOf = (f: number) => TOP + LINE_H * (1 - (f - lo) / (hi - lo));

	const nowIndex = $derived(cols.findIndex((c) => c.isNow));
	const plot = $derived<PlotScale>({
		domain: [cols[0].at - H / 2, cols[cols.length - 1].at + H / 2],
		left: 0,
		right: width,
		width
	});
	const stops = $derived<ReadoutStop[]>(
		cols.map((c) => ({
			at: c.at,
			y: c.f === null ? null : yOf(c.f) / HEIGHT,
			words: c.words,
			spoken: c.spoken,
			from: c.from,
			to: c.to
		}))
	);
</script>

<ChartReadout
	{resetKey}
	{label}
	{stops}
	{plot}
	start={nowIndex}
	color="#f59e0b"
	scrollable
	minWidth={cols.length * COL_MIN}
>
	<div bind:clientWidth={measured}>
		<svg
			data-chart="hours"
			data-text-role="meta"
			viewBox="0 0 {width} {HEIGHT}"
			style:height="{HEIGHT}px"
			aria-hidden="true"
		>
			<rect class="now" x={xOf(nowIndex) - colW / 2} y="0" width={colW} height={HEIGHT} rx="4" />
			{#each cols as c, i (c.at)}
				{@const next = cols[i + 1]}
				{#if next && c.f !== null && next.f !== null}
					<line
						class:forecast={c.kind !== 'observed' || next.kind !== 'observed'}
						data-segment
						x1={xOf(i)}
						y1={yOf(c.f)}
						x2={xOf(i + 1)}
						y2={yOf(next.f)}
					/>
				{/if}
				{#if c.f !== null && c.kind === 'observed'}
					<circle cx={xOf(i)} cy={yOf(c.f)} r="2" />
				{/if}
				<text
					class:here={c.isNow}
					x={xOf(i)}
					y={TOP + LINE_H + 18}
					text-anchor="middle"
					data-col-time>{c.isNow ? 'Now' : clockTime(c.at)}</text
				>
				<text class="temp" x={xOf(i)} y={TOP + LINE_H + 37} text-anchor="middle" data-col-temp
					>{c.f === null ? '—' : `${c.f}°`}</text
				>
				{#if c.kind === 'forecast' && c.f !== null}
					<text x={xOf(i)} y={TOP + LINE_H + 54} text-anchor="middle" data-col-pop
						>{c.pop === null ? '—' : `${c.pop}%`}</text
					>
				{/if}
			{/each}
		</svg>
	</div>
</ChartReadout>

<style>
	svg {
		display: block;
		width: 100%;
		overflow: visible;
	}
	text {
		fill: var(--text-muted);
		font-size: 12px;
	}
	text.here,
	text.temp {
		fill: var(--text-primary);
	}
	text.temp {
		font-weight: 600;
	}
	.now {
		fill: var(--text-primary);
		fill-opacity: 0.06;
	}
	line {
		stroke: #f59e0b;
		stroke-width: 2;
	}
	line.forecast {
		stroke-opacity: 0.55;
		stroke-dasharray: 2 4;
		stroke-linecap: round;
	}
	circle {
		fill: #f59e0b;
	}
</style>

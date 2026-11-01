<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		nearestPoint,
		pixelAtTime,
		timeAtPixel,
		wordsText,
		type PlotScale,
		type ReadoutStop
	} from '$lib/dashboard/chart-readout';

	/**
	 * CHARTREAD1's one readout, around any chart: a rule, a dot and a label, by mouse, touch or
	 * keyboard. The label sits above the chart, over the card's own heading, so it never moves the
	 * page and never covers the reading it describes.
	 */
	let {
		label,
		stops,
		plot,
		start,
		color = 'var(--text-primary)',
		scrollable = false,
		minWidth,
		resetKey,
		onpick,
		children
	}: {
		/** The chart's name for a screen reader. */
		label: string;
		stops: readonly ReadoutStop[];
		plot: PlotScale;
		/** Where the keys start (the latest point, or now); the last stop otherwise. */
		start?: number;
		color?: string;
		/** The chart scrolls sideways inside its card, so a swipe scrolls and only a tap reads. */
		scrollable?: boolean;
		minWidth?: number;
		/** Changes with a refresh or a town switch: a readout clears, even if the words match. */
		resetKey?: string;
		/** Optional: a stop opens somewhere on click, a tap on the point, or Enter. */
		onpick?: (stop: ReadoutStop) => void;
		children: Snippet;
	} = $props();

	const id = $props.id();
	/** A move this far decides a touch: sideways reads, past it vertically scrolls. */
	const SIDEWAYS_PX = 6;
	const VERTICAL_PX = 10;

	let host = $state<HTMLElement>();
	let surface = $state<HTMLElement>();
	let scroller = $state<HTMLElement>();
	let active = $state(-1);
	let pinned = $state(false);
	let width = $state(0);
	let height = $state(0);
	let hostW = $state(0);
	let labelW = $state(0);
	let scrollX = $state(0);

	const stop = $derived(active >= 0 ? stops[active] : null);
	const ruleX = $derived(stop && width ? pixelAtTime(stop.at, plot, width) : 0);
	const labelX = $derived(Math.max(0, Math.min(hostW - labelW, ruleX - scrollX - labelW / 2)));
	const first = $derived(start ?? stops.length - 1);

	function clear() {
		active = -1;
		pinned = false;
	}

	/** Same words at the same times are the same data: the clock's tick is not a refresh. */
	const content = $derived(
		`${resetKey}|${stops.map((s) => `${s.at}:${wordsText(s.words)}`).join('|')}`
	);
	let seen = '';
	$effect(() => {
		if (seen && seen !== content) clear();
		seen = content;
	});

	/**
	 * On a chart wider than its card, start with now a quarter of the way in and the past behind
	 * it. Again whenever the layout changes (the first measure comes before layout settles), but
	 * not on the clock's tick, which would undo the reader's own scrolling.
	 */
	let placedFor = '';
	$effect(() => {
		const layout = `${hostW}:${width}`;
		if (!scrollable || !scroller || !hostW || !width || layout === placedFor) return;
		placedFor = layout;
		const stop = stops[first];
		if (stop) scroller.scrollLeft = Math.max(0, pixelAtTime(stop.at, plot, width) - hostW / 4);
	});

	function show(index: number) {
		active = index;
		if (!scrollable || !scroller || !width) return;
		const x = pixelAtTime(stops[index].at, plot, width);
		const seenX = x - scroller.scrollLeft;
		if (seenX < 24 || seenX > scroller.clientWidth - 24)
			scroller.scrollLeft = x - scroller.clientWidth / 2;
	}

	function stopAt(e: PointerEvent): number {
		const box = surface!.getBoundingClientRect();
		const near = nearestPoint(stops, timeAtPixel(e.clientX - box.left, plot, box.width));
		return near ? stops.indexOf(near) : -1;
	}

	let press: { x: number; y: number; mode: 'pending' | 'drag'; moved: boolean } | null = null;

	function pick(index: number) {
		const s = stops[index];
		if (onpick && s && s.from === undefined) onpick(s);
	}
	function pointerdown(e: PointerEvent) {
		press = { x: e.clientX, y: e.clientY, mode: 'pending', moved: false };
	}
	function pointermove(e: PointerEvent) {
		if (e.pointerType === 'mouse') {
			show(stopAt(e));
			if (press && Math.abs(e.clientX - press.x) > SIDEWAYS_PX) press.moved = true;
			return;
		}
		if (!press) return;
		const dx = Math.abs(e.clientX - press.x);
		const dy = Math.abs(e.clientY - press.y);
		if (press.mode === 'pending') {
			if (scrollable ? dx > VERTICAL_PX || dy > VERTICAL_PX : dy > VERTICAL_PX && dx <= dy) {
				press = null;
				if (!pinned) clear();
				return;
			}
			if (dx > SIDEWAYS_PX && !scrollable) {
				press.mode = 'drag';
				press.moved = true;
				surface!.setPointerCapture(e.pointerId);
			}
		}
		if (press.mode === 'drag') show(stopAt(e));
	}
	function pointerup(e: PointerEvent) {
		const held = press;
		press = null;
		if (!held) return;
		const index = stopAt(e);
		if (e.pointerType !== 'mouse') {
			show(index);
			pinned = true;
		}
		if (!held.moved) pick(index);
	}
	function pointercancel() {
		press = null;
		clear();
	}
	function pointerleave(e: PointerEvent) {
		if (e.pointerType === 'mouse' && !host?.matches(':focus-visible')) clear();
	}
	function focus() {
		if (active < 0 && host?.matches(':focus-visible')) show(first);
	}
	function keydown(e: KeyboardEvent) {
		const last = stops.length - 1;
		const from = active < 0 ? first : active;
		if (e.key === 'Escape') return clear();
		if (e.key === 'Enter') return pick(from);
		const to = {
			ArrowLeft: from - 1,
			ArrowRight: from + 1,
			Home: 0,
			End: last
		}[e.key];
		if (to === undefined) return;
		e.preventDefault();
		show(Math.max(0, Math.min(last, to)));
	}

	$effect(() => {
		if (!pinned) return;
		const away = (e: PointerEvent) => {
			if (!host?.contains(e.target as Node)) clear();
		};
		document.addEventListener('pointerdown', away);
		return () => document.removeEventListener('pointerdown', away);
	});
</script>

<div
	bind:this={host}
	bind:clientWidth={hostW}
	class="host"
	role="slider"
	tabindex="0"
	aria-label={label}
	aria-valuemin={0}
	aria-valuemax={stops.length - 1}
	aria-valuenow={active < 0 ? first : active}
	aria-valuetext={stop ? (stop.spoken ?? wordsText(stop.words)) : label}
	aria-describedby="{id}-hint"
	onfocus={focus}
	onblur={clear}
	onkeydown={keydown}
>
	<span id="{id}-hint" class="hint" data-text-role="meta">Arrow keys read each value</span>
	{#if stop}
		<div class="label" data-readout bind:clientWidth={labelW} style:left="{labelX}px">
			{#if stop.words.lead}<span data-text-role="meta">{`${stop.words.lead} `}</span>{/if}<span
				data-text-role="value">{stop.words.figure}</span
			>{#if stop.words.tail}<span data-text-role="meta">{` · ${stop.words.tail}`}</span>{/if}
		</div>
	{/if}
	<div
		bind:this={scroller}
		class:scroll={scrollable}
		onscroll={(e) => (scrollX = e.currentTarget.scrollLeft)}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={surface}
			bind:clientWidth={width}
			bind:clientHeight={height}
			class="plot"
			class:pans={scrollable}
			data-readout-plot
			style:min-width={minWidth ? `${minWidth}px` : undefined}
			onpointerdown={pointerdown}
			onpointermove={pointermove}
			onpointerup={pointerup}
			onpointercancel={pointercancel}
			onpointerleave={pointerleave}
		>
			{@render children()}
			{#if stop}
				<i class="rule" class:gap={stop.from !== undefined} data-readout-rule style:left="{ruleX}px"
				></i>
				{#if stop.y !== null}
					<i
						class="dot"
						data-readout-dot
						style:left="{ruleX}px"
						style:top="{stop.y * height}px"
						style:background={color}
					></i>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.host {
		position: relative;
		min-width: 0;
		border-radius: 4px;
	}
	.host:focus {
		outline: none;
	}
	.host:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.hint {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.scroll {
		overflow-x: auto;
		overscroll-behavior-x: contain;
	}
	.plot {
		position: relative;
		touch-action: pan-y;
		cursor: crosshair;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}
	.plot.pans {
		touch-action: pan-x pan-y;
	}
	.label {
		position: absolute;
		z-index: 3;
		bottom: 100%;
		box-sizing: border-box;
		width: max-content;
		max-width: 100%;
		margin-bottom: 2px;
		padding: 1px 6px;
		border: 1px solid var(--border-light);
		border-radius: 4px;
		background: var(--bg);
		color: var(--text-muted);
		pointer-events: none;
	}
	.label [data-text-role='value'] {
		color: var(--text-primary);
	}
	.rule,
	.dot {
		position: absolute;
		pointer-events: none;
	}
	.rule {
		top: 0;
		bottom: 0;
		width: 0;
		border-left: 1px solid var(--text-muted);
	}
	.rule.gap {
		border-left-style: dashed;
	}
	.dot {
		width: 9px;
		height: 9px;
		margin: -4.5px 0 0 -4.5px;
		border: 2px solid var(--bg);
		border-radius: 50%;
		box-sizing: border-box;
	}
</style>

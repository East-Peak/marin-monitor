<!-- An input's provenance as a chip: L live, C cited, P persona (Decision 1). -->
<script lang="ts">
	import type { InputClass } from '$lib/lifestyle/model';

	let {
		classes,
		quiet = false
	}: {
		classes: readonly InputClass[];
		/** A budget line's column: smaller and dimmer, the same classes (COSTX1 R3). */
		quiet?: boolean;
	} = $props();

	const CHIP: Record<InputClass, { letter: string; title: string; word: string }> = {
		live: { letter: 'L', title: 'Live: our own read', word: 'live' },
		cited: { letter: 'C', title: 'Cited: a published figure', word: 'cited' },
		persona: { letter: 'P', title: 'Persona: an assumption about this household', word: 'persona' }
	};
	/** Said in words to a screen reader: a letter's title is a tooltip, which touch never shows. */
	const spoken = $derived(
		classes.length ? `Inputs: ${classes.map((c) => CHIP[c].word).join(', ')}` : undefined
	);
</script>

<span
	class="chips"
	class:quiet
	data-classes={classes.join(' ')}
	role={classes.length ? 'img' : undefined}
	aria-label={spoken}
>
	{#each classes as c (c)}
		<abbr class="chip {c}" title={CHIP[c].title}>{CHIP[c].letter}</abbr>
	{/each}
</span>

<style>
	.chips {
		display: inline-flex;
		gap: 3px;
		margin-left: 6px;
		vertical-align: 1px;
	}
	.chip {
		font-size: 12px;
		font-weight: 600;
		line-height: 1.4;
		padding: 0 5px;
		border-radius: 3px;
		background: rgba(148, 163, 184, 0.12);
		text-decoration: none;
	}
	.quiet {
		gap: 1px;
		margin-left: 0;
		opacity: 0.72;
	}
	.quiet .chip {
		padding: 0 3px;
		font-weight: 500;
		background: none;
	}
	.live {
		color: #10b981;
	}
	.cited {
		color: #38bdf8;
	}
	.persona {
		color: #c084fc;
	}
</style>

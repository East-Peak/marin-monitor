<!-- An input's provenance as a chip: L live, C cited, P persona (Decision 1). -->
<script lang="ts">
	import type { InputClass } from '$lib/lifestyle/model';

	let { classes }: { classes: readonly InputClass[] } = $props();

	const CHIP: Record<InputClass, { letter: string; title: string }> = {
		live: { letter: 'L', title: 'Live: our own read' },
		cited: { letter: 'C', title: 'Cited: a published figure' },
		persona: { letter: 'P', title: 'Persona: an assumption about this household' }
	};
</script>

<span class="chips" data-classes={classes.join(' ')}>
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

<script lang="ts">
	import { provenance, type SourceLine } from '$lib/dashboard/provenance';

	let {
		lines,
		now,
		notes = []
	}: {
		lines: SourceLine[];
		now: number;
		/** Plain asides on the same line (e.g. the other fuels' prices), after the sources. */
		notes?: string[];
	} = $props();
</script>

<p class="src" data-card-source data-text-role="meta">
	{#each lines as line, i (i)}
		{@const p = provenance(line, now)}
		<span class="st" class:attention={p.attention} data-source-state={line.measured.kind}
			>{p.text}</span
		>
	{/each}
	{#each notes as note, i (i)}
		<span class="note">{note}</span>
	{/each}
</p>

<style>
	/* One card's provenance line: each source pushed to the card's foot. Colour only where a
	   source needs attention (Stuart, 2026-10-28: no always-green dot). */
	.src {
		display: flex;
		flex-wrap: wrap;
		gap: 0 var(--v2-s3);
		margin: auto 0 0;
		padding-top: var(--v2-s1);
		color: var(--text-muted);
	}
	.st {
		display: inline-flex;
		align-items: center;
		gap: var(--v2-s1);
	}
	.st.attention::before {
		content: '';
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--warning, #f59e0b);
	}
</style>

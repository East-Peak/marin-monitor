<script lang="ts">
	import {
		coverageDetails,
		describePresentation,
		type SectionPresentation
	} from '$lib/dashboard/source-status';

	let { status, now }: { status: SectionPresentation; now: number } = $props();
	const text = $derived(describePresentation(status, now));
	const details = $derived(coverageDetails(status));
</script>

{#if text}
	<p class="v2-section-status" data-section-status={status.state} data-text-role="meta">{text}</p>
	{#if details.length}
		<details class="v2-coverage" data-text-role="meta">
			<summary>Which sources</summary>
			<ul>
				{#each details as line (line)}<li>{line}</li>{/each}
			</ul>
		</details>
	{/if}
{/if}

<style>
	.v2-section-status {
		margin: 0;
		color: var(--text-muted);
	}
	.v2-section-status[data-section-status='unavailable'],
	.v2-section-status[data-section-status='partial'] {
		color: var(--warning, var(--text-primary));
	}
</style>

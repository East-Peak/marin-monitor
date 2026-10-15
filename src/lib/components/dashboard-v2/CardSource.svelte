<script lang="ts" module>
	import type { Measured } from '$lib/dashboard/measured';

	export interface SourceLine {
		measured: Measured<unknown>;
		/** How the time reads: "issued" (a forecast), "checked" (our read), "as of" (the payload's own). */
		verb?: string;
		/** Shown in place of a time when the source has none to give (e.g. a tide prediction). */
		untimed?: string;
	}
</script>

<script lang="ts">
	import { formatAsOf } from '$lib/dashboard/pacific-time';

	let { lines, now }: { lines: SourceLine[]; now: number } = $props();

	/** One card's provenance: source, then its time or why there is none. Never a bare value. */
	function describe({ measured: m, verb = 'as of', untimed }: SourceLine): string {
		switch (m.kind) {
			case 'loading':
				return `${m.source} · loading…`;
			case 'unknown':
				return `${m.source} · unverified (${m.reason})`;
			case 'unavailable':
				return `${m.source} · unavailable (${m.reason})`;
			case 'value': {
				const when =
					m.observedAt !== null
						? `${verb} ${formatAsOf(m.observedAt, now)}`
						: (untimed ?? 'time not reported');
				return `${m.source} · ${when}${m.retainedAfter ? ` · out of date (${m.retainedAfter})` : ''}`;
			}
		}
	}

	const tone = (m: Measured<unknown>) =>
		m.kind === 'loading'
			? 'static'
			: m.kind !== 'value' || m.retainedAfter !== null
				? 'stale'
				: 'ok';
</script>

<p class="src" data-card-source data-text-role="meta">
	{#each lines as line, i (i)}
		<span class="st {tone(line.measured)}" data-source-state={line.measured.kind}
			>{describe(line)}</span
		>
	{/each}
</p>

<style>
	/* The mockup's `.src` line: a status dot per source, pushed to the card's foot. */
	.src {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.9rem;
		margin: auto 0 0;
		padding-top: 6px;
		color: var(--text-muted);
	}
	.st {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.st::before {
		content: '';
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--green, #10b981);
	}
	.st.static::before {
		background: var(--text-muted);
	}
	.st.stale::before {
		background: var(--yellow, #f59e0b);
	}
</style>

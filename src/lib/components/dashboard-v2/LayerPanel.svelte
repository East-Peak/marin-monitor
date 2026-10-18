<!-- The map's "Layers" checklist (MAPX2b; every width since MAPX2c): each layer's swatch, count in view, source
     and as-of time, or why it has none. A layer that can't vouch for a number shows no count;
     unknown is never zero. The old category chips are its "Stories" group. -->
<script lang="ts" module>
	export interface LayerRow {
		id: string;
		name: string;
		swatch: string;
		/** null: always on (no switch). */
		on: boolean | null;
		/** Features in view; null when the read can't vouch for a number, or the layer is off. */
		count: number | null;
		/** "511 · as of 7:52 AM", "511 unavailable", … */
		status: string;
		/** e.g. "2 events without a location", or a kept note. */
		note?: string | null;
	}
</script>

<script lang="ts">
	let {
		stories,
		layers,
		ontoggle
	}: {
		/** The Stories group: its rows, under one status line. */
		stories: { rows: LayerRow[]; count: number | null; status: string };
		layers: LayerRow[];
		ontoggle: (id: string, on: boolean) => void;
	} = $props();

	let open = $state(false);
</script>

{#snippet row(r: LayerRow)}
	<li data-layer-row={r.id}>
		<label>
			{#if r.on !== null}
				<input
					type="checkbox"
					checked={r.on}
					onchange={(e) => ontoggle(r.id, e.currentTarget.checked)}
				/>
			{/if}
			<span class="swatch" style:background={r.swatch} aria-hidden="true"></span>
			<span class="name" data-text-role="body">{r.name}</span>
			{#if r.count !== null}<span class="count" data-layer-count data-text-role="meta"
					>{r.count}</span
				>{/if}
		</label>
		{#if r.status}<p class="meta" data-layer-status data-text-role="meta">{r.status}</p>{/if}
		{#if r.note}<p class="meta" data-layer-note data-text-role="meta">{r.note}</p>{/if}
	</li>
{/snippet}

<div class="layers" data-layer-panel>
	<button
		type="button"
		class="trigger"
		aria-expanded={open}
		aria-controls="v2-layer-list"
		data-text-role="label"
		onclick={() => (open = !open)}>Layers</button
	>
	{#if open}
		<div class="list" id="v2-layer-list" role="group" aria-label="Map layers">
			<h3 data-text-role="label">
				Stories{#if stories.count !== null}<span class="count" data-text-role="meta"
						>{stories.count}</span
					>{/if}
			</h3>
			<p class="meta" data-text-role="meta">{stories.status}</p>
			<ul>
				{#each stories.rows as r (r.id)}{@render row(r)}{/each}
			</ul>
			<h3 data-text-role="label">Data</h3>
			<ul>
				{#each layers as r (r.id)}{@render row(r)}{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.layers {
		position: absolute;
		top: 0.5rem;
		left: 0.5rem;
		z-index: 21;
		max-width: 18rem;
	}
	.trigger {
		min-height: 2.25rem;
		padding: 0 0.75rem;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text-primary);
		cursor: pointer;
	}
	.trigger:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	.list {
		margin-top: 0.4rem;
		max-height: min(70vh, 34rem);
		overflow-y: auto;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text-primary);
		box-shadow: 0 4px 16px rgb(0 0 0 / 0.25);
	}
	h3 {
		display: flex;
		gap: 0.5rem;
		margin: 0.4rem 0 0;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	ul {
		margin: 0.25rem 0 0;
		padding: 0;
		list-style: none;
	}
	li {
		padding: 0.25rem 0;
	}
	label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		cursor: pointer;
	}
	.swatch {
		width: 0.7rem;
		height: 0.7rem;
		border-radius: 50%;
		flex: none;
	}
	.count {
		margin-left: auto;
		font-variant-numeric: tabular-nums;
	}
	.meta {
		margin: 0.1rem 0 0 1.95rem;
		color: var(--text-muted);
	}
	@media (max-width: 767px) {
		/* The expanded phone map (70vh): the list ends above the Collapse button (MAPX2c). */
		.list {
			max-height: calc(70vh - 7.5rem);
		}
	}
</style>

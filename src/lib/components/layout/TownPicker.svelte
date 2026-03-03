<script lang="ts">
	import { townFilter, selectedTownObj } from '$lib/stores/town-filter';
	import { MARIN_TOWNS } from '$lib/config/towns';

	let open = $state(false);
	let search = $state('');
	let triggerEl = $state<HTMLButtonElement>(undefined!);
	let dropdownEl = $state<HTMLDivElement>(undefined!);

	const incorporated = MARIN_TOWNS.filter((t) => t.incorporated).sort((a, b) =>
		a.name.localeCompare(b.name)
	);
	const unincorporated = MARIN_TOWNS.filter((t) => !t.incorporated).sort((a, b) =>
		a.name.localeCompare(b.name)
	);

	const filtered = $derived.by(() => {
		if (!search) return { incorporated, unincorporated };
		const q = search.toLowerCase();
		return {
			incorporated: incorporated.filter((t) => t.name.toLowerCase().includes(q)),
			unincorporated: unincorporated.filter((t) => t.name.toLowerCase().includes(q))
		};
	});

	const displayName = $derived($selectedTownObj?.name ?? 'All of Marin');

	function selectTown(slug: string | null) {
		townFilter.select(slug);
		open = false;
		search = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			search = '';
			triggerEl?.focus();
		}
	}

	function handleClickOutside(e: MouseEvent) {
		if (
			open &&
			triggerEl &&
			!triggerEl.contains(e.target as Node) &&
			dropdownEl &&
			!dropdownEl.contains(e.target as Node)
		) {
			open = false;
			search = '';
		}
	}

	function formatPop(pop: number): string {
		if (pop >= 1000) return `${(pop / 1000).toFixed(pop >= 10000 ? 0 : 1)}k`;
		return String(pop);
	}

	$effect(() => {
		if (open) {
			document.addEventListener('click', handleClickOutside, true);
			return () => document.removeEventListener('click', handleClickOutside, true);
		}
	});
</script>

<div class="town-picker" onkeydown={handleKeydown}>
	<button
		class="picker-trigger"
		class:active={$selectedTownObj !== null}
		bind:this={triggerEl}
		onclick={() => (open = !open)}
		title="Filter by town"
	>
		<span class="picker-icon">&#9675;</span>
		<span class="picker-label">{displayName}</span>
		<span class="picker-caret">{open ? '\u25B4' : '\u25BE'}</span>
	</button>

	{#if open}
		<div class="picker-dropdown" bind:this={dropdownEl}>
			<div class="picker-search">
				<input
					type="text"
					placeholder="Search towns..."
					bind:value={search}
					autofocus
				/>
			</div>

			<div class="picker-list">
				<button
					class="picker-option all-option"
					class:selected={$selectedTownObj === null}
					onclick={() => selectTown(null)}
				>
					<span class="option-name">All of Marin</span>
					<span class="option-pop">County</span>
				</button>

				{#if filtered.incorporated.length > 0}
					<div class="picker-group-header">Cities</div>
					{#each filtered.incorporated as town}
						<button
							class="picker-option"
							class:selected={$townFilter === town.slug}
							onclick={() => selectTown(town.slug)}
						>
							<span class="option-name">{town.name}</span>
							<span class="option-pop">{town.pop ? formatPop(town.pop) : ''}</span>
						</button>
					{/each}
				{/if}

				{#if filtered.unincorporated.length > 0}
					<div class="picker-group-header">Communities</div>
					{#each filtered.unincorporated as town}
						<button
							class="picker-option"
							class:selected={$townFilter === town.slug}
							onclick={() => selectTown(town.slug)}
						>
							<span class="option-name">{town.name}</span>
							<span class="option-pop">{town.pop ? formatPop(town.pop) : ''}</span>
						</button>
					{/each}
				{/if}

				{#if filtered.incorporated.length === 0 && filtered.unincorporated.length === 0}
					<div class="picker-empty">No matching towns</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.town-picker {
		position: relative;
	}

	.picker-trigger {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 2.75rem;
		padding: 0.4rem 0.75rem;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.15s ease;
		font-size: 0.65rem;
		white-space: nowrap;
	}

	.picker-trigger:hover {
		background: var(--border);
		color: var(--text-primary);
	}

	.picker-trigger.active {
		border-color: var(--accent);
		color: var(--accent);
	}

	.picker-icon {
		font-size: 0.7rem;
	}

	.picker-label {
		max-width: 10rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.picker-caret {
		font-size: 0.5rem;
		opacity: 0.6;
	}

	.picker-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		width: 220px;
		max-height: 400px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		z-index: 200;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.picker-search {
		padding: 0.5rem;
		border-bottom: 1px solid var(--border);
	}

	.picker-search input {
		width: 100%;
		padding: 0.4rem 0.5rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--text-primary);
		font-size: 0.65rem;
		outline: none;
	}

	.picker-search input:focus {
		border-color: var(--accent);
	}

	.picker-search input::placeholder {
		color: var(--text-muted);
	}

	.picker-list {
		overflow-y: auto;
		padding: 0.25rem 0;
	}

	.picker-group-header {
		padding: 0.4rem 0.75rem 0.2rem;
		font-size: 0.55rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.picker-option {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 0.4rem 0.75rem;
		background: transparent;
		border: none;
		color: var(--text-secondary);
		font-size: 0.65rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
	}

	.picker-option:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-primary);
	}

	.picker-option.selected {
		color: var(--accent);
		background: rgba(168, 85, 247, 0.08);
	}

	.all-option {
		border-bottom: 1px solid var(--border);
		margin-bottom: 0.15rem;
	}

	.option-name {
		flex: 1;
		min-width: 0;
	}

	.option-pop {
		font-size: 0.55rem;
		color: var(--text-muted);
		flex-shrink: 0;
		margin-left: 0.5rem;
	}

	.picker-empty {
		padding: 1rem;
		text-align: center;
		font-size: 0.6rem;
		color: var(--text-muted);
	}

	@media (max-width: 480px) {
		.picker-label {
			display: none;
		}

		.picker-dropdown {
			position: fixed;
			top: auto;
			right: 0.5rem;
			left: 0.5rem;
			bottom: 0.5rem;
			width: auto;
			max-height: 60vh;
		}
	}
</style>

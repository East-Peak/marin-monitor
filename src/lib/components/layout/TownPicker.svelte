<script lang="ts">
	import { townFilter, selectedTownObj } from '$lib/stores/town-filter';
	import { MARIN_TOWNS, MARIN_REGIONS } from '$lib/config/towns';
	import type { MarinRegion } from '$lib/types';
	import type { Town } from '$lib/types';

	let open = $state(false);
	let search = $state('');
	let triggerEl = $state<HTMLButtonElement>(undefined!);
	let dropdownEl = $state<HTMLDivElement>(undefined!);

	// Pre-group towns by region, sorted alphabetically within each region
	const townsByRegion: { region: MarinRegion; towns: Town[] }[] = MARIN_REGIONS.map((region) => ({
		region,
		towns: MARIN_TOWNS.filter((t) => t.region === region).sort((a, b) =>
			a.name.localeCompare(b.name)
		)
	}));

	const filtered = $derived.by(() => {
		if (!search) return townsByRegion;
		const q = search.toLowerCase();
		return townsByRegion
			.map((group) => ({
				...group,
				towns: group.towns.filter((t) => t.name.toLowerCase().includes(q))
			}))
			.filter((group) => group.towns.length > 0);
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
		<svg class="picker-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
			{#if $selectedTownObj}
				<path
					d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5z"
					fill="currentColor"
				/>
				<circle cx="8" cy="6" r="2" fill="var(--bg, #0a0e1a)" />
			{:else}
				<path
					d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 12.5C6.5 11 4 7.9 4 6a4 4 0 1 1 8 0c0 1.9-2.5 5-4 7.5z"
					fill="currentColor"
				/>
				<circle cx="8" cy="6" r="1.5" fill="currentColor" />
			{/if}
		</svg>
		<span class="picker-label">{displayName}</span>
		<span class="picker-caret">{open ? '\u25B4' : '\u25BE'}</span>
	</button>

	{#if open}
		<div class="picker-dropdown" bind:this={dropdownEl}>
			<div class="picker-search">
				<input type="text" placeholder="Search towns..." bind:value={search} autofocus />
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

				{#each filtered as group (group.region)}
					<div class="picker-group-header">{group.region}</div>
					{#each group.towns as town (town.slug)}
						<button
							class="picker-option"
							class:selected={$townFilter === town.slug}
							onclick={() => selectTown(town.slug)}
						>
							<span class="option-name">{town.name}</span>
							<span class="option-pop">{town.pop ? formatPop(town.pop) : ''}</span>
						</button>
					{/each}
				{/each}

				{#if filtered.length === 0}
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
		gap: 0.5rem;
		min-height: 2.75rem;
		padding: 0.5rem 1rem;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 6px;
		color: var(--text-primary);
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
		box-shadow:
			0 2px 8px rgba(0, 0, 0, 0.15),
			inset 0 1px 1px rgba(255, 255, 255, 0.05);
	}

	.picker-trigger:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.25);
		transform: translateY(-1px);
	}

	.picker-trigger.active {
		border-color: var(--accent);
		color: #f8fafc;
		background: rgba(14, 165, 233, 0.15);
		box-shadow:
			0 2px 12px rgba(14, 165, 233, 0.2),
			inset 0 1px 1px rgba(255, 255, 255, 0.1);
	}

	.picker-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
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
		background: rgb(16, 20, 32);
		border: 1px solid var(--border);
		border-radius: 6px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
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
		background: rgba(255, 255, 255, 0.08);
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
		.picker-trigger {
			padding: 0.4rem 0.5rem;
		}

		.picker-label,
		.picker-caret {
			display: none;
		}

		.picker-icon {
			width: 16px;
			height: 16px;
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

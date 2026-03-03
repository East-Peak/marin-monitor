<script lang="ts">
	import { townFilter, selectedTownObj } from '$lib/stores/town-filter';
</script>

{#if $selectedTownObj}
	<div class="town-banner">
		<span class="banner-accent"></span>
		<span class="banner-text">
			<strong>{$selectedTownObj.name}</strong>
			<span class="banner-region">{$selectedTownObj.region}</span>
		</span>
		<button
			class="banner-clear"
			onclick={() => townFilter.clear()}
			title="Clear town filter"
			aria-label="Clear town filter"
		>
			&times;
		</button>
	</div>
{/if}

<style>
	.town-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: 28px;
		margin-bottom: 0.75rem;
		padding: 0 0.6rem;
		background: rgba(168, 85, 247, 0.06);
		border-radius: 4px;
		overflow: hidden;
	}

	.banner-accent {
		width: 3px;
		align-self: stretch;
		background: var(--accent);
		border-radius: 2px;
		flex-shrink: 0;
	}

	.banner-text {
		flex: 1;
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
		font-size: 0.68rem;
		color: var(--text-primary);
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
	}

	.banner-text strong {
		font-weight: 600;
	}

	.banner-region {
		font-size: 0.58rem;
		color: var(--text-muted);
	}

	.banner-region::before {
		content: '\00B7\00A0';
	}

	.banner-clear {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 3px;
		color: var(--text-muted);
		font-size: 0.82rem;
		line-height: 1;
		cursor: pointer;
		transition: all 0.12s ease;
		padding: 0;
	}

	.banner-clear:hover {
		background: rgba(255, 255, 255, 0.12);
		color: var(--text-primary);
	}

	@media (max-width: 480px) {
		.town-banner {
			margin-bottom: 0.5rem;
		}
	}
</style>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { isRefreshing, lastRefresh } from '$lib/stores';
	import TownPicker from './TownPicker.svelte';

	interface Props {
		onSettingsClick?: () => void;
	}

	let { onSettingsClick }: Props = $props();

	let dateTimeText = $state('');
	let clockTimer: ReturnType<typeof setInterval> | null = null;

	function updateDateTime() {
		const now = new Date();
		dateTimeText =
			now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
			'  ' +
			now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
	}

	onMount(() => {
		updateDateTime();
		clockTimer = setInterval(updateDateTime, 10_000);
	});

	onDestroy(() => {
		if (clockTimer) clearInterval(clockTimer);
	});

	const lastRefreshText = $derived(
		$lastRefresh
			? `Last updated: ${new Date($lastRefresh).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
			: 'Never refreshed'
	);
</script>

<header class="header">
	<div class="header-left">
		<h1 class="logo">MARIN MONITOR</h1>
	</div>

	<div class="header-center">
		<span class="datetime-text">{dateTimeText}</span>
		<div class="refresh-status">
			{#if $isRefreshing}
				<span class="status-text loading">Refreshing...</span>
			{:else}
				<span class="status-text">{lastRefreshText}</span>
			{/if}
		</div>
	</div>

	<div class="header-right">
		<TownPicker />
		<a href="/tv" class="header-btn tv-btn" title="TV Mode (M)">
			<span class="btn-icon">
				<svg width="14" height="14" viewBox="0 0 16 16" fill="none">
					<rect
						x="1"
						y="2"
						width="14"
						height="10"
						rx="1.5"
						stroke="currentColor"
						stroke-width="1.5"
						fill="none"
					/>
					<line
						x1="5"
						y1="14"
						x2="11"
						y2="14"
						stroke="currentColor"
						stroke-width="1.5"
						stroke-linecap="round"
					/>
				</svg>
			</span>
			<span class="btn-label">TV</span>
		</a>
		<button class="header-btn settings-btn" onclick={onSettingsClick} title="Settings">
			<span class="btn-icon">⚙</span>
			<span class="btn-label">Settings</span>
		</button>
	</div>
</header>

<style>
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 2rem; /* Increased padding */
		background: rgba(15, 23, 42, 0.4); /* Thinner backdrop */
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border-bottom: 1px solid rgba(255, 255, 255, 0.05); /* Softer border */
		position: sticky;
		top: 0;
		z-index: 100;
		gap: 1rem;
		box-shadow: 0 4px 20px -5px rgba(0, 0, 0, 0.2);
	}

	.header-left {
		display: flex;
		align-items: baseline;
		flex-shrink: 0;
	}

	.logo {
		font-size: 1rem;
		font-weight: 800;
		letter-spacing: 0.15em;
		margin: 0;
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		background: linear-gradient(135deg, #f8fafc 0%, #0ea5e9 100%);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		text-shadow: 0 2px 10px rgba(14, 165, 233, 0.2);
	}

	.header-center {
		display: flex;
		align-items: center;
		flex: 1;
		justify-content: center;
		min-width: 0;
	}

	.datetime-text {
		font-size: 0.65rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-dim);
		white-space: nowrap;
	}

	.refresh-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: rgba(255, 255, 255, 0.03);
		padding: 0.3rem 0.8rem;
		border-radius: 20px;
		border: 1px solid rgba(255, 255, 255, 0.05);
	}

	.status-text {
		font-size: 0.65rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-dim);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.status-text.loading {
		color: var(--accent);
		text-shadow: 0 0 8px rgba(14, 165, 233, 0.4);
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-shrink: 0;
	}

	.header-btn {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 2.75rem;
		padding: 0.4rem 1rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.05);
		border-radius: 6px;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		font-size: 0.7rem;
		font-weight: 500;
		box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.05);
	}

	.header-btn:hover {
		background: rgba(14, 165, 233, 0.1);
		border-color: rgba(14, 165, 233, 0.3);
		color: #f8fafc;
		transform: translateY(-1px);
		box-shadow:
			0 4px 12px rgba(0, 0, 0, 0.1),
			inset 0 1px 1px rgba(255, 255, 255, 0.1);
	}

	.btn-icon {
		font-size: 0.85rem;
	}

	.btn-label {
		display: none;
	}

	@media (min-width: 768px) {
		.btn-label {
			display: inline;
		}
	}

	@media (max-width: 720px) {
		.header {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-areas:
				'logo actions'
				'status status';
			align-items: center;
			padding: 0.75rem 1rem;
			gap: 0.65rem;
		}

		.header-left {
			grid-area: logo;
			min-width: 0;
		}

		.header-center {
			grid-area: status;
			justify-content: space-between;
			gap: 0.5rem;
			width: 100%;
		}

		.header-right {
			grid-area: actions;
			gap: 0.45rem;
			margin-left: auto;
		}

		.logo {
			font-size: 0.88rem;
			letter-spacing: 0.12em;
		}

		.datetime-text {
			display: none;
		}

		.refresh-status {
			padding: 0.25rem 0.65rem;
			max-width: 100%;
		}

		.status-text {
			font-size: 0.58rem;
		}

		.header-btn {
			min-height: 2.5rem;
			padding: 0.35rem 0.75rem;
		}
	}

	@media (max-width: 400px) {
		.header {
			padding: 0.6rem 0.75rem;
			gap: 0.5rem;
		}

		.logo {
			font-size: 0.78rem;
		}

		.header-btn {
			min-height: 2.25rem;
			padding: 0.3rem 0.5rem;
		}
	}
</style>

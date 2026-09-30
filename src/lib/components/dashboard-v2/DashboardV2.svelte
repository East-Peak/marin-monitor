<!-- src/lib/components/dashboard-v2/DashboardV2.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import TownPicker from '$lib/components/layout/TownPicker.svelte';
	import { createDashboardV2Controller, V2_REFRESH_MS } from '$lib/dashboard/v2-controller';
	import SettingsMenu from './SettingsMenu.svelte';

	// SSR renders "false"; tests and later sections use this to know the page is interactive.
	let hydrated = $state(false);
	// The one owner of this page's data (spec §13.7); aborted when the page goes away.
	const lifetime = new AbortController();
	const controller = browser ? createDashboardV2Controller({ signal: lifetime.signal }) : null;
	onMount(() => {
		hydrated = true;
		if (!controller) return;
		void controller.start();
		const timer = setInterval(() => void controller.refresh(), V2_REFRESH_MS);
		const onVisible = () => {
			if (document.visibilityState === 'visible') void controller.refresh();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			lifetime.abort();
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
</script>

<svelte:head>
	<title>Marin Monitor — dashboard preview</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="dash-v2" data-layout="v2" data-hydrated={hydrated ? 'true' : 'false'}>
	<header class="v2-header">
		<a class="v2-logo" href="/?layout=v2">Marin Monitor</a>
		<div class="v2-scope" role="group" aria-labelledby="v2-scope-label">
			<span class="v2-scope-label" id="v2-scope-label">Showing:</span>
			<TownPicker />
		</div>
		<SettingsMenu />
		<span class="v2-badge">v2 preview</span>
		<a class="v2-leave" href="/">Leave preview</a>
	</header>

	<main class="v2-main">
		<p class="v2-note">
			This is an early preview of the redesigned dashboard. Sections arrive in upcoming releases;
			the regular dashboard is unchanged.
		</p>
	</main>
</div>

<style>
	.dash-v2 {
		min-height: 100vh;
		background: var(--bg);
		color: var(--text-primary);
		font-size: 15px;
		line-height: 1.45;
	}
	.v2-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border-light);
	}
	.v2-logo {
		font-size: 17px;
		font-weight: 700;
		color: var(--text-primary);
		text-decoration: none;
	}
	.v2-scope {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.v2-scope-label {
		font-size: 13px;
		color: var(--text-muted);
	}
	.v2-badge {
		padding: 2px 8px;
		border: 1px solid var(--accent);
		border-radius: 999px;
		font-size: 12px;
		color: var(--accent);
	}
	.v2-leave {
		margin-left: auto;
		font-size: 13px;
		color: var(--text-muted);
	}
	.v2-main {
		max-width: 72rem;
		margin: 0 auto;
		padding: 1rem;
	}
	.v2-note {
		color: var(--text-muted);
	}
	@media (max-width: 767px) {
		.dash-v2 {
			font-size: 16px;
		}
	}
</style>

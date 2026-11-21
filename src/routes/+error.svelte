<script lang="ts">
	import { page } from '$app/state';

	const LINKS = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/map', label: 'Map' },
		{ href: '/cost', label: 'Cost of living' }
	];

	/** The path as typed, for reading; a malformed escape shows as it came. */
	const path = $derived.by(() => {
		try {
			return decodeURIComponent(page.url.pathname);
		} catch {
			return page.url.pathname;
		}
	});
	const missing = $derived(page.status === 404);
	const heading = $derived(missing ? `There’s no page at ${path}` : 'Something went wrong');
	const title = $derived(missing ? 'Page not found' : 'Something went wrong');
</script>

<svelte:head>
	<title>{title} · Marin Monitor</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="error-page">
	<a class="wordmark" href="/" data-wordmark>Marin Monitor</a>
	<div class="what">
		<p class="status" data-status>{page.status}</p>
		<h1>{heading}</h1>
		<p class="why">
			{missing
				? "The link may be old, or the town isn't one we cover yet."
				: 'Try again in a moment, or head back to one of these.'}
		</p>
	</div>
	<nav aria-label="Where to go">
		{#each LINKS as link (link.href)}
			<a href={link.href}>{link.label}</a>
		{/each}
	</nav>
</main>

<style>
	.error-page {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 28px;
		max-width: 32rem;
		margin: 0 auto;
		padding: 24px 16px;
	}
	.wordmark {
		align-self: flex-start;
		color: var(--text-primary);
		font-size: 17px;
		font-weight: 600;
		letter-spacing: 0.01em;
	}
	.what {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 80px;
	}
	.status {
		margin: 0;
		color: var(--text-muted);
		font-size: 12px;
		letter-spacing: 0.06em;
	}
	h1 {
		margin: 0;
		color: var(--text-primary);
		font-size: 26px;
		font-weight: 600;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.why {
		margin: 0;
		color: var(--text-muted);
		font-size: 15px;
		line-height: 1.45;
	}
	nav {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--border-light);
	}
	nav a {
		display: flex;
		align-items: center;
		box-sizing: border-box;
		min-height: 52px;
		border-bottom: 1px solid var(--border-light);
		font-size: 16px;
	}
	a {
		color: var(--text-primary);
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
</style>

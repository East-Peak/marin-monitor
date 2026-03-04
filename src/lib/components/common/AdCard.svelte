<script lang="ts">
	import { track } from '@vercel/analytics';
	import type { AdConfig } from '$lib/config/ads';

	interface Props {
		ad: AdConfig;
	}

	let { ad }: Props = $props();

	function handleClick() {
		track('ad-click', {
			adId: ad.id,
			adType: ad.type,
			sponsor: ad.sponsor,
			placement: 'wire'
		});
		fetch('/api/ad-click', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ adId: ad.id })
		}).catch(() => {});
	}
</script>

<div class="ad-card">
	<div class="ad-source">
		{ad.sponsor}
		<span class="ad-badge">{ad.label || 'Featured'}</span>
	</div>

	<a
		class="ad-title"
		href={ad.url}
		target="_blank"
		rel="noopener noreferrer sponsored"
		onclick={handleClick}
	>
		{ad.headline}
	</a>

	{#if ad.body}
		<p class="ad-body">{ad.body}</p>
	{/if}
</div>

<style>
	.ad-card {
		padding: 0.5rem;
		margin: 0 -0.5rem;
		border: 1px dashed rgba(217, 169, 56, 0.4);
		background: rgba(217, 169, 56, 0.06);
		border-radius: 4px;
	}

	.ad-source {
		font-size: 0.55rem;
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: 0.03em;
		margin-bottom: 0.2rem;
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.ad-badge {
		background: rgba(217, 169, 56, 0.25);
		color: rgb(217, 169, 56);
		font-size: 0.45rem;
		padding: 0.08rem 0.3rem;
		border-radius: 2px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.ad-title {
		display: block;
		font-size: 0.7rem;
		line-height: 1.35;
		color: var(--text-primary);
		text-decoration: none;
	}

	.ad-title:hover {
		color: rgb(217, 169, 56);
	}

	.ad-body {
		font-size: 0.6rem;
		color: var(--text-secondary);
		margin: 0.3rem 0 0;
		line-height: 1.4;
	}
</style>

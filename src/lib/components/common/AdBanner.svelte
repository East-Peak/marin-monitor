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
			placement: 'banner'
		});
		fetch('/api/ad-click', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ adId: ad.id })
		}).catch(() => {});
	}
</script>

<div class="ad-banner">
	<span class="banner-badge">{ad.label || 'Featured'}</span>
	<a
		class="banner-link"
		href={ad.url}
		target="_blank"
		rel="noopener noreferrer sponsored"
		onclick={handleClick}
	>
		<span class="banner-headline">{ad.headline}</span>
		{#if ad.body}
			<span class="banner-sep">&mdash;</span>
			<span class="banner-body">{ad.body}</span>
		{/if}
	</a>
	<span class="banner-sponsor">{ad.sponsor}</span>
</div>

<style>
	.ad-banner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0.75rem;
		border: 1px dashed rgba(217, 169, 56, 0.4);
		background: rgba(217, 169, 56, 0.06);
		border-radius: 4px;
		flex-wrap: wrap;
	}

	.banner-badge {
		background: rgba(217, 169, 56, 0.25);
		color: rgb(217, 169, 56);
		font-size: 0.45rem;
		padding: 0.08rem 0.3rem;
		border-radius: 2px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.banner-link {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		text-decoration: none;
		flex: 1;
		min-width: 0;
		flex-wrap: wrap;
	}

	.banner-link:hover .banner-headline {
		color: rgb(217, 169, 56);
	}

	.banner-headline {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
	}

	.banner-sep {
		font-size: 0.6rem;
		color: var(--text-muted);
	}

	.banner-body {
		font-size: 0.6rem;
		color: var(--text-secondary);
	}

	.banner-sponsor {
		font-size: 0.5rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
		margin-left: auto;
		white-space: nowrap;
		flex-shrink: 0;
	}
</style>

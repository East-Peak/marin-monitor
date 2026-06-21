<script lang="ts">
	import Panel from '$lib/components/common/Panel.svelte';
	import { CHANGELOG } from '$lib/config/changelog';

	interface Props {
		onFeedback: (type: 'feed-request' | 'bug-report' | 'general') => void;
	}

	let { onFeedback }: Props = $props();

	function formatDate(iso: string): string {
		const d = new Date(iso + 'T00:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

<Panel id="community" title="Community" variant="community">
	{#snippet children()}
		<div class="community-content">
			<p class="intro">Marin Monitor is a community project. Help us make it better.</p>

			<button class="cta" onclick={() => onFeedback('feed-request')}>
				<span class="cta-icon">+</span>
				<span class="cta-text">
					<span class="cta-title">Request a Feed</span>
					<span class="cta-desc">Suggest a source or topic to track</span>
				</span>
			</button>

			<button class="cta" onclick={() => onFeedback('bug-report')}>
				<span class="cta-icon">!</span>
				<span class="cta-text">
					<span class="cta-title">Report a Bug</span>
					<span class="cta-desc">Something broken or inaccurate?</span>
				</span>
			</button>

			<button class="cta" onclick={() => onFeedback('general')}>
				<span class="cta-icon">&#9993;</span>
				<span class="cta-text">
					<span class="cta-title">Send Feedback</span>
					<span class="cta-desc">Ideas, suggestions, or just say hi</span>
				</span>
			</button>

			<div class="divider"></div>

			<p class="contact">
				Or email directly:
				<a href="mailto:stuart@eastpeak.cc">stuart@eastpeak.cc</a>
			</p>

			<div class="divider"></div>

			<div class="changelog">
				<h4 class="changelog-heading">Changelog</h4>
				{#each CHANGELOG as entry}
					<div class="changelog-entry">
						<span class="changelog-date">{formatDate(entry.date)}</span>
						<div class="changelog-body">
							<span class="changelog-title">{entry.title}</span>
							{#if entry.description}
								<span class="changelog-desc">{entry.description}</span>
							{/if}
							{#if entry.contributor}
								<span class="changelog-credit">via {entry.contributor}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/snippet}
</Panel>

<style>
	.community-content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.intro {
		font-size: 0.7rem;
		color: var(--text-muted);
		margin: 0 0 0.25rem;
		line-height: 1.5;
	}

	.cta {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		padding: 0.6rem 0.65rem;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid var(--border);
		border-radius: 4px;
		cursor: pointer;
		text-align: left;
		color: var(--text-primary);
		transition:
			background 0.15s,
			border-color 0.15s;
	}

	.cta:hover {
		background: rgba(255, 255, 255, 0.06);
		border-color: var(--border-light);
	}

	.cta-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 4px;
		background: rgba(168, 85, 247, 0.12);
		color: #a855f7;
		font-size: 0.75rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.cta-text {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}

	.cta-title {
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.cta-desc {
		font-size: 0.6rem;
		color: var(--text-muted);
	}

	.divider {
		height: 1px;
		background: var(--border);
		margin: 0.25rem 0;
	}

	.contact {
		font-size: 0.6rem;
		color: var(--text-muted);
		margin: 0;
	}

	.contact a {
		color: var(--accent);
		text-decoration: none;
	}

	.contact a:hover {
		text-decoration: underline;
	}

	.changelog {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.changelog-heading {
		font-size: 0.65rem;
		font-weight: 700;
		color: var(--text-primary);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0;
	}

	.changelog-entry {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
	}

	.changelog-date {
		font-size: 0.55rem;
		color: var(--text-muted);
		white-space: nowrap;
		min-width: 2.8rem;
		padding-top: 0.05rem;
	}

	.changelog-body {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}

	.changelog-title {
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--text-primary);
		line-height: 1.3;
	}

	.changelog-desc {
		font-size: 0.55rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.changelog-credit {
		font-size: 0.5rem;
		color: #a855f7;
		font-style: italic;
	}
</style>

<script lang="ts">
	interface Props {
		onFeedback: () => void;
	}

	let { onFeedback }: Props = $props();
</script>

<footer class="footer">
	<div class="footer-inner">
		<span class="built-by">
			Built by <a href="https://eastpeak.cc" target="_blank" rel="noopener noreferrer"
				>East Peak Advisors</a
			>
		</span>
		<span class="sep">&middot;</span>
		<a href="mailto:stuart@eastpeak.cc" class="contact">stuart@eastpeak.cc</a>
		<span class="sep">&middot;</span>
		<button class="feedback-link" onclick={onFeedback}>Send Feedback</button>
	</div>
</footer>

<style>
	.footer {
		padding: 1.25rem 1.5rem;
		border-top: 1px solid var(--border);
		background: var(--surface);
	}

	.footer-inner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		font-size: 0.6rem;
		color: var(--text-muted);
	}

	.footer-inner a {
		color: var(--text-secondary);
		text-decoration: none;
	}

	.footer-inner a:hover {
		color: var(--text-primary);
		text-decoration: underline;
	}

	.sep {
		color: var(--border-light);
	}

	.feedback-link {
		background: none;
		border: none;
		color: var(--text-secondary);
		font: inherit;
		font-size: inherit;
		cursor: pointer;
		padding: 0;
	}

	.feedback-link:hover {
		color: var(--text-primary);
		text-decoration: underline;
	}
</style>

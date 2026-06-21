<script lang="ts">
	import Modal from './Modal.svelte';

	interface Props {
		open: boolean;
		onClose: () => void;
		initialType?: 'feed-request' | 'bug-report' | 'general';
	}

	let { open = false, onClose, initialType = 'general' }: Props = $props();

	let feedbackType = $state<'feed-request' | 'bug-report' | 'general'>('general');
	let message = $state('');
	let email = $state('');
	let website = $state('');
	let submitting = $state(false);
	let submitted = $state(false);
	let error = $state('');

	// Sync initialType when modal opens
	$effect(() => {
		if (open) {
			feedbackType = initialType;
			message = '';
			email = '';
			website = '';
			submitted = false;
			error = '';
		}
	});

	const typeLabels = {
		'feed-request': 'Request a Feed',
		'bug-report': 'Report a Bug',
		general: 'General Feedback'
	} as const;

	const typePlaceholders = {
		'feed-request':
			'What source or topic would you like tracked? Include a URL if you have one.\n\nExample: "Sausalito city council meeting agendas — they post at sausalito.gov/agendas"',
		'bug-report':
			'What\'s broken or inaccurate? Which panel or section is affected?\n\nExample: "The Mill Valley police log hasn\'t updated since last Tuesday"',
		general:
			"What's on your mind? We'd love to hear from you.\n\nSuggestions, kudos, complaints — all welcome."
	} as const;

	async function handleSubmit() {
		if (!message.trim()) {
			error = 'Please enter a message.';
			return;
		}
		submitting = true;
		error = '';
		try {
			const res = await fetch('/api/feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					type: feedbackType,
					message: message.trim(),
					email: email.trim() || undefined,
					website: website.trim() || undefined
				})
			});
			if (!res.ok) throw new Error('Failed to send');
			submitted = true;
		} catch {
			error = 'Something went wrong. You can also email stuart@eastpeak.cc directly.';
		} finally {
			submitting = false;
		}
	}
</script>

<Modal {open} title="Send Feedback" {onClose}>
	{#if submitted}
		<div class="success">
			<div class="success-icon">&#10003;</div>
			<p class="success-title">Thanks for the feedback!</p>
			<p class="success-text">We'll take a look. If you left an email, we may follow up.</p>
			<button class="btn btn-close" onclick={onClose}>Close</button>
		</div>
	{:else}
		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
		>
			<div class="field">
				<label class="label" for="feedback-type">Type</label>
				<select id="feedback-type" class="select" bind:value={feedbackType}>
					{#each Object.entries(typeLabels) as [value, label]}
						<option {value}>{label}</option>
					{/each}
				</select>
			</div>

			<div class="field">
				<label class="label" for="feedback-message">Message</label>
				<textarea
					id="feedback-message"
					class="textarea"
					bind:value={message}
					placeholder={typePlaceholders[feedbackType]}
					rows="5"
				></textarea>
			</div>

			<div class="field">
				<label class="label" for="feedback-email"
					>Email <span class="optional">(optional, for follow-up)</span></label
				>
				<input
					id="feedback-email"
					class="input"
					type="email"
					bind:value={email}
					placeholder="you@example.com"
				/>
			</div>

			<div class="honeypot" aria-hidden="true">
				<label for="feedback-website">Website</label>
				<input
					id="feedback-website"
					type="text"
					bind:value={website}
					tabindex="-1"
					autocomplete="off"
				/>
			</div>

			{#if error}
				<p class="error">{error}</p>
			{/if}

			<button class="btn btn-submit" type="submit" disabled={submitting}>
				{submitting ? 'Sending...' : 'Send Feedback'}
			</button>
		</form>
	{/if}
</Modal>

<style>
	.field {
		margin-bottom: 0.75rem;
	}

	.honeypot {
		position: absolute;
		left: -10000px;
		width: 1px;
		height: 1px;
		overflow: hidden;
	}

	.label {
		display: block;
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary);
		margin-bottom: 0.3rem;
	}

	.optional {
		font-weight: 400;
		text-transform: none;
		letter-spacing: normal;
		color: var(--text-muted);
	}

	.select,
	.textarea,
	.input {
		width: 100%;
		padding: 0.5rem 0.6rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text-primary);
		font: inherit;
		font-size: 0.75rem;
	}

	.select:focus,
	.textarea:focus,
	.input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.textarea {
		resize: vertical;
		min-height: 80px;
		line-height: 1.5;
	}

	.error {
		color: var(--danger);
		font-size: 0.7rem;
		margin: 0.5rem 0;
	}

	.btn {
		display: block;
		width: 100%;
		padding: 0.6rem;
		border: none;
		border-radius: 4px;
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.btn-submit {
		background: var(--accent);
		color: var(--bg);
		margin-top: 0.5rem;
	}

	.btn-submit:hover:not(:disabled) {
		opacity: 0.9;
	}

	.btn-submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-close {
		background: var(--border);
		color: var(--text-primary);
		margin-top: 1rem;
	}

	.btn-close:hover {
		background: var(--border-light);
	}

	.success {
		text-align: center;
		padding: 1rem 0;
	}

	.success-icon {
		font-size: 2rem;
		color: var(--green);
		margin-bottom: 0.5rem;
	}

	.success-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0 0 0.25rem;
	}

	.success-text {
		font-size: 0.7rem;
		color: var(--text-muted);
		margin: 0;
	}
</style>

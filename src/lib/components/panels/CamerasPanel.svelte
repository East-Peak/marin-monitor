<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Panel } from '$lib/components/common';
	import {
		CAMERAS,
		CAMERA_CATEGORIES,
		type CameraCategory,
		type CameraConfig
	} from '$lib/config/cameras';
	import { settings } from '$lib/stores';

	let imageTimestamps = $state<Record<string, number>>({});
	let expandedCamera = $state<string | null>(null);
	let activeCategory = $state<CameraCategory>('traffic');
	let refreshTimers: ReturnType<typeof setInterval>[] = [];

	const imageCameras = CAMERAS.filter((c) => c.type === 'image');
	const camerasByCategory = $derived(
		CAMERAS.filter((c) => c.category === activeCategory).sort((a, b) => a.order - b.order)
	);

	function getCacheBustedUrl(camera: CameraConfig): string {
		const ts = imageTimestamps[camera.id] || Date.now();
		const sep = camera.url.includes('?') ? '&' : '?';
		return `${camera.url}${sep}_t=${ts}`;
	}

	function toggleExpand(cameraId: string) {
		expandedCamera = expandedCamera === cameraId ? null : cameraId;
	}

	function switchCategory(cat: CameraCategory) {
		expandedCamera = null;
		activeCategory = cat;
	}

	onMount(() => {
		// Initialize timestamps
		const initial: Record<string, number> = {};
		for (const cam of imageCameras) {
			initial[cam.id] = Date.now();
		}
		imageTimestamps = initial;

		// Set up refresh timers for image cameras (only refresh visible ones)
		for (const cam of imageCameras) {
			const interval = (cam.refreshInterval || 30) * 1000;
			const timer = setInterval(() => {
				if (activeCategory === cam.category || activeCategory === ('all' as CameraCategory)) {
					imageTimestamps = { ...imageTimestamps, [cam.id]: Date.now() };
				}
			}, interval);
			refreshTimers.push(timer);
		}
	});

	onDestroy(() => {
		for (const timer of refreshTimers) {
			clearInterval(timer);
		}
	});
</script>

<Panel id="cameras" title="Cameras" count={CAMERAS.length}>
	{#snippet actions()}
		<button class="expand-link" onclick={() => settings.toggleCamerasExpanded()}>
			{$settings.camerasExpanded ? 'Collapse' : 'Expand'} views
		</button>
		<button class="expand-link" onclick={() => settings.toggleCamerasHidden()}> Hide </button>
	{/snippet}
	<div class="camera-tabs">
		{#each CAMERA_CATEGORIES as cat (cat.id)}
			{@const count = CAMERAS.filter((c) => c.category === cat.id).length}
			<button
				class="camera-tab"
				class:active={activeCategory === cat.id}
				onclick={() => switchCategory(cat.id)}
			>
				{cat.label}
				<span class="tab-count">{count}</span>
			</button>
		{/each}
	</div>

	<div class="camera-grid">
		{#each camerasByCategory as camera (camera.id)}
			<div class="camera-card" class:expanded={expandedCamera === camera.id}>
				<button class="camera-header" onclick={() => toggleExpand(camera.id)}>
					<span class="camera-name">{camera.name}</span>
					<span class="camera-location">{camera.location}</span>
				</button>

				<div class="camera-frame">
					{#if camera.type === 'image'}
						<img
							src={getCacheBustedUrl(camera)}
							alt="{camera.name} - {camera.location}"
							loading="lazy"
							class="camera-img"
						/>
					{:else if camera.type === 'youtube'}
						{#if expandedCamera === camera.id}
							<iframe
								src={camera.url}
								title={camera.name}
								class="camera-embed"
								allow="accelerometer; autoplay; encrypted-media; gyroscope"
								allowfullscreen
								loading="lazy"
							></iframe>
						{:else}
							<div
								class="embed-placeholder"
								role="button"
								tabindex="0"
								onclick={() => toggleExpand(camera.id)}
								onkeydown={(e) => e.key === 'Enter' && toggleExpand(camera.id)}
							>
								<span class="play-icon">&#9654;</span>
								<span>Click to load live stream</span>
							</div>
						{/if}
					{:else if camera.type === 'iframe'}
						{#if expandedCamera === camera.id}
							<iframe
								src={camera.url}
								title={camera.name}
								class="camera-embed"
								loading="lazy"
								sandbox="allow-scripts allow-same-origin"
							></iframe>
						{:else}
							<div
								class="embed-placeholder"
								role="button"
								tabindex="0"
								onclick={() => toggleExpand(camera.id)}
								onkeydown={(e) => e.key === 'Enter' && toggleExpand(camera.id)}
							>
								<span class="play-icon">&#9654;</span>
								<span>Click to load</span>
							</div>
						{/if}
					{/if}
				</div>

				<div class="camera-footer">
					<span class="camera-source">{camera.source}</span>
				</div>
			</div>
		{/each}
	</div>
</Panel>

<style>
	.camera-tabs {
		display: flex;
		gap: 0.25rem;
		padding: 0 0 0.4rem;
		border-bottom: 1px solid var(--border);
		margin-bottom: 0.5rem;
	}

	.camera-tab {
		flex: 1;
		padding: 0.3rem 0.4rem;
		background: none;
		border: 1px solid transparent;
		border-radius: 3px;
		color: var(--text-muted);
		font: inherit;
		font-size: 0.58rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		transition: all 0.15s;
	}

	.camera-tab:hover {
		color: var(--text-secondary);
		background: rgba(255, 255, 255, 0.03);
	}

	.camera-tab.active {
		color: var(--text-primary);
		border-color: var(--accent);
		background: rgba(var(--accent-rgb), 0.08);
	}

	.tab-count {
		font-size: 0.5rem;
		opacity: 0.6;
	}

	.camera-grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.camera-card {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 4px;
		overflow: hidden;
		transition: all 0.2s ease;
	}

	.camera-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.3rem;
		padding: 0.3rem 0.5rem;
		width: 100%;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		color: inherit;
	}

	.camera-header:hover {
		background: rgba(255, 255, 255, 0.03);
	}

	.camera-name {
		font-size: 0.6rem;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.camera-location {
		font-size: 0.55rem;
		color: var(--text-secondary);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.camera-frame {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		background: #000;
		overflow: hidden;
	}

	.camera-card.expanded .camera-frame {
		aspect-ratio: 16 / 9;
		max-height: 400px;
	}

	.camera-img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		display: block;
	}

	.camera-embed {
		width: 100%;
		height: 100%;
		border: none;
	}

	.embed-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		color: var(--text-secondary);
		font-size: 0.6rem;
		cursor: pointer;
		background: rgba(255, 255, 255, 0.02);
		transition: background 0.15s;
	}

	.embed-placeholder:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.play-icon {
		font-size: 1.2rem;
		opacity: 0.5;
	}

	.camera-footer {
		padding: 0.2rem 0.5rem;
		display: flex;
		justify-content: flex-end;
	}

	.camera-source {
		font-size: 0.5rem;
		color: var(--text-secondary);
		opacity: 0.6;
	}

	.expand-link {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		color: var(--text-secondary);
		font: inherit;
		font-size: 0.65rem;
		font-weight: 500;
		cursor: pointer;
		padding: 0.25rem 0.5rem;
		margin-left: 0.25rem;
		transition: all 0.15s;
		white-space: nowrap;
	}

	.expand-link:hover {
		color: var(--text-primary);
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
	}

	@media (max-width: 768px) {
		.camera-grid {
			gap: 0.3rem;
		}
	}
</style>

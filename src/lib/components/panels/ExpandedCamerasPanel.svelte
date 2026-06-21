<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		CAMERAS,
		CAMERA_CATEGORIES,
		FIRE_SUB_REGIONS,
		type CameraCategory,
		type CameraConfig
	} from '$lib/config/cameras';
	import { settings } from '$lib/stores';

	type FilterTab = 'all' | CameraCategory;

	let activeFilter = $state<FilterTab>('all');
	let imageTimestamps = $state<Record<string, number>>({});
	let expandedCamera = $state<string | null>(null);
	let refreshTimers: ReturnType<typeof setInterval>[] = [];
	let containerEl = $state<HTMLDivElement | null>(null);
	let isVisible = $state(true);
	let observer: IntersectionObserver | null = null;

	const imageCameras = CAMERAS.filter((c) => c.type === 'image');

	const filterTabs: { id: FilterTab; label: string }[] = [
		{ id: 'all', label: 'All' },
		...CAMERA_CATEGORIES
	];

	const filteredCameras = $derived(
		activeFilter === 'all'
			? [...CAMERAS].sort((a, b) => {
					const catOrder = ['traffic', 'scenic', 'fire'];
					const catDiff = catOrder.indexOf(a.category) - catOrder.indexOf(b.category);
					if (catDiff !== 0) return catDiff;
					return a.order - b.order;
				})
			: CAMERAS.filter((c) => c.category === activeFilter).sort((a, b) => a.order - b.order)
	);

	// Group cameras for display
	interface CameraGroup {
		label: string;
		cameras: CameraConfig[];
	}

	const groupedCameras = $derived.by<CameraGroup[]>(() => {
		if (activeFilter === 'fire') {
			return FIRE_SUB_REGIONS.map((region) => ({
				label: region.label,
				cameras: filteredCameras.filter((c) => c.subRegion === region.id)
			})).filter((g) => g.cameras.length > 0);
		}

		if (activeFilter === 'all') {
			const groups: CameraGroup[] = [];
			for (const cat of CAMERA_CATEGORIES) {
				const cams = filteredCameras.filter((c) => c.category === cat.id);
				if (cams.length > 0) {
					if (cat.id === 'fire') {
						// Sub-group fire cameras by region
						for (const region of FIRE_SUB_REGIONS) {
							const regionCams = cams.filter((c) => c.subRegion === region.id);
							if (regionCams.length > 0) {
								groups.push({ label: `Fire — ${region.label}`, cameras: regionCams });
							}
						}
					} else {
						groups.push({ label: cat.label, cameras: cams });
					}
				}
			}
			return groups;
		}

		// Traffic or Scenic: flat list, single group
		const cat = CAMERA_CATEGORIES.find((c) => c.id === activeFilter);
		return [{ label: cat?.label ?? activeFilter, cameras: filteredCameras }];
	});

	function getCacheBustedUrl(camera: CameraConfig): string {
		const ts = imageTimestamps[camera.id] || Date.now();
		const sep = camera.url.includes('?') ? '&' : '?';
		return `${camera.url}${sep}_t=${ts}`;
	}

	function toggleExpand(cameraId: string) {
		expandedCamera = expandedCamera === cameraId ? null : cameraId;
	}

	function switchFilter(tab: FilterTab) {
		expandedCamera = null;
		activeFilter = tab;
	}

	function setupRefreshTimers() {
		clearRefreshTimers();
		for (const cam of imageCameras) {
			const interval = (cam.refreshInterval || 30) * 1000;
			const timer = setInterval(() => {
				if (!isVisible) return;
				if (activeFilter === 'all' || activeFilter === cam.category) {
					imageTimestamps = { ...imageTimestamps, [cam.id]: Date.now() };
				}
			}, interval);
			refreshTimers.push(timer);
		}
	}

	function clearRefreshTimers() {
		for (const timer of refreshTimers) {
			clearInterval(timer);
		}
		refreshTimers = [];
	}

	onMount(() => {
		// Initialize timestamps
		const initial: Record<string, number> = {};
		for (const cam of imageCameras) {
			initial[cam.id] = Date.now();
		}
		imageTimestamps = initial;

		setupRefreshTimers();

		// IntersectionObserver to pause refresh when scrolled out of view
		if (containerEl) {
			observer = new IntersectionObserver(
				([entry]) => {
					isVisible = entry.isIntersecting;
				},
				{ threshold: 0 }
			);
			observer.observe(containerEl);
		}
	});

	onDestroy(() => {
		clearRefreshTimers();
		if (observer) {
			observer.disconnect();
			observer = null;
		}
	});
</script>

<div class="expanded-cameras" bind:this={containerEl}>
	<div class="expanded-cameras-header">
		<div class="header-left">
			<h3 class="header-title">Camera Views</h3>
			<span class="header-count">{filteredCameras.length}</span>
		</div>

		<div class="filter-tabs">
			{#each filterTabs as tab (tab.id)}
				{@const count =
					tab.id === 'all' ? CAMERAS.length : CAMERAS.filter((c) => c.category === tab.id).length}
				<button
					class="filter-tab"
					class:active={activeFilter === tab.id}
					onclick={() => switchFilter(tab.id)}
				>
					{tab.label}
					<span class="tab-count">{count}</span>
				</button>
			{/each}
		</div>

		<button
			class="close-btn"
			onclick={() => settings.toggleCamerasExpanded()}
			aria-label="Close expanded cameras"
		>
			&times;
		</button>
	</div>

	<div class="expanded-cameras-body">
		{#each groupedCameras as group (group.label)}
			<div class="camera-group">
				<h4 class="group-label">{group.label}</h4>
				<div class="camera-grid">
					{#each group.cameras as camera (camera.id)}
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
			</div>
		{/each}
	</div>
</div>

<style>
	.expanded-cameras {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 4px;
		overflow: hidden;
	}

	.expanded-cameras-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 0.75rem;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.header-title {
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary);
		margin: 0;
	}

	.header-count {
		font-size: 0.65rem;
		font-weight: 500;
		color: var(--accent);
		background: rgba(var(--accent-rgb), 0.1);
		padding: 0.1rem 0.4rem;
		border-radius: 3px;
	}

	.filter-tabs {
		display: flex;
		gap: 0.25rem;
		flex: 1;
		justify-content: center;
	}

	.filter-tab {
		padding: 0.3rem 0.6rem;
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
		gap: 0.3rem;
		transition: all 0.15s;
	}

	.filter-tab:hover {
		color: var(--text-secondary);
		background: rgba(255, 255, 255, 0.03);
	}

	.filter-tab.active {
		color: var(--text-primary);
		border-color: var(--accent);
		background: rgba(var(--accent-rgb), 0.08);
	}

	.tab-count {
		font-size: 0.5rem;
		opacity: 0.6;
	}

	.close-btn {
		flex-shrink: 0;
		background: none;
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--text-muted);
		font-size: 1rem;
		line-height: 1;
		padding: 0.15rem 0.4rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.close-btn:hover {
		color: var(--text-primary);
		border-color: var(--text-secondary);
	}

	.expanded-cameras-body {
		padding: 0.5rem;
		max-height: 600px;
		overflow-y: auto;
	}

	.camera-group {
		margin-bottom: 0.75rem;
	}

	.camera-group:last-child {
		margin-bottom: 0;
	}

	.group-label {
		font-size: 0.58rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		margin: 0 0 0.4rem;
		padding-bottom: 0.25rem;
		border-bottom: 1px solid var(--border);
	}

	.camera-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
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
</style>

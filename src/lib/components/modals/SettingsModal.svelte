<script lang="ts">
	import Modal from './Modal.svelte';
	import { settings } from '$lib/stores';
	import { PANELS, type PanelId } from '$lib/config';
	import type { ThemeMode } from '$lib/stores/settings';
	import { LOCATION_PRESETS } from '$lib/config/locations';
	import { selectedTownObj } from '$lib/stores/town-filter';

	interface Props {
		open: boolean;
		onClose: () => void;
		onReconfigure?: () => void;
	}

	let { open = false, onClose, onReconfigure }: Props = $props();

	function handleTogglePanel(panelId: PanelId) {
		settings.togglePanel(panelId);
	}

	function handleResetPanels() {
		settings.reset();
	}

	function handleThemeChange(theme: ThemeMode) {
		settings.setTheme(theme);
	}

	function handleLocationChange(event: Event) {
		const select = event.target as HTMLSelectElement;
		settings.setLocation(select.value);
	}

	function handleScaleChange(event: Event) {
		const input = event.target as HTMLInputElement;
		settings.setUiScale(Number(input.value));
	}

	function handleResetScale() {
		settings.setUiScale(100);
	}
</script>

<Modal {open} title="Settings" {onClose}>
	<div class="settings-sections">
		<section class="settings-section">
			<h3 class="section-title">Enabled Panels</h3>
			<p class="section-desc">Toggle panels on/off to customize your dashboard</p>

			<div class="panels-grid">
				{#each Object.entries(PANELS) as [id, config]}
					{@const panelId = id as PanelId}
					{@const isEnabled = $settings.enabled[panelId]}
					<label class="panel-toggle" class:enabled={isEnabled}>
						<input
							type="checkbox"
							checked={isEnabled}
							onchange={() => handleTogglePanel(panelId)}
						/>
						<span class="panel-name">{config.name}</span>
						<span class="panel-priority">P{config.priority}</span>
					</label>
				{/each}
			</div>
		</section>

		<section class="settings-section">
			<h3 class="section-title">Default Location</h3>
			<p class="section-desc">Weather &amp; tide location when no town is selected</p>
			{#if $selectedTownObj}
				<p class="section-desc" style="color: var(--accent)">
					Currently viewing: {$selectedTownObj.name} (use town picker to clear)
				</p>
			{/if}
			<div class="location-select-wrap">
				<select
					class="location-select"
					value={$settings.locationId}
					onchange={handleLocationChange}
				>
					{#each LOCATION_PRESETS as loc}
						<option value={loc.id}>{loc.name}</option>
					{/each}
				</select>
				<div class="location-detail">
					Tide station: {LOCATION_PRESETS.find((l) => l.id === $settings.locationId)
						?.tideStationName ?? 'Point Reyes'}
				</div>
			</div>
		</section>

		<section class="settings-section">
			<h3 class="section-title">Appearance</h3>
			<p class="section-desc">Choose your preferred color theme</p>
			<div class="theme-toggle">
				<button
					class="theme-btn"
					class:active={$settings.theme === 'dark'}
					onclick={() => handleThemeChange('dark')}
				>
					Dark
				</button>
				<button
					class="theme-btn"
					class:active={$settings.theme === 'light'}
					onclick={() => handleThemeChange('light')}
				>
					Light
				</button>
			</div>

			<div class="scale-control">
				<div class="scale-header">
					<span class="scale-label">UI Scale</span>
					<span class="scale-value">{$settings.uiScale}%</span>
				</div>
				<div class="scale-row">
					<input
						type="range"
						min="50"
						max="150"
						step="5"
						value={$settings.uiScale}
						oninput={handleScaleChange}
						class="scale-slider"
					/>
					{#if $settings.uiScale !== 100}
						<button class="scale-reset" onclick={handleResetScale}>Reset</button>
					{/if}
				</div>
			</div>
		</section>

		<section class="settings-section">
			<h3 class="section-title">Dashboard</h3>
			{#if onReconfigure}
				<button class="reconfigure-btn" onclick={onReconfigure}> Reconfigure Dashboard </button>
				<p class="btn-hint">Choose a preset profile for your panels</p>
			{/if}
			<button class="reset-btn" onclick={handleResetPanels}> Reset All Settings </button>
		</section>
	</div>
</Modal>

<style>
	.settings-sections {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.settings-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.section-title {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-secondary);
		margin: 0;
	}

	.section-desc {
		font-size: 0.65rem;
		color: var(--text-muted);
		margin: 0;
	}

	.panels-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	.panel-toggle {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.6rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid var(--border);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.panel-toggle:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.panel-toggle.enabled {
		border-color: var(--accent);
		background: rgba(var(--accent-rgb), 0.1);
	}

	.panel-toggle input {
		accent-color: var(--accent);
	}

	.panel-name {
		flex: 1;
		font-size: 0.65rem;
		color: var(--text-primary);
	}

	.panel-priority {
		font-size: 0.5rem;
		color: var(--text-muted);
		background: rgba(255, 255, 255, 0.05);
		padding: 0.1rem 0.25rem;
		border-radius: 2px;
	}

	.location-select-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.location-select {
		width: 100%;
		padding: 0.45rem 0.6rem;
		font: inherit;
		font-size: 0.68rem;
		color: var(--text-primary);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid var(--border);
		border-radius: 4px;
		cursor: pointer;
		appearance: auto;
	}

	.location-select:focus {
		outline: 1px solid var(--accent);
		border-color: var(--accent);
	}

	.location-detail {
		font-size: 0.58rem;
		color: var(--text-muted);
	}

	.reconfigure-btn {
		padding: 0.5rem 1rem;
		background: rgba(0, 255, 136, 0.1);
		border: 1px solid rgba(0, 255, 136, 0.3);
		border-radius: 4px;
		color: var(--accent);
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.15s ease;
		margin-bottom: 0.25rem;
	}

	.theme-toggle {
		display: inline-flex;
		gap: 0.35rem;
		padding: 0.25rem;
		border: 1px solid var(--border);
		background: rgba(255, 255, 255, 0.02);
		border-radius: 6px;
		width: fit-content;
	}

	.theme-btn {
		padding: 0.35rem 0.7rem;
		border: 1px solid transparent;
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: 0.66rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.15s ease;
	}

	.theme-btn:hover {
		color: var(--text-primary);
	}

	.theme-btn.active {
		color: var(--text-primary);
		border-color: var(--accent);
		background: rgba(var(--accent-rgb), 0.12);
	}

	.scale-control {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-top: 0.5rem;
	}

	.scale-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.scale-label {
		font-size: 0.65rem;
		color: var(--text-secondary);
	}

	.scale-value {
		font-size: 0.65rem;
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
	}

	.scale-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.scale-slider {
		flex: 1;
		height: 4px;
		accent-color: var(--accent);
		cursor: pointer;
	}

	.scale-reset {
		padding: 0.2rem 0.45rem;
		border: 1px solid var(--border);
		background: rgba(255, 255, 255, 0.04);
		color: var(--text-secondary);
		font: inherit;
		font-size: 0.58rem;
		border-radius: 3px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.scale-reset:hover {
		color: var(--text-primary);
		border-color: var(--accent);
	}

	.reconfigure-btn:hover {
		background: rgba(0, 255, 136, 0.2);
	}

	.btn-hint {
		font-size: 0.6rem;
		color: var(--text-muted);
		margin: 0 0 0.75rem;
	}

	.reset-btn {
		padding: 0.5rem 1rem;
		background: rgba(255, 68, 68, 0.1);
		border: 1px solid rgba(255, 68, 68, 0.3);
		border-radius: 4px;
		color: var(--danger);
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.reset-btn:hover {
		background: rgba(255, 68, 68, 0.2);
	}
</style>

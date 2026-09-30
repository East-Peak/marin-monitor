<script lang="ts">
	import { tick } from 'svelte';
	import { settings, type ThemeMode } from '$lib/stores/settings';
	import { sectionPrefs } from '$lib/stores/section-prefs';
	import { LOCATION_PRESETS } from '$lib/config/locations';

	const SCALES = [50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];
	const THEMES: { mode: ThemeMode; label: string }[] = [
		{ mode: 'dark', label: 'Dark' },
		{ mode: 'light', label: 'Light' }
	];
	const menuId = 'v2-settings-menu';

	let { onreset }: { onreset?: () => void } = $props();

	let open = $state(false);
	let resetNotice = $state(false);
	let triggerEl = $state<HTMLButtonElement>();
	let panelEl = $state<HTMLDivElement>();

	// Keep a saved off-grid scale (the old slider stepped by 5) selectable.
	const scaleOptions = $derived(
		SCALES.includes($settings.uiScale)
			? SCALES
			: [...SCALES, $settings.uiScale].sort((a, b) => a - b)
	);

	async function toggle() {
		open = !open;
		resetNotice = false;
		if (open) {
			await tick();
			panelEl?.querySelector<HTMLElement>('select, input, button')?.focus();
		}
	}

	function close() {
		open = false;
		triggerEl?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	function resetSections() {
		sectionPrefs.reset();
		onreset?.();
		resetNotice = true;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="v2-settings">
	<button
		bind:this={triggerEl}
		type="button"
		class="v2-settings-trigger"
		aria-label="Dashboard settings"
		aria-haspopup="true"
		aria-expanded={open}
		aria-controls={open ? menuId : undefined}
		onclick={toggle}
	>
		⚙
	</button>

	{#if open}
		<div
			bind:this={panelEl}
			id={menuId}
			class="v2-settings-panel"
			role="group"
			aria-label="Dashboard settings"
		>
			<label class="row">
				<span>UI scale</span>
				<select
					value={$settings.uiScale}
					onchange={(e) => settings.setUiScale(Number(e.currentTarget.value))}
				>
					{#each scaleOptions as scale (scale)}
						<option value={scale}>{scale}%</option>
					{/each}
				</select>
			</label>

			<label class="row">
				<span>Default location</span>
				<select
					value={$settings.locationId}
					onchange={(e) => settings.setLocation(e.currentTarget.value)}
				>
					{#each LOCATION_PRESETS as loc (loc.id)}
						<option value={loc.id}>{loc.name}</option>
					{/each}
				</select>
			</label>

			<fieldset class="row">
				<legend>Theme</legend>
				{#each THEMES as theme (theme.mode)}
					<label class="choice">
						<input
							type="radio"
							name="v2-theme"
							value={theme.mode}
							checked={$settings.theme === theme.mode}
							onchange={() => settings.setTheme(theme.mode)}
						/>
						{theme.label}
					</label>
				{/each}
			</fieldset>

			<label class="row choice">
				<input
					type="checkbox"
					checked={!$settings.camerasHidden}
					onchange={() => settings.toggleCamerasHidden()}
				/>
				Show traffic cameras
			</label>

			<button type="button" class="reset" onclick={resetSections}>Reset sections</button>
			{#if resetNotice}
				<p class="notice" role="status">Sections reset to defaults.</p>
			{/if}
		</div>
	{/if}
</div>

<style>
	.v2-settings {
		position: relative;
	}
	.v2-settings-trigger {
		min-width: 2.25rem;
		min-height: 2.25rem;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		background: transparent;
		color: var(--text-primary);
		font-size: 17px;
		cursor: pointer;
	}
	.v2-settings-panel {
		position: absolute;
		right: 0;
		z-index: 50;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 16rem;
		margin-top: 0.5rem;
		padding: 0.875rem;
		border: 1px solid var(--border-light);
		border-radius: 8px;
		background: var(--bg);
		font-size: 14px;
		line-height: 1.4;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		border: 0;
	}
	.choice {
		flex-direction: row;
		align-items: center;
		gap: 0.5rem;
	}
	legend,
	.row > span {
		font-size: 12px;
		color: var(--text-muted);
	}
	select {
		font: inherit;
	}
	.reset {
		align-self: flex-start;
		padding: 0.375rem 0.75rem;
		border: 1px solid var(--border-light);
		border-radius: 6px;
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		cursor: pointer;
	}
	.notice {
		margin: 0;
		font-size: 12px;
		color: var(--text-muted);
	}
</style>

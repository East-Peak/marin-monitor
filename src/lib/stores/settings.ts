/**
 * Settings store - panel visibility, order, and sizes
 */

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';
import {
	DEFAULT_PANEL_ORDER,
	NON_DRAGGABLE_PANELS,
	PRESETS,
	ONBOARDING_STORAGE_KEY,
	PRESET_STORAGE_KEY,
	type PanelId
} from '$lib/config';
import { DEFAULT_LOCATION_ID, LOCATION_PRESETS } from '$lib/config/locations';
import { safeGetItem, safeSetItem, safeRemoveItem } from '$lib/utils/safe-storage';

// Storage keys
const STORAGE_KEYS = {
	panels: 'mm_panels',
	order: 'mm_panelOrder',
	sizes: 'mm_panelSizes',
	theme: 'mm_theme',
	location: 'mm_location',
	uiScale: 'mm_uiScale',
	dashboardExpanded: 'mm_dashExpanded',
	camerasExpanded: 'mm_camerasExpanded',
	camerasHidden: 'mm_camerasHidden'
} as const;

// Types
export type ThemeMode = 'dark' | 'light';

export interface PanelSettings {
	enabled: Record<PanelId, boolean>;
	order: PanelId[];
	sizes: Record<PanelId, { width?: number; height?: number }>;
	theme: ThemeMode;
	locationId: string;
	uiScale: number;
	dashboardExpanded: boolean;
	camerasExpanded: boolean;
	camerasHidden: boolean;
}

export interface SettingsState extends PanelSettings {
	initialized: boolean;
}

const knownPanelIds = new Set<PanelId>(DEFAULT_PANEL_ORDER);

function normalizePanelOrder(order?: PanelId[]): PanelId[] {
	const normalized: PanelId[] = [];
	const seen = new Set<PanelId>();

	for (const id of order ?? []) {
		if (!knownPanelIds.has(id) || seen.has(id)) continue;
		seen.add(id);
		normalized.push(id);
	}

	for (const id of DEFAULT_PANEL_ORDER) {
		if (seen.has(id)) continue;
		normalized.push(id);
	}

	return normalized;
}

// Default settings
function getDefaultSettings(): PanelSettings {
	return {
		enabled: Object.fromEntries(DEFAULT_PANEL_ORDER.map((id) => [id, true])) as Record<
			PanelId,
			boolean
		>,
		order: [...DEFAULT_PANEL_ORDER],
		sizes: {} as Record<PanelId, { width?: number; height?: number }>,
		theme: 'dark',
		locationId: DEFAULT_LOCATION_ID,
		uiScale: 100,
		dashboardExpanded: true,
		camerasExpanded: false,
		camerasHidden: false
	};
}

function parseJson(raw: string | null): unknown {
	if (raw === null) return undefined;
	try {
		return JSON.parse(raw);
	} catch {
		return undefined;
	}
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** setTheme has always written JSON ('"light"'); older values may be bare. Accept both. */
function parseTheme(raw: string | null): ThemeMode | undefined {
	const value = raw?.startsWith('"') ? parseJson(raw) : raw;
	return value === 'light' || value === 'dark' ? value : undefined;
}

// Load from localStorage. Each key is read and validated on its own, so one
// malformed value (e.g. corrupt mm_panels JSON) never discards the others.
function loadFromStorage(): Partial<PanelSettings> {
	if (!browser) return {};

	const enabled = parseJson(safeGetItem(STORAGE_KEYS.panels));
	const order = parseJson(safeGetItem(STORAGE_KEYS.order));
	const sizes = parseJson(safeGetItem(STORAGE_KEYS.sizes));
	const location = safeGetItem(STORAGE_KEYS.location);
	const uiScale = Number(safeGetItem(STORAGE_KEYS.uiScale) ?? Number.NaN);
	const dashRaw = safeGetItem(STORAGE_KEYS.dashboardExpanded);
	const camerasRaw = safeGetItem(STORAGE_KEYS.camerasExpanded);
	const camerasHiddenRaw = safeGetItem(STORAGE_KEYS.camerasHidden);

	return {
		enabled: isPlainObject(enabled) ? (enabled as Record<PanelId, boolean>) : undefined,
		order: Array.isArray(order) ? (order as PanelId[]) : undefined,
		sizes: isPlainObject(sizes) ? (sizes as PanelSettings['sizes']) : undefined,
		theme: parseTheme(safeGetItem(STORAGE_KEYS.theme)),
		locationId:
			location !== null && LOCATION_PRESETS.some((preset) => preset.id === location)
				? location
				: undefined,
		uiScale: uiScale >= 50 && uiScale <= 150 ? uiScale : undefined,
		dashboardExpanded: dashRaw !== null ? dashRaw !== 'false' : undefined,
		camerasExpanded: camerasRaw !== null ? camerasRaw === 'true' : undefined,
		camerasHidden: camerasHiddenRaw !== null ? camerasHiddenRaw === 'true' : undefined
	};
}

function applyTheme(theme: ThemeMode): void {
	if (!browser || typeof document === 'undefined') return;
	document.documentElement.setAttribute('data-theme', theme);
}

function applyUiScale(scale: number): void {
	if (!browser || typeof document === 'undefined') return;
	document.documentElement.style.zoom = scale === 100 ? '' : `${scale}%`;
}

// Save to localStorage
function saveToStorage(key: keyof typeof STORAGE_KEYS, value: unknown): void {
	if (!browser) return;
	safeSetItem(STORAGE_KEYS[key], JSON.stringify(value));
}

// Create the store
function createSettingsStore() {
	const defaults = getDefaultSettings();
	const saved = loadFromStorage();

	const initialState: SettingsState = {
		enabled: { ...defaults.enabled, ...saved.enabled },
		order: normalizePanelOrder(saved.order ?? defaults.order),
		sizes: { ...defaults.sizes, ...saved.sizes },
		theme: saved.theme ?? defaults.theme,
		locationId: saved.locationId ?? defaults.locationId,
		uiScale: saved.uiScale ?? defaults.uiScale,
		dashboardExpanded: saved.dashboardExpanded ?? defaults.dashboardExpanded,
		camerasExpanded: saved.camerasExpanded ?? defaults.camerasExpanded,
		camerasHidden: saved.camerasHidden ?? defaults.camerasHidden,
		initialized: false
	};

	const { subscribe, set, update } = writable<SettingsState>(initialState);
	applyTheme(initialState.theme);
	applyUiScale(initialState.uiScale);

	/** The dashboard's theme for this page view. Storage is only a best-effort copy. */
	let dashboardTheme: ThemeMode = initialState.theme;
	/** While a transient theme (e.g. TV) is active, the dashboard theme and storage are untouched. */
	let transientTheme = false;

	function showTheme(theme: ThemeMode) {
		if (!transientTheme) {
			dashboardTheme = theme;
			saveToStorage('theme', theme);
		}
		applyTheme(theme);
		update((state) => ({ ...state, theme }));
	}

	return {
		subscribe,

		/**
		 * Initialize store (call after hydration)
		 */
		init() {
			update((state) => ({ ...state, initialized: true }));
		},

		/**
		 * Check if a panel is enabled
		 */
		isPanelEnabled(panelId: PanelId): boolean {
			const state = get({ subscribe });
			return state.enabled[panelId] ?? true;
		},

		/**
		 * Toggle panel visibility
		 */
		togglePanel(panelId: PanelId) {
			update((state) => {
				const newEnabled = {
					...state.enabled,
					[panelId]: !state.enabled[panelId]
				};
				saveToStorage('panels', newEnabled);
				return { ...state, enabled: newEnabled };
			});
		},

		/**
		 * Enable a specific panel
		 */
		enablePanel(panelId: PanelId) {
			update((state) => {
				const newEnabled = { ...state.enabled, [panelId]: true };
				saveToStorage('panels', newEnabled);
				return { ...state, enabled: newEnabled };
			});
		},

		/**
		 * Disable a specific panel
		 */
		disablePanel(panelId: PanelId) {
			update((state) => {
				const newEnabled = { ...state.enabled, [panelId]: false };
				saveToStorage('panels', newEnabled);
				return { ...state, enabled: newEnabled };
			});
		},

		/**
		 * Update panel order (for drag-drop)
		 */
		updateOrder(newOrder: PanelId[]) {
			const normalizedOrder = normalizePanelOrder(newOrder);
			update((state) => {
				saveToStorage('order', normalizedOrder);
				return { ...state, order: normalizedOrder };
			});
		},

		/**
		 * Move a panel to a new position
		 */
		movePanel(panelId: PanelId, toIndex: number) {
			// Don't allow moving non-draggable panels
			if (NON_DRAGGABLE_PANELS.includes(panelId)) return;

			update((state) => {
				const currentIndex = state.order.indexOf(panelId);
				if (currentIndex === -1) return state;

				const newOrder = [...state.order];
				newOrder.splice(currentIndex, 1);
				newOrder.splice(toIndex, 0, panelId);

				const normalizedOrder = normalizePanelOrder(newOrder);
				saveToStorage('order', normalizedOrder);
				return { ...state, order: normalizedOrder };
			});
		},

		/**
		 * Update panel size
		 */
		updateSize(panelId: PanelId, size: { width?: number; height?: number }) {
			update((state) => {
				const newSizes = {
					...state.sizes,
					[panelId]: { ...state.sizes[panelId], ...size }
				};
				saveToStorage('sizes', newSizes);
				return { ...state, sizes: newSizes };
			});
		},

		/**
		 * Set light/dark theme
		 */
		setTheme(theme: ThemeMode) {
			showTheme(theme);
		},

		/**
		 * Toggle light/dark theme
		 */
		toggleTheme() {
			showTheme(get({ subscribe }).theme === 'dark' ? 'light' : 'dark');
		},

		/**
		 * Show `theme` without touching the dashboard theme or storage, for views that
		 * force their own look (the TV wallboard is always dark). Returns `end`, which
		 * restores the dashboard theme from memory. A reload or tab close without `end`
		 * leaves the saved theme intact (mirrors townFilter.beginTransientScope).
		 */
		beginTransientTheme(theme: ThemeMode): () => void {
			transientTheme = true;
			showTheme(theme);
			let ended = false;
			return () => {
				if (ended) return;
				ended = true;
				transientTheme = false;
				applyTheme(dashboardTheme);
				update((state) => ({ ...state, theme: dashboardTheme }));
			};
		},

		/**
		 * Set the UI zoom level (50–150%)
		 */
		setUiScale(scale: number) {
			const clamped = Math.max(50, Math.min(150, Math.round(scale)));
			update((state) => {
				safeSetItem(STORAGE_KEYS.uiScale, String(clamped));
				applyUiScale(clamped);
				return { ...state, uiScale: clamped };
			});
		},

		/**
		 * Toggle the dashboard (signal deck) visibility
		 */
		toggleDashboard() {
			update((state) => {
				const expanded = !state.dashboardExpanded;
				safeSetItem(STORAGE_KEYS.dashboardExpanded, String(expanded));
				return { ...state, dashboardExpanded: expanded };
			});
		},

		/**
		 * Toggle the expanded cameras panel
		 */
		toggleCamerasExpanded() {
			update((state) => {
				const expanded = !state.camerasExpanded;
				safeSetItem(STORAGE_KEYS.camerasExpanded, String(expanded));
				// Unhide cameras when expanding
				if (expanded && state.camerasHidden) {
					safeSetItem(STORAGE_KEYS.camerasHidden, 'false');
					return { ...state, camerasExpanded: expanded, camerasHidden: false };
				}
				return { ...state, camerasExpanded: expanded };
			});
		},

		/**
		 * Toggle the cameras sidebar visibility (hide/show)
		 */
		toggleCamerasHidden() {
			update((state) => {
				const hidden = !state.camerasHidden;
				safeSetItem(STORAGE_KEYS.camerasHidden, String(hidden));
				// Also collapse expanded view when hiding
				if (hidden && state.camerasExpanded) {
					safeSetItem(STORAGE_KEYS.camerasExpanded, 'false');
					return { ...state, camerasHidden: hidden, camerasExpanded: false };
				}
				return { ...state, camerasHidden: hidden };
			});
		},

		/**
		 * Set the user's preferred location
		 */
		setLocation(locationId: string) {
			update((state) => {
				safeSetItem(STORAGE_KEYS.location, locationId);
				return { ...state, locationId };
			});
		},

		/**
		 * Reset all settings to defaults
		 */
		reset() {
			const defaults = getDefaultSettings();
			if (browser) {
				for (const key of Object.values(STORAGE_KEYS)) safeRemoveItem(key);
			}
			dashboardTheme = defaults.theme;
			applyTheme(defaults.theme);
			applyUiScale(defaults.uiScale);
			set({ ...defaults, initialized: true });
		},

		/**
		 * Get panel size
		 */
		getPanelSize(panelId: PanelId): { width?: number; height?: number } | undefined {
			const state = get({ subscribe });
			return state.sizes[panelId];
		},

		/**
		 * Check if onboarding is complete
		 */
		isOnboardingComplete(): boolean {
			if (!browser) return true;
			return safeGetItem(ONBOARDING_STORAGE_KEY) === 'true';
		},

		/**
		 * Get selected preset
		 */
		getSelectedPreset(): string | null {
			if (!browser) return null;
			return safeGetItem(PRESET_STORAGE_KEY);
		},

		/**
		 * Apply a preset configuration
		 */
		applyPreset(presetId: string) {
			const preset = PRESETS[presetId];
			if (!preset) {
				console.error('Unknown preset:', presetId);
				return;
			}

			// Build panel settings - disable all panels first, then enable preset panels
			const newEnabled = Object.fromEntries(
				DEFAULT_PANEL_ORDER.map((id) => [id, preset.panels.includes(id)])
			) as Record<PanelId, boolean>;

			update((state) => {
				const normalizedOrder = normalizePanelOrder(state.order);
				saveToStorage('panels', newEnabled);
				saveToStorage('order', normalizedOrder);
				return { ...state, enabled: newEnabled, order: normalizedOrder };
			});

			// Mark onboarding complete and save preset
			if (browser) {
				safeSetItem(ONBOARDING_STORAGE_KEY, 'true');
				safeSetItem(PRESET_STORAGE_KEY, presetId);
			}
		},

		/**
		 * Reset onboarding to show modal again
		 */
		resetOnboarding() {
			safeRemoveItem(ONBOARDING_STORAGE_KEY);
			safeRemoveItem(PRESET_STORAGE_KEY);
		}
	};
}

// Export singleton store
export const settings = createSettingsStore();

// Derived stores for convenience
export const enabledPanels = derived(settings, ($settings) =>
	$settings.order.filter((id) => $settings.enabled[id])
);

export const disabledPanels = derived(settings, ($settings) =>
	$settings.order.filter((id) => !$settings.enabled[id])
);

export const draggablePanels = derived(enabledPanels, ($enabled) =>
	$enabled.filter((id) => !NON_DRAGGABLE_PANELS.includes(id))
);

export const currentLocationId = derived(settings, ($s) => $s.locationId);

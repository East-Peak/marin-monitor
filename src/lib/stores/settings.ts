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
import { DEFAULT_LOCATION_ID } from '$lib/config/locations';

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

// Load from localStorage
function loadFromStorage(): Partial<PanelSettings> {
	if (!browser) return {};

	try {
		const panels = localStorage.getItem(STORAGE_KEYS.panels);
		const order = localStorage.getItem(STORAGE_KEYS.order);
		const sizes = localStorage.getItem(STORAGE_KEYS.sizes);
		const theme = localStorage.getItem(STORAGE_KEYS.theme);

		const location = localStorage.getItem(STORAGE_KEYS.location);
		const uiScaleRaw = localStorage.getItem(STORAGE_KEYS.uiScale);
		const uiScale = uiScaleRaw ? Number(uiScaleRaw) : undefined;
		const dashRaw = localStorage.getItem(STORAGE_KEYS.dashboardExpanded);
		const camerasRaw = localStorage.getItem(STORAGE_KEYS.camerasExpanded);
		const camerasHiddenRaw = localStorage.getItem(STORAGE_KEYS.camerasHidden);

		return {
			enabled: panels ? JSON.parse(panels) : undefined,
			order: order ? JSON.parse(order) : undefined,
			sizes: sizes ? JSON.parse(sizes) : undefined,
			theme: theme === 'light' || theme === 'dark' ? theme : undefined,
			locationId: location ?? undefined,
			uiScale: uiScale && uiScale >= 50 && uiScale <= 150 ? uiScale : undefined,
			dashboardExpanded: dashRaw !== null ? dashRaw !== 'false' : undefined,
			camerasExpanded: camerasRaw !== null ? camerasRaw === 'true' : undefined,
			camerasHidden: camerasHiddenRaw !== null ? camerasHiddenRaw === 'true' : undefined
		};
	} catch (e) {
		console.warn('Failed to load settings from localStorage:', e);
		return {};
	}
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

	try {
		localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value));
	} catch (e) {
		console.warn(`Failed to save ${key} to localStorage:`, e);
	}
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
			update((state) => {
				saveToStorage('theme', theme);
				applyTheme(theme);
				return { ...state, theme };
			});
		},

		/**
		 * Toggle light/dark theme
		 */
		toggleTheme() {
			update((state) => {
				const theme: ThemeMode = state.theme === 'dark' ? 'light' : 'dark';
				saveToStorage('theme', theme);
				applyTheme(theme);
				return { ...state, theme };
			});
		},

		/**
		 * Set the UI zoom level (50–150%)
		 */
		setUiScale(scale: number) {
			const clamped = Math.max(50, Math.min(150, Math.round(scale)));
			update((state) => {
				if (browser) {
					localStorage.setItem(STORAGE_KEYS.uiScale, String(clamped));
				}
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
				if (browser) {
					localStorage.setItem(STORAGE_KEYS.dashboardExpanded, String(expanded));
				}
				return { ...state, dashboardExpanded: expanded };
			});
		},

		/**
		 * Toggle the expanded cameras panel
		 */
		toggleCamerasExpanded() {
			update((state) => {
				const expanded = !state.camerasExpanded;
				if (browser) {
					localStorage.setItem(STORAGE_KEYS.camerasExpanded, String(expanded));
				}
				// Unhide cameras when expanding
				if (expanded && state.camerasHidden) {
					localStorage.setItem(STORAGE_KEYS.camerasHidden, 'false');
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
				if (browser) {
					localStorage.setItem(STORAGE_KEYS.camerasHidden, String(hidden));
				}
				// Also collapse expanded view when hiding
				if (hidden && state.camerasExpanded) {
					localStorage.setItem(STORAGE_KEYS.camerasExpanded, 'false');
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
				if (browser) {
					localStorage.setItem(STORAGE_KEYS.location, locationId);
				}
				return { ...state, locationId };
			});
		},

		/**
		 * Reset all settings to defaults
		 */
		reset() {
			const defaults = getDefaultSettings();
			if (browser) {
				localStorage.removeItem(STORAGE_KEYS.panels);
				localStorage.removeItem(STORAGE_KEYS.order);
				localStorage.removeItem(STORAGE_KEYS.sizes);
				localStorage.removeItem(STORAGE_KEYS.theme);
				localStorage.removeItem(STORAGE_KEYS.location);
				localStorage.removeItem(STORAGE_KEYS.uiScale);
				localStorage.removeItem(STORAGE_KEYS.dashboardExpanded);
				localStorage.removeItem(STORAGE_KEYS.camerasExpanded);
				localStorage.removeItem(STORAGE_KEYS.camerasHidden);
			}
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
			return localStorage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
		},

		/**
		 * Get selected preset
		 */
		getSelectedPreset(): string | null {
			if (!browser) return null;
			return localStorage.getItem(PRESET_STORAGE_KEY);
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
				localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
				localStorage.setItem(PRESET_STORAGE_KEY, presetId);
			}
		},

		/**
		 * Reset onboarding to show modal again
		 */
		resetOnboarding() {
			if (browser) {
				localStorage.removeItem(ONBOARDING_STORAGE_KEY);
				localStorage.removeItem(PRESET_STORAGE_KEY);
			}
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

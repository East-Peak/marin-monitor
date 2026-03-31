/**
 * Onboarding presets for first-time users
 */

import { DEFAULT_PANEL_ORDER, type PanelId } from './panels';

export interface Preset {
	id: string;
	name: string;
	icon: string;
	description: string;
	panels: PanelId[];
}

export const PRESETS: Record<string, Preset> = {
	essentials: {
		id: 'essentials',
		name: 'Essentials',
		icon: 'M',
		description: 'Map, local wire, and pulse — the basics',
		panels: ['map', 'pulse', 'local-wire', 'safety']
	},
	'safety-first': {
		id: 'safety-first',
		name: 'Safety First',
		icon: '!',
		description: 'Fire alerts, weather, road closures, and emergency info',
		panels: [
			'map',
			'pulse',
			'safety',
			'weather',
			'cameras',
			'local-wire',
			'conditions',
			'airport-status',
			'wastewater'
		]
	},
	'local-nerd': {
		id: 'local-nerd',
		name: 'Local Nerd',
		icon: '#',
		description: 'All the civic data, meetings, and housing numbers',
		panels: [
			'map',
			'pulse',
			'local-wire',
			'civic',
			'housing',
			'gas-prices',
			'ev-charging',
			'correlation',
			'narrative'
		]
	},
	outdoor: {
		id: 'outdoor',
		name: 'Trail & Tide',
		icon: '^',
		description: 'Weather, tides, trails, and outdoor conditions',
		panels: ['map', 'pulse', 'weather', 'cameras', 'outdoors', 'conditions', 'safety']
	},
	everything: {
		id: 'everything',
		name: 'Everything',
		icon: '*',
		description: 'All panels enabled — the full Marin experience',
		panels: DEFAULT_PANEL_ORDER
	}
};

export const PRESET_ORDER = ['essentials', 'safety-first', 'local-nerd', 'outdoor', 'everything'];

// Storage keys
export const ONBOARDING_STORAGE_KEY = 'mm_onboardingComplete';
export const PRESET_STORAGE_KEY = 'mm_selectedPreset';

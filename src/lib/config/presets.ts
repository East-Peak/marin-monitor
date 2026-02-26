/**
 * Onboarding presets for first-time users
 */

import type { PanelId } from './panels';

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
		panels: ['map', 'pulse', 'safety', 'weather', 'local-wire']
	},
	'local-nerd': {
		id: 'local-nerd',
		name: 'Local Nerd',
		icon: '#',
		description: 'All the civic data, meetings, and housing numbers',
		panels: ['map', 'pulse', 'local-wire', 'civic', 'housing', 'correlation', 'narrative']
	},
	outdoor: {
		id: 'outdoor',
		name: 'Trail & Tide',
		icon: '^',
		description: 'Weather, tides, trails, and outdoor conditions',
		panels: ['map', 'pulse', 'weather', 'outdoors', 'safety']
	},
	everything: {
		id: 'everything',
		name: 'Everything',
		icon: '*',
		description: 'All panels enabled — the full Marin experience',
		panels: [
			'map', 'pulse', 'local-wire', 'safety', 'weather',
			'civic', 'outdoors', 'housing', 'monitors',
			'correlation', 'narrative', 'satire'
		]
	}
};

export const PRESET_ORDER = ['essentials', 'safety-first', 'local-nerd', 'outdoor', 'everything'];

// Storage keys
export const ONBOARDING_STORAGE_KEY = 'mm_onboardingComplete';
export const PRESET_STORAGE_KEY = 'mm_selectedPreset';

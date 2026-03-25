import type { PanelId } from '$lib/config';
import type { NewsCategory } from '$lib/types';

export const WIRE_COLUMNS: { panelId: PanelId; category: NewsCategory; title: string }[] = [
	{ panelId: 'local-wire', category: 'local', title: 'Local Wire' },
	{ panelId: 'safety', category: 'safety', title: 'Crime & Safety' },
	{ panelId: 'civic', category: 'civic', title: 'Civic' },
	{ panelId: 'outdoors', category: 'outdoors', title: 'Outdoors & Lifestyle' },
	{ panelId: 'satire', category: 'satire', title: 'Marin Lately (satire)' },
	{ panelId: 'cycling', category: 'cycling', title: 'Cycling & Endurance' },
	{ panelId: 'shows', category: 'shows', title: 'Shows & Events' },
	{ panelId: 'prep', category: 'prep', title: 'Sports & Prep' },
	{ panelId: 'farm', category: 'farm', title: 'Farm & Market' }
];

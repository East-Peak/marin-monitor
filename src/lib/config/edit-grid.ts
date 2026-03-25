export type EditableTileId =
	| 'map'
	| 'cameras'
	| 'pulse'
	| 'narrative'
	| 'weather'
	| 'tides'
	| 'housing'
	| 'forecast'
	| 'pattern'
	| 'surf'
	| 'marine';

export type TileLayout = {
	x: number;
	y: number;
	w: number;
	h: number;
};

export type TileDefinition = {
	id: EditableTileId;
	title: string;
	visible: boolean;
};

export const EDIT_LAYOUT_KEY = 'marin-monitor:layout-edit:v1';
export const EDIT_GRID_COLUMNS = 12;
export const EDIT_GRID_ROWS = 18;
export const EDIT_ROW_HEIGHT = 72;
export const EDIT_GAP = 8;

export const DEFAULT_EDIT_LAYOUT: Record<EditableTileId, TileLayout> = {
	map: { x: 1, y: 1, w: 9, h: 4 },
	cameras: { x: 10, y: 1, w: 3, h: 4 },
	pulse: { x: 1, y: 5, w: 3, h: 3 },
	narrative: { x: 1, y: 8, w: 3, h: 5 },
	weather: { x: 4, y: 5, w: 5, h: 4 },
	housing: { x: 9, y: 5, w: 4, h: 4 },
	tides: { x: 9, y: 9, w: 4, h: 4 },
	pattern: { x: 1, y: 13, w: 3, h: 3 },
	forecast: { x: 4, y: 9, w: 5, h: 4 },
	surf: { x: 4, y: 13, w: 2, h: 3 },
	marine: { x: 9, y: 13, w: 4, h: 3 }
};

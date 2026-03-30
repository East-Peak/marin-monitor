export type MapFeatureKind =
	| 'landmark'
	| 'fire-zone'
	| 'traffic-event'
	| 'earthquake'
	| 'fire-incident'
	| 'gas-station'
	| 'ev-charging-station'
	| 'coffee-shop'
	| 'fitness-studio'
	| 'airport';

export interface MapFeatureInspectorData {
	kind: MapFeatureKind;
	title: string;
	subtitle?: string;
	description?: string;
	severity?: string;
	source?: string;
}

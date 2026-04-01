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
	| 'airport'
	| '311-report';

export interface MapFeatureInspectorData {
	kind: MapFeatureKind;
	title: string;
	subtitle?: string;
	description?: string;
	severity?: string;
	source?: string;
	imageUrl?: string;
}

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
	| '311-report'
	| 'camera'
	| 'show-venue'
	| 'blotter-town'
	| 'story-place';

export interface MapFeatureInspectorData {
	kind: MapFeatureKind;
	title: string;
	subtitle?: string;
	description?: string;
	severity?: string;
	source?: string;
	imageUrl?: string;
	/** The item a feature stands for (owner-driven maps look up their own provenance by it). */
	itemId?: string;
	/** An owner's provenance line, e.g. "Kept from 7:40 AM · HTTP 503". Legacy passes none. */
	note?: string;
}

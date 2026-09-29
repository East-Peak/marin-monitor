/**
 * Controlled vocabularies for the public projection (spec Decision 3),
 * hand-curated from the 2026-09-09 and 2026-09-16 bulletins.
 *
 * - A call type is published only when its normalized spelling is in
 *   CALL_TYPES. Person-centered or generic types that can hide a sensitive
 *   situation are deliberately absent: Meet the Citizen, Citizen Assist, Any
 *   civil problem, With Subjects, Unwanted Subject, Attempt to Contact,
 *   Miscellaneous Service, Medical Aid, Threats, Assault, Restraining Order
 *   Violation, Drug Violation, Public Intoxication — and broad incident types
 *   that can hide a domestic or psychiatric call (Disturbance, Suspicious
 *   Circumstances, Trespassing, 911 hang-ups, Assist Outside Agency). Adding
 *   one is an explicit decision, never a fallback.
 * - SUPPRESSED withholds regardless of the allowlist, matched on the
 *   normalized call type and disposition.
 * - Dispositions map to a category; the raw text is never published.
 */

const CALL_TYPES = new Map<string, string>(
	Object.entries({
		'abandoned vehicle': 'Abandoned Vehicle',
		alarm: 'Alarm',
		'animal complaint/problem misc': 'Animal Complaint',
		'barking dog': 'Barking Dog',
		'bicycle traffic stop': 'Bicycle Traffic Stop',
		'chalking for parking enforcement': 'Parking Enforcement',
		'cite sign off': 'Citation Sign-Off',
		fingerprinting: 'Fingerprinting',
		fireworks: 'Fireworks',
		footbeat: 'Foot Patrol',
		'found property': 'Found Property',
		'fraud - id theft / checks': 'Fraud',
		'generic fire call/not specified': 'Fire Call',
		hazard: 'Hazard',
		'hit & run property damage only': 'Hit and Run (Property Damage)',
		'lost/stolen': 'Lost/Stolen',
		'nighttime hill extra patrol': 'Hill Extra Patrol',
		'noise complaint': 'Noise Complaint',
		'open door': 'Open Door',
		'open window': 'Open Window',
		'parking complaint': 'Parking Complaint',
		'power outage': 'Power Outage',
		'suspicious vehicle': 'Suspicious Vehicle',
		theft: 'Theft',
		'town code violation': 'Town Code Violation',
		'traffic complaint / problem': 'Traffic Complaint',
		'traffic hazard': 'Traffic Hazard',
		vandalism: 'Vandalism',
		'vehicle accident - no details': 'Vehicle Accident',
		'vehicle accident - non injury': 'Vehicle Accident (Non-Injury)',
		'vehicle impound': 'Vehicle Impound',
		'vehicle release': 'Vehicle Release',
		'water main / hydrant problem': 'Water Main / Hydrant Problem'
	})
);

export const PUBLIC_CALL_TYPES: readonly string[] = Object.freeze([
	...new Set(CALL_TYPES.values())
]);

/** Welfare, psychiatric/5150/crisis, medical, juvenile, sexual, domestic, suicide, death, missing person. */
const SUPPRESSED =
	/welfare|wellness|5150|psych|mental|crisis|danger to (self|others)|gravely disabled|self[- ]?harm|overdose|medical|juvenile|minor|runaway|child|parent|guardian|sexual|rape|lewd|indecent|domestic|\bdv\b|suicid|dead body|death|deceased|coroner|missing person/i;

export type DispositionCategory =
	| 'Arrest Made'
	| 'Citation'
	| 'Warning'
	| 'Report Taken'
	| 'Service Provided'
	| 'Advice Given'
	| 'Handled by Phone'
	| 'Extra Patrol'
	| 'Log Entry Only'
	| 'Unable to Locate'
	| 'False Alarm'
	| 'Assisted Other Agency'
	| 'Vehicle Towed'
	| 'Cancelled'
	| 'Other';

const DISPOSITIONS = new Map<string, DispositionCategory>(
	Object.entries({
		'advice given': 'Advice Given',
		'alarm - false or unk reason for activation': 'False Alarm',
		'arrest made': 'Arrest Made',
		'citation issued': 'Citation',
		'counter report': 'Report Taken',
		'extra patrol': 'Extra Patrol',
		'goa/utl': 'Unable to Locate',
		'handled by phone': 'Handled by Phone',
		'log entry only': 'Log Entry Only',
		'outside assist': 'Assisted Other Agency',
		'report taken': 'Report Taken',
		'response canceled': 'Cancelled',
		'responsibles advised of complaint': 'Advice Given',
		'service provided': 'Service Provided',
		'vehicle booted/towed': 'Vehicle Towed',
		'verbal warning': 'Warning'
	} satisfies Record<string, DispositionCategory>)
);

export function normalizeText(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

export type Classification =
	| { publish: true; callType: string; dispositionCategory: DispositionCategory }
	| { publish: false };

/** Every check reads the same normalized text the double-read comparison compares. */
export function classifyIncident(callType: string, disposition: string): Classification {
	const type = normalizeText(callType).toLowerCase();
	const outcome = normalizeText(disposition).toLowerCase();
	if (SUPPRESSED.test(type) || SUPPRESSED.test(outcome)) return { publish: false };
	const label = CALL_TYPES.get(type);
	if (!label) return { publish: false };
	return {
		publish: true,
		callType: label,
		dispositionCategory: DISPOSITIONS.get(outcome) ?? 'Other'
	};
}

/**
 * The public projection (spec Decision 3): a bulletin envelope built field by
 * field from a validated read. Never spread an extraction into it — no
 * location, narrative or raw disposition text may reach a published string.
 */
import type { ValidBulletin } from './validate';
import { classifyIncident, type DispositionCategory } from './vocabulary';

export interface BulletinSource {
	docId: number;
	/** PDF md5 (hex) — the content revision. */
	revision: string;
	bulletinUrl: string;
}

export interface PublicIncident {
	incidentNo: string;
	reportedDate: string;
	time: string;
	callType: string;
	dispositionCategory: DispositionCategory;
	officerInitiated: boolean;
}

export interface BulletinEnvelope {
	docId: number;
	revision: string;
	bulletinRange: { start: string; end: string };
	bulletinUrl: string;
	/** A processed bulletin, even when every incident is withheld. */
	status: 'published';
	incidents: PublicIncident[];
	/** Suppressed, unclassified or not-allowlisted incidents: counted, never shown. */
	withheldCount: number;
}

export function buildEnvelope(bulletin: ValidBulletin, source: BulletinSource): BulletinEnvelope {
	const incidents: PublicIncident[] = [];
	for (const incident of bulletin.incidents) {
		const classified = classifyIncident(incident.callType, incident.disposition);
		if (!classified.publish) continue;
		incidents.push({
			incidentNo: incident.incidentNo,
			reportedDate: incident.reportedDate,
			time: incident.time,
			callType: classified.callType,
			dispositionCategory: classified.dispositionCategory,
			officerInitiated: incident.officerInitiated
		});
	}
	return {
		docId: source.docId,
		revision: source.revision,
		bulletinRange: { start: bulletin.range.start, end: bulletin.range.end },
		bulletinUrl: source.bulletinUrl,
		status: 'published',
		incidents,
		withheldCount: bulletin.incidents.length - incidents.length
	};
}

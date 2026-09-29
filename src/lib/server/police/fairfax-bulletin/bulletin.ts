/**
 * One bulletin, read twice (spec Decision 2): publish only when both reads
 * validate and agree on the header range and on every incident's published
 * inputs. Agreement resists fabrication and misreads; two reads by one model
 * are not independent evidence of completeness (accepted residual risk).
 */
import { buildEnvelope, type BulletinEnvelope, type BulletinSource } from './projection';
import { validateExtraction, type ValidBulletin } from './validate';
import { normalizeText } from './vocabulary';

export type BulletinOutcome =
	| { ok: true; envelope: BulletinEnvelope }
	| { ok: false; errors: string[] };

const COMPARED = ['time', 'callType', 'disposition', 'officerInitiated'] as const;

function differences(a: ValidBulletin, b: ValidBulletin): string[] {
	const errors: string[] = [];
	if (a.range.start !== b.range.start || a.range.end !== b.range.end) {
		errors.push(`reads disagree on the header range`);
	}
	const byNo = new Map(b.incidents.map((incident) => [incident.incidentNo, incident]));
	for (const left of a.incidents) {
		const right = byNo.get(left.incidentNo);
		byNo.delete(left.incidentNo);
		if (!right) {
			errors.push(`${left.incidentNo} appears in only one read`);
			continue;
		}
		for (const field of COMPARED) {
			const [x, y] = [left[field], right[field]].map((v) =>
				typeof v === 'string' ? normalizeText(v) : v
			);
			if (x !== y) errors.push(`${left.incidentNo}: reads disagree on ${field}`);
		}
	}
	for (const incidentNo of byNo.keys()) errors.push(`${incidentNo} appears in only one read`);
	return errors;
}

export function processBulletin(
	reads: [unknown, unknown],
	ctx: { pageCount: number; wpTitle?: string },
	source: BulletinSource
): BulletinOutcome {
	const [a, b] = reads.map((read) => validateExtraction(read, ctx));
	const errors = [a, b].flatMap((result, index) =>
		result.ok ? [] : result.errors.map((error) => `read ${index + 1}: ${error}`)
	);
	if (!a.ok || !b.ok) return { ok: false, errors };
	const disagreements = differences(a.bulletin, b.bulletin);
	if (disagreements.length > 0) return { ok: false, errors: disagreements };
	return { ok: true, envelope: buildEnvelope(a.bulletin, source) };
}

/**
 * Test fixtures: hand-verified transcriptions of real bulletins (TSV, one
 * incident per line — no locations or narratives, see __fixtures__/README.md)
 * and builders for synthetic extractions.
 */
import { readFileSync } from 'node:fs';
import type { BulletinExtraction, ExtractionIncident } from './schema';

const FIXTURES = 'src/lib/server/police/fairfax-bulletin/__fixtures__';

export interface Transcription {
	extraction: BulletinExtraction;
	pageCount: number;
}

export function loadTranscription(name: string): Transcription {
	const [header, ...rows] = readFileSync(`${FIXTURES}/${name}.tsv`, 'utf8')
		.split('\n')
		.filter((line) => line.trim() !== '');
	const [, rangeStart, rangeEnd, issued, pages] = header.split('\t');
	const incidents = rows.map((row) => {
		const [incidentNo, time, callType, officerInitiated, disposition, startPage, endPage] =
			row.split('\t');
		return {
			incidentNo,
			time,
			callType,
			officerInitiated: officerInitiated === 'true',
			disposition,
			startPage: Number(startPage),
			endPage: Number(endPage)
		};
	});
	return { extraction: { rangeStart, rangeEnd, issued, incidents }, pageCount: Number(pages) };
}

export function incident(overrides: Partial<ExtractionIncident> = {}): ExtractionIncident {
	return {
		incidentNo: '2609160009',
		time: '07:56',
		callType: 'Lost/Stolen',
		officerInitiated: false,
		disposition: 'Log Entry Only',
		startPage: 1,
		endPage: 1,
		...overrides
	};
}

export function extraction(
	incidents: ExtractionIncident[] = [incident()],
	overrides: Partial<BulletinExtraction> = {}
): BulletinExtraction {
	return {
		rangeStart: '09/16/2026',
		rangeEnd: '09/22/2026',
		issued: '09/23/2026',
		incidents,
		...overrides
	};
}

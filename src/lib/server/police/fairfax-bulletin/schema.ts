/**
 * What the extractor is asked to return for one bulletin: a literal
 * transcription, validated and projected before anything is published.
 * Deliberately has no location or narrative fields (spec Decision 3).
 */
import { z } from 'zod';

const incidentSchema = z.object({
	incidentNo: z.string().describe('The 10-digit incident number, e.g. 2609160009'),
	time: z.string().describe('HH:MM, 24-hour, as printed'),
	callType: z.string().describe('The call type exactly as printed'),
	officerInitiated: z.boolean().describe('True when the entry begins "Officer initiated activity"'),
	disposition: z.string().describe('The text after "Disposition:", joined across line breaks'),
	startPage: z.number().int().describe('1-based page holding the entry header'),
	endPage: z.number().int().describe('1-based page holding the disposition')
});

export const bulletinExtractionSchema = z.object({
	rangeStart: z.string().describe('Header range start, MM/DD/YYYY'),
	rangeEnd: z.string().describe('Header range end, MM/DD/YYYY'),
	issued: z.string().describe('Issued date at the top right, MM/DD/YYYY'),
	incidents: z.array(incidentSchema).describe('Every incident, in document order')
});

export type ExtractionIncident = z.infer<typeof incidentSchema>;
export type BulletinExtraction = z.infer<typeof bulletinExtractionSchema>;

import { describe, expect, it } from 'vitest';
import { buildEnvelope } from './projection';
import { extraction, incident, loadTranscription } from './fixtures';
import { validateExtraction, type ValidBulletin } from './validate';
import { PUBLIC_CALL_TYPES } from './vocabulary';

const source = {
	docId: 42429,
	revision: 'ed6499205ab87dfae05044825b13b66e',
	bulletinUrl: 'https://storage.googleapis.com/proudcity/fairfaxca/2026/09/bulletin.pdf'
};

function valid(input: unknown): ValidBulletin {
	const result = validateExtraction(input, { pageCount: 8 });
	if (!result.ok) throw new Error(result.errors.join('; '));
	return result.bulletin;
}

function numbered(overrides: Parameters<typeof incident>[0][]) {
	return overrides.map((o, i) => incident({ incidentNo: `26091600${10 + i}`, ...o }));
}

// Independently counted from the TSVs with the allowlist's call types.
const SPLIT_0916 = { published: 66, withheld: 58 };
const SPLIT_0909 = { published: 77, withheld: 47 };

const ENVELOPE_KEYS = [
	'bulletinRange',
	'bulletinUrl',
	'docId',
	'incidents',
	'revision',
	'status',
	'withheldCount'
];
const INCIDENT_KEYS = [
	'callType',
	'dispositionCategory',
	'incidentNo',
	'officerInitiated',
	'reportedDate',
	'time'
];

describe('buildEnvelope — public projection', () => {
	it('publishes only the public keys', () => {
		const envelope = buildEnvelope(valid(extraction()), source);
		expect(Object.keys(envelope).sort()).toEqual(ENVELOPE_KEYS);
		expect(Object.keys(envelope.incidents[0]).sort()).toEqual(INCIDENT_KEYS);
		expect(envelope).toMatchObject({
			docId: 42429,
			revision: source.revision,
			bulletinUrl: source.bulletinUrl,
			bulletinRange: { start: '2026-09-16', end: '2026-09-22' },
			status: 'published'
		});
		expect(envelope.incidents[0]).toEqual({
			incidentNo: '2609160009',
			reportedDate: '2026-09-16',
			time: '07:56',
			callType: 'Lost/Stolen',
			dispositionCategory: 'Log Entry Only',
			officerInitiated: false
		});
	});

	it('never carries location or narrative text a read smuggles in', () => {
		const smuggled = {
			...extraction(),
			narrative: 'RP lost his phone yesterday in Bolinas',
			incidents: [{ ...incident(), location: 'Wharf Rd', narrative: 'RP lost his phone yesterday' }]
		};
		const published = JSON.stringify(buildEnvelope(valid(smuggled), source));
		for (const text of ['Wharf', 'RP lost', 'Bolinas']) expect(published).not.toContain(text);
	});

	it.each([
		'Welfare Check',
		'Danger to Self/Others/Gravely Disabled',
		'Juvenile Problem',
		'Dead Body',
		'Domestic Disturbance',
		'Sexual Assault',
		'Suicidal Subject',
		'Missing Person',
		'Coroner Case',
		'5150 Evaluation'
	])('suppresses %s entirely (counted only)', (callType) => {
		const envelope = buildEnvelope(valid(extraction([incident({ callType })])), source);
		expect(envelope.incidents).toEqual([]);
		expect(envelope.withheldCount).toBe(1);
	});

	it.each(['Meet the Citizen', 'Citizen Assist', 'Any civil problem', 'Brand New Type'])(
		'withholds %s — not on the curated allowlist',
		(callType) => {
			const envelope = buildEnvelope(valid(extraction([incident({ callType })])), source);
			expect(envelope).toMatchObject({ incidents: [], withheldCount: 1 });
		}
	);

	it.each([
		'Disturbance',
		'Suspicious Circumstances',
		'Trespassing',
		'911 HANG UPS / MISDIALS / ETC',
		'Assist Outside Agency - Law Enforcement'
	])('withholds %s — broad enough to hide a sensitive situation', (callType) => {
		const read = extraction([incident({ callType, disposition: 'Service Provided' })]);
		expect(buildEnvelope(valid(read), source)).toMatchObject({ incidents: [], withheldCount: 1 });
	});

	it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
		'withholds the call type %j (no inherited-property lookups)',
		(callType) => {
			const envelope = buildEnvelope(valid(extraction([incident({ callType })])), source);
			expect(envelope).toMatchObject({ incidents: [], withheldCount: 1 });
		}
	);

	it.each(['__proto__', 'constructor', 'toString'])(
		'maps the disposition %j to Other',
		(disposition) => {
			const envelope = buildEnvelope(valid(extraction([incident({ disposition })])), source);
			expect(envelope.incidents[0].dispositionCategory).toBe('Other');
		}
	);

	it.each([
		'Welfare check completed',
		'Placed on 5150 hold',
		'Referred to psych eval',
		'Mental health crisis team',
		'Danger to others',
		'Self-harm',
		'Self harm risk',
		'Transported, overdose',
		'Released to parent (juvenile)',
		'Minor released to guardian',
		'Sexual battery report',
		'Domestic violence report',
		'DV report',
		'Suicidal subject',
		'Coroner notified',
		'Deceased at scene',
		'Missing\nperson located',
		'Mobile  Crisis referral',
		'Medical transport'
	])('withholds an allowlisted call type whose disposition reads %j', (disposition) => {
		const read = extraction([incident({ callType: 'Theft', disposition })]);
		expect(buildEnvelope(valid(read), source)).toMatchObject({ incidents: [], withheldCount: 1 });
	});

	it('withholds an allowlisted call type whose disposition mentions a withheld category', () => {
		const envelope = buildEnvelope(
			valid(extraction([incident({ disposition: 'Placed on 5150 Hold' })])),
			source
		);
		expect(envelope).toMatchObject({ incidents: [], withheldCount: 1 });
	});

	it('maps an unknown disposition to Other and never publishes the raw text', () => {
		const envelope = buildEnvelope(
			valid(extraction([incident({ disposition: 'Referred to Smith family' })])),
			source
		);
		expect(envelope.incidents[0].dispositionCategory).toBe('Other');
		expect(JSON.stringify(envelope)).not.toContain('Smith');
	});

	it('normalizes call-type spelling and spacing to the vocabulary label', () => {
		const envelope = buildEnvelope(
			valid(extraction([incident({ callType: 'Traffic  complaint /\nPROBLEM' })])),
			source
		);
		expect(envelope.incidents[0].callType).toBe('Traffic Complaint');
	});

	it('still publishes an envelope when every incident is withheld', () => {
		const envelope = buildEnvelope(
			valid(
				extraction(numbered([{ callType: 'Welfare Check' }, { callType: 'Meet the Citizen' }]))
			),
			source
		);
		expect(envelope).toMatchObject({ status: 'published', incidents: [], withheldCount: 2 });
	});
});

describe('buildEnvelope — hand-verified bulletins', () => {
	const bulletins = ['bulletin-2026-09-16', 'bulletin-2026-09-09'].map((name) => {
		const { extraction: read, pageCount } = loadTranscription(name);
		const result = validateExtraction(read, { pageCount });
		if (!result.ok) throw new Error(result.errors.join('; '));
		return { read, envelope: buildEnvelope(result.bulletin, source) };
	});

	it('publishes exactly the curated split for each real bulletin', () => {
		expect(
			bulletins.map(({ envelope }) => [envelope.incidents.length, envelope.withheldCount])
		).toEqual([
			[SPLIT_0916.published, SPLIT_0916.withheld],
			[SPLIT_0909.published, SPLIT_0909.withheld]
		]);
	});

	it('publishes or withholds every incident, and publishes only vocabulary call types', () => {
		for (const { envelope } of bulletins) {
			expect(envelope.incidents.length + envelope.withheldCount).toBe(124);
			for (const i of envelope.incidents) expect(PUBLIC_CALL_TYPES).toContain(i.callType);
		}
	});

	it('maps every real disposition to a named category (none fall through to Other)', () => {
		for (const { envelope } of bulletins) {
			expect(envelope.incidents.filter((i) => i.dispositionCategory === 'Other')).toEqual([]);
		}
	});

	it('never publishes a person-centered or suppressed real incident', () => {
		const sensitive =
			/meet the citizen|citizen assist|civil|welfare|danger to self|juvenile|dead body|medical|restraining|threats|assault|unwanted subject|with subjects|attempt to contact|disturbance|suspicious circumstances|trespass|hang ups|outside agency/i;
		for (const { read, envelope } of bulletins) {
			const hidden = read.incidents.filter((i) => sensitive.test(i.callType));
			expect(hidden.length).toBeGreaterThan(0);
			const published = new Set(envelope.incidents.map((i) => i.incidentNo));
			for (const i of hidden) expect(published.has(i.incidentNo)).toBe(false);
		}
	});
});

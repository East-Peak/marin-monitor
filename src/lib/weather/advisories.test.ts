import { describe, expect, it } from 'vitest';
import {
	MARIN_ALERT_ZONES,
	advisoryRow,
	advisoryScope,
	currentAdvisories,
	parseNwsAlerts,
	type Advisory,
	type AdvisoryFeedState
} from './advisories';

const NOW = Date.parse('2026-09-29T15:00:00Z'); // 8:00 AM PDT
const MIN = 60_000;

function feature(over: Record<string, unknown> = {}) {
	return {
		properties: {
			id: 'urn:oid:2.49.0.1.840.0.a1',
			event: 'Coastal Flood Advisory',
			headline: 'Coastal Flood Advisory issued September 29',
			severity: 'Minor',
			status: 'Actual',
			messageType: 'Alert',
			sent: '2026-09-29T07:00:00-07:00',
			effective: '2026-09-29T07:00:00-07:00',
			expires: '2026-09-29T15:00:00-07:00',
			ends: '2026-10-01T17:00:00-07:00',
			references: [],
			geocode: { UGC: ['CAZ006', 'CAZ506'] },
			...over
		}
	};
}
const parse = (...overs: Record<string, unknown>[]) =>
	parseNwsAlerts({ features: overs.map(feature) })!;

describe('zones', () => {
	it('come from the corrected config: Marin forecast zones and the county (never CAZ006)', () => {
		expect([...MARIN_ALERT_ZONES].sort()).toEqual(['CAC041', 'CAZ502', 'CAZ505', 'CAZ506']);
	});
});

describe('parseNwsAlerts (identity, lifecycle, applicability)', () => {
	it('keeps identity, issuance, effective, expiry, end, references and the Marin zones only', () => {
		expect(parse({})).toEqual({
			unreadable: 0,
			advisories: [
				{
					id: 'urn:oid:2.49.0.1.840.0.a1',
					event: 'Coastal Flood Advisory',
					headline: 'Coastal Flood Advisory issued September 29',
					severity: 'Minor',
					messageType: 'Alert',
					sentAt: Date.parse('2026-09-29T14:00:00Z'),
					effectiveAt: Date.parse('2026-09-29T14:00:00Z'),
					expiresAt: Date.parse('2026-09-29T22:00:00Z'),
					endsAt: Date.parse('2026-10-02T00:00:00Z'),
					references: [],
					zones: ['CAZ506']
				}
			]
		});
	});
	it.each([
		['a San Francisco-only alert', { geocode: { UGC: ['CAZ006'] } }],
		['a Test message', { status: 'Test' }],
		['an Exercise', { status: 'Exercise' }]
	])('excludes %s (proven not to apply)', (_label, over) => {
		expect(parse(over)).toEqual({ advisories: [], unreadable: 0 });
	});
	it.each([
		['an unknown message type', { messageType: 'Ack' }],
		['a missing id', { id: '' }],
		['a zone-less sent time', { sent: '2026-09-29T07:00:00' }],
		['a missing expiry', { expires: null }],
		['an expiry before it takes effect', { expires: '2026-09-29T06:00:00-07:00' }],
		['a malformed end', { ends: 'soon' }],
		['a missing geocode (applicability unknown)', { geocode: null }],
		['a non-string status', { status: 7 }],
		['invalid UGC codes (Codex r2 #5)', { geocode: { UGC: ['garbage'] } }],
		['an empty UGC list', { geocode: { UGC: [] } }],
		['mixed valid and invalid UGC codes', { geocode: { UGC: ['CAZ506', 'bad'] } }],
		['a non-Marin list with a malformed code', { geocode: { UGC: ['CAZ006', 'caz506'] } }],
		[
			'a malformed cancellation reference',
			{ messageType: 'Cancel', references: [{ identifier: 42 }] }
		],
		[
			'a reference without an identifier',
			{ messageType: 'Update', references: [{ sender: 'w-nws.webmaster@noaa.gov' }] }
		],
		['references that are not an array', { references: 'urn:x' }]
	])('counts %s as unreadable, never as "no alerts" (Codex r1 #5)', (_label, over) => {
		expect(parse(over)).toEqual({ advisories: [], unreadable: 1 });
	});
	it('a well-formed non-Marin list is excluded; a Cancel with well-formed references is read', () => {
		expect(parse({ geocode: { UGC: ['CAZ006', 'CAC075'] } })).toEqual({
			advisories: [],
			unreadable: 0
		});
		const cancel = parse({
			id: 'urn:c',
			messageType: 'Cancel',
			references: [{ identifier: 'urn:oid:2.49.0.1.840.0.a1', sender: 'x', sent: 'y' }]
		});
		expect(cancel).toMatchObject({
			unreadable: 0,
			advisories: [{ id: 'urn:c', references: ['urn:oid:2.49.0.1.840.0.a1'] }]
		});
	});
	it('keeps the valid alerts next to an unreadable one', () => {
		const result = parse({}, { id: 'urn:bad', expires: null });
		expect(result.advisories.map((a) => a.id)).toEqual(['urn:oid:2.49.0.1.840.0.a1']);
		expect(result.unreadable).toBe(1);
	});
	it('a body that is not an alert collection is a contract failure (null)', () => {
		for (const body of [null, 'x', {}, { features: 'x' }]) expect(parseNwsAlerts(body)).toBeNull();
		expect(parseNwsAlerts({ features: [] })).toEqual({ advisories: [], unreadable: 0 });
	});
	it('an unknown severity (including a prototype name) reads Unknown; a null end is allowed', () => {
		expect(parse({ severity: 'Bad', ends: null }).advisories[0]).toMatchObject({
			severity: 'Unknown',
			endsAt: null
		});
		expect(parse({ severity: 'toString' }).advisories[0].severity).toBe('Unknown');
	});

	it('a replacement that cannot be shown still retires what it replaces (Codex PR 8 #1)', () => {
		const old = {};
		// An Update that moves the hazard out of Marin: excluded itself, but the old Marin alert is superseded.
		const outOfMarin = {
			id: 'urn:u',
			messageType: 'Update',
			geocode: { UGC: ['CAZ006'] },
			references: [{ identifier: 'urn:oid:2.49.0.1.840.0.a1' }]
		};
		expect(parse(old, outOfMarin)).toEqual({ advisories: [], unreadable: 0 });
		// A Cancel with a valid reference but no expiry: unreadable itself, and still retires its predecessor.
		const cancel = {
			id: 'urn:c',
			messageType: 'Cancel',
			expires: null,
			references: [{ identifier: 'urn:oid:2.49.0.1.840.0.a1' }]
		};
		expect(parse(old, cancel)).toEqual({ advisories: [], unreadable: 1 });
		// A Test message never retires a real alert.
		const test = {
			id: 'urn:t',
			status: 'Test',
			messageType: 'Cancel',
			references: [{ identifier: 'urn:oid:2.49.0.1.840.0.a1' }]
		};
		expect(parse(old, test).advisories.map((a) => a.id)).toEqual(['urn:oid:2.49.0.1.840.0.a1']);
	});
});

describe('currentAdvisories (updates, cancellation, clock)', () => {
	const [base] = parse({}).advisories;
	const at = (over: Partial<Advisory>): Advisory => ({ ...base, ...over });

	it('an Update supersedes the message it references', () => {
		const update = at({ id: 'u1', messageType: 'Update', references: [base.id] });
		expect(currentAdvisories([base, update], NOW).map((a) => a.id)).toEqual(['u1']);
	});
	it('a Cancel removes itself and what it cancels', () => {
		const cancel = at({ id: 'c1', messageType: 'Cancel', references: [base.id] });
		expect(currentAdvisories([base, cancel], NOW)).toEqual([]);
	});
	it('expiry is by the clock: current before, gone at and after expires', () => {
		const a = at({ expiresAt: NOW + MIN });
		expect(currentAdvisories([a], NOW)).toHaveLength(1);
		expect(currentAdvisories([a], NOW + MIN)).toEqual([]);
	});
	it('not yet effective (beyond 5 min of skew) is not shown', () => {
		expect(currentAdvisories([at({ effectiveAt: NOW + 4 * MIN })], NOW)).toHaveLength(1);
		expect(currentAdvisories([at({ effectiveAt: NOW + 6 * MIN })], NOW)).toEqual([]);
	});
	it('most severe first, then newest', () => {
		const minor = at({ id: 'm', severity: 'Minor', sentAt: NOW - MIN });
		const severe = at({ id: 's', severity: 'Severe', sentAt: NOW - 60 * MIN });
		const minorNewer = at({ id: 'n', severity: 'Minor', sentAt: NOW });
		expect(currentAdvisories([minor, severe, minorNewer], NOW).map((a) => a.id)).toEqual([
			's',
			'n',
			'm'
		]);
	});
});

describe('advisoryScope', () => {
	it('county-wide when the county zone or every Marin forecast zone is named', () => {
		expect(advisoryScope(['CAC041'])).toBe('County-wide');
		expect(advisoryScope(['CAZ502', 'CAZ505', 'CAZ506'])).toBe('County-wide');
	});
	it('otherwise names the Marin zones it covers', () => {
		expect(advisoryScope(['CAZ506'])).toBe('North Bay interior valleys');
		expect(advisoryScope(['CAZ502', 'CAZ505'])).toBe('Marin Coastal Range · North Bay coast');
	});
});

describe('advisoryRow (coverage stays visible; no "all clear")', () => {
	const [a] = parse({}).advisories;
	const feed = (over: Partial<AdvisoryFeedState>): AdvisoryFeedState => ({
		advisories: [],
		unreadable: 0,
		lastAttemptAt: NOW - MIN,
		lastSuccessAt: NOW - MIN,
		lastError: null,
		...over
	});
	it('hidden before the first attempt, and when coverage is good and nothing is current', () => {
		expect(advisoryRow(feed({ lastAttemptAt: null, lastSuccessAt: null }), NOW)).toEqual({
			kind: 'hidden'
		});
		expect(advisoryRow(feed({}), NOW)).toEqual({ kind: 'hidden' });
	});
	it('current alerts show; with good coverage there is no staleness notice', () => {
		expect(advisoryRow(feed({ advisories: [a] }), NOW)).toEqual({
			kind: 'alerts',
			advisories: [a],
			notUpdatedSince: null,
			unreadable: 0
		});
	});
	it('an unreadable Marin alert degrades coverage visibly, next to the readable ones', () => {
		expect(advisoryRow(feed({ advisories: [a], unreadable: 1 }), NOW)).toEqual({
			kind: 'alerts',
			advisories: [a],
			notUpdatedSince: null,
			unreadable: 1
		});
		expect(advisoryRow(feed({ unreadable: 2 }), NOW)).toEqual({
			kind: 'unavailable',
			lastSuccessAt: NOW - MIN,
			unreadable: 2
		});
	});
	it('a failed refresh keeps current alerts and says since when', () => {
		expect(
			advisoryRow(
				feed({ advisories: [a], lastError: 'HTTP 503', lastSuccessAt: NOW - 20 * MIN }),
				NOW
			)
		).toEqual({
			kind: 'alerts',
			advisories: [a],
			notUpdatedSince: NOW - 20 * MIN,
			unreadable: 0
		});
	});
	it('coverage older than 15 minutes counts as failed even without an error', () => {
		expect(advisoryRow(feed({ lastSuccessAt: NOW - 16 * MIN }), NOW)).toEqual({
			kind: 'unavailable',
			lastSuccessAt: NOW - 16 * MIN,
			unreadable: 0
		});
	});
	it('a failure with nothing current is "unavailable", never hidden', () => {
		expect(advisoryRow(feed({ lastError: 'HTTP 503', lastSuccessAt: null }), NOW)).toEqual({
			kind: 'unavailable',
			lastSuccessAt: null,
			unreadable: 0
		});
		const expired = { ...a, expiresAt: NOW - MIN };
		expect(advisoryRow(feed({ advisories: [expired], lastError: 'x' }), NOW).kind).toBe(
			'unavailable'
		);
	});
});

import { describe, expect, it } from 'vitest';
import {
	evaluate,
	type AcceptedException,
	type HealthInventory,
	type Observation
} from './evaluate';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const DAY_MS = 86_400_000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS).toISOString();

const FRESH = {
	name: 'Fresh',
	blobKey: 'fresh.json',
	cadence: 'daily',
	maxAgeDays: 2,
	observedAt: 'content'
} as const;
const STRAVA = {
	name: 'Strava',
	blobKey: 'strava.json',
	cadence: 'weekly',
	maxAgeDays: 10,
	observedAt: 'content'
} as const;

const found = (ts: string): Observation => ({
	kind: 'found',
	uploadedAt: ts,
	contentTimestamp: ts
});
const exception = (overrides: Partial<AcceptedException> = {}): AcceptedException => ({
	name: 'Strava',
	condition: 'stale',
	reason: 'GS: waiting on Strava API policy answer',
	approvedBy: 'Stuart Watson',
	approvedAt: '2026-09-29T00:00:00.000Z',
	expiresAt: '2026-12-31T23:59:59.000Z',
	...overrides
});
function inventory(
	exceptions: AcceptedException[],
	subsourceFailures: HealthInventory['subsourceFailures'] = []
): HealthInventory {
	return { sources: [FRESH, STRAVA], subsourceFailures, exceptions };
}
const observations = { Fresh: found(daysAgo(0)), Strava: found(daysAgo(120)) };
const FAIRFAX = {
	name: 'Fairfax Police',
	parent: 'Police Logs',
	problem: 'HTTP 403',
	disposition: 'accepted'
};

describe('accepted exceptions', () => {
	it('an active exception makes the report acceptable while the source stays factually stale', () => {
		const report = evaluate(inventory([exception()]), observations, NOW);
		const strava = report.sources.find((s) => s.name === 'Strava')!;
		expect(strava.status).toBe('stale');
		expect(strava.accepted).toEqual({
			reason: 'GS: waiting on Strava API policy answer',
			expiresAt: '2026-12-31T23:59:59.000Z'
		});
		expect(report.status).toBe('degraded');
		expect(report.summary.stale).toBe(1);
		expect(report.acceptable).toBe(true);
	});

	it('covers only the accepted condition — a missing or unreadable blob still fails', () => {
		for (const obs of [{ kind: 'missing' }, { kind: 'error' }] as Observation[]) {
			const report = evaluate(inventory([exception()]), { ...observations, Strava: obs }, NOW);
			expect(report.sources.find((s) => s.name === 'Strava')!.accepted).toBeUndefined();
			expect(report.acceptable).toBe(false);
		}
	});

	it('an expired exception fails closed', () => {
		const report = evaluate(
			inventory([exception({ expiresAt: '2026-09-29T11:59:59.000Z' })]),
			observations,
			NOW
		);
		expect(report.sources.find((s) => s.name === 'Strava')!.accepted).toBeUndefined();
		expect(report.acceptable).toBe(false);
	});

	it('a malformed expiry fails closed', () => {
		for (const expiresAt of ['2026-12-31', 'never', '2026-02-30T00:00:00Z']) {
			const report = evaluate(inventory([exception({ expiresAt })]), observations, NOW);
			expect(report.acceptable, expiresAt).toBe(false);
		}
	});

	it('an exception missing its reason, approver or a valid past approval fails closed', () => {
		for (const bad of [
			{ reason: '' },
			{ approvedBy: ' ' },
			{ approvedAt: 'yesterday' },
			{ approvedAt: '2026-10-01T00:00:00.000Z' }
		]) {
			const report = evaluate(inventory([exception(bad)]), observations, NOW);
			expect(report.acceptable, JSON.stringify(bad)).toBe(false);
		}
	});

	it('does not let an exception for one source cover another', () => {
		const report = evaluate(inventory([exception({ name: 'Fresh' })]), observations, NOW);
		expect(report.acceptable).toBe(false);
	});

	it('accepts a subsource failure only while its exception is active', () => {
		const active = evaluate(
			inventory(
				[exception(), exception({ name: 'Fairfax Police', condition: 'unavailable' })],
				[FAIRFAX]
			),
			observations,
			NOW
		);
		expect(active.subsources[0].accepted?.expiresAt).toBe('2026-12-31T23:59:59.000Z');
		expect(active.acceptable).toBe(true);

		const unaccepted = evaluate(inventory([exception()], [FAIRFAX]), observations, NOW);
		expect(unaccepted.subsources[0].accepted).toBeUndefined();
		expect(unaccepted.acceptable).toBe(false);
	});

	it('a fully healthy inventory is acceptable with no exceptions', () => {
		const report = evaluate(
			{ sources: [FRESH], subsourceFailures: [], exceptions: [] },
			{ Fresh: found(daysAgo(0)) },
			NOW
		);
		expect(report.status).toBe('healthy');
		expect(report.acceptable).toBe(true);
	});

	it('an empty inventory is never acceptable', () => {
		const report = evaluate({ sources: [], subsourceFailures: [], exceptions: [] }, {}, NOW);
		expect(report.acceptable).toBe(false);
	});
});

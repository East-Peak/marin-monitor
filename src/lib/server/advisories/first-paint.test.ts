// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ParsedAlerts } from '$lib/weather/advisories';
import { readAdvisoriesForFirstPaint } from './first-paint';

const NOW = Date.parse('2026-10-24T21:00:00Z');
const ALERTS: ParsedAlerts = {
	advisories: [
		{
			id: 'urn:oid:a1',
			event: 'Coastal Flood Advisory',
			headline: null,
			severity: 'Minor',
			messageType: 'Alert',
			sentAt: NOW - 3_600_000,
			effectiveAt: NOW - 3_600_000,
			expiresAt: NOW + 3_600_000,
			endsAt: null,
			references: [],
			zones: ['CAZ506'],
			description: null,
			instruction: null
		}
	],
	unreadable: 0
};
const fixture = (body: string) => {
	const file = join(mkdtempSync(join(tmpdir(), 'nws-')), 'alerts.json');
	writeFileSync(file, body);
	return file;
};
const NWS_BODY = JSON.stringify({
	features: [
		{
			properties: {
				id: 'urn:oid:a1',
				event: 'Coastal Flood Advisory',
				headline: 'Coastal Flood Advisory',
				severity: 'Minor',
				status: 'Actual',
				messageType: 'Alert',
				sent: new Date(NOW - 3_600_000).toISOString(),
				effective: new Date(NOW - 3_600_000).toISOString(),
				expires: new Date(NOW + 3_600_000).toISOString(),
				ends: null,
				references: [],
				geocode: { UGC: ['CAZ506'] }
			}
		}
	]
});

describe('readAdvisoriesForFirstPaint (MOBILE1: the advisory row is in the HTML)', () => {
	it('a read in time is a successful feed state, as the client would have recorded it', async () => {
		const state = await readAdvisoriesForFirstPaint(
			{},
			{ fetch: async () => ALERTS, now: () => NOW }
		);
		expect(state).toEqual({
			advisories: ALERTS.advisories,
			unreadable: 0,
			lastAttemptAt: NOW,
			lastSuccessAt: NOW,
			lastError: null
		});
	});

	it('asks NWS with the first paint’s deadline, never the client’s 10 s', async () => {
		const deadlines: number[] = [];
		await readAdvisoriesForFirstPaint(
			{},
			{ fetch: async (ms) => (deadlines.push(ms), ALERTS), now: () => NOW }
		);
		expect(deadlines).toEqual([1_200]);
	});

	it('a failure or a timeout is null: the client reads them, as before', async () => {
		const failing = async () => {
			throw new Error('nws alerts timed out');
		};
		expect(await readAdvisoriesForFirstPaint({}, { fetch: failing, now: () => NOW })).toBeNull();
	});

	it('e2e servers read a fixture file instead of NWS, outside production only', async () => {
		const file = fixture(NWS_BODY);
		const never = async (): Promise<ParsedAlerts> => {
			throw new Error('NWS must not be asked');
		};
		const state = await readAdvisoriesForFirstPaint(
			{ NWS_ALERTS_FIXTURE: file, VERCEL_ENV: 'preview' },
			{ fetch: never, now: () => NOW }
		);
		expect(state?.advisories.map((a) => a.event)).toEqual(['Coastal Flood Advisory']);
		// Production never reads the fixture.
		const live = await readAdvisoriesForFirstPaint(
			{ NWS_ALERTS_FIXTURE: file, VERCEL_ENV: 'production' },
			{ fetch: async () => ALERTS, now: () => NOW }
		);
		expect(live?.advisories).toBe(ALERTS.advisories);
	});

	it('/dev/null (or anything unreadable) as the fixture is no first-paint read', async () => {
		const env = { NWS_ALERTS_FIXTURE: '/dev/null' };
		expect(await readAdvisoriesForFirstPaint(env, { now: () => NOW })).toBeNull();
		expect(
			await readAdvisoriesForFirstPaint(
				{ NWS_ALERTS_FIXTURE: fixture('{"x":1}') },
				{ now: () => NOW }
			)
		).toBeNull();
	});
});

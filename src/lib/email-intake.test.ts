import { describe, expect, it } from 'vitest';
import {
	collapseRevisions,
	isEmailIntakeRead,
	isEmailItem,
	revisionBase,
	withinWindow,
	type EmailItem
} from './email-intake';

const item = (over: Partial<EmailItem> = {}): EmailItem => ({
	v: 1,
	key: 'a'.repeat(32),
	sender: 'goldengate@service.govdelivery.com',
	rule: 'gg-ferry-alert',
	destination: 'transit',
	subject: 'Rider Alert 11/4 Golden Gate Ferry Larkspur',
	sentAt: '2026-11-04T14:48:14.000Z',
	receivedAt: '2026-11-04T14:48:20.000Z',
	description: 'Due to a mechanical issue, some trips will be delayed.',
	permalink: 'https://content.govdelivery.com/accounts/CAGOLDEN/bulletins/4319d18',
	topics: ['Larkspur Ferry'],
	...over
});

describe('revisionBase', () => {
	it.each([
		[
			'[Updated 1:00PM] Rider Alert 11/4 Golden Gate Ferry Larkspur',
			'Rider Alert 11/4 Golden Gate Ferry Larkspur'
		],
		[
			'[UPDATED] Rider Alert 11/4 Golden Gate Ferry Larkspur',
			'Rider Alert 11/4 Golden Gate Ferry Larkspur'
		],
		['REMINDER! ALERT GGBRIDGE 11/16-11/20 DETOUR', 'ALERT GGBRIDGE 11/16-11/20 DETOUR'],
		['Reminder! Join our Nov. 5 Public Meeting', 'Join our Nov. 5 Public Meeting'],
		['REMINDER! [Updated 2PM]  Rider Alert', 'Rider Alert'],
		['Rider Alert GGTransit King Tides', 'Rider Alert GGTransit King Tides']
	])('%s → %s', (subject, base) => expect(revisionBase(subject)).toBe(base));
});

describe('collapseRevisions', () => {
	it('folds an [Updated …] revision onto its alert; the newest wins', () => {
		const first = item();
		const update = item({
			key: 'b'.repeat(32),
			subject: '[Updated 1:00PM] Rider Alert 11/4 Golden Gate Ferry Larkspur',
			sentAt: '2026-11-04T21:09:26.000Z',
			permalink: 'https://content.govdelivery.com/accounts/CAGOLDEN/bulletins/431aeb0'
		});
		expect(collapseRevisions([update, first])).toEqual([update]);
		expect(collapseRevisions([first, update])).toEqual([update]);
	});

	it('folds a REMINDER! and an [UPDATED] resend, case and spacing folded', () => {
		const a = item({ rule: 'gg-bridge-alert', subject: 'ALERT GGBRIDGE 11/16-11/20 DETOUR' });
		const b = item({
			key: 'b'.repeat(32),
			rule: 'gg-bridge-alert',
			subject: 'REMINDER! ALERT  GGBRIDGE 11/16-11/20 detour',
			sentAt: '2026-11-13T19:02:37.000Z'
		});
		const c = item({
			key: 'c'.repeat(32),
			rule: 'gg-bridge-alert',
			subject: '[UPDATED] ALERT GGBRIDGE 11/16-11/20 DETOUR',
			sentAt: '2026-11-10T19:02:37.000Z'
		});
		expect(collapseRevisions([a, b, c])).toEqual([b]);
	});

	it('keeps different alerts apart, and the same subject under different rules apart', () => {
		const a = item();
		const b = item({ key: 'b'.repeat(32), subject: 'Rider Alert 11/5 Golden Gate Ferry Larkspur' });
		const c = item({ key: 'c'.repeat(32), rule: 'gg-transit-alert' });
		expect(collapseRevisions([a, b, c])).toHaveLength(3);
	});

	it('orders newest first; an equal send time is decided by key, so the order is stable', () => {
		const older = item({ subject: 'One', sentAt: '2026-11-01T00:00:00.000Z' });
		const newer = item({ key: 'b'.repeat(32), subject: 'Two', sentAt: '2026-11-02T00:00:00.000Z' });
		expect(collapseRevisions([older, newer]).map((i) => i.subject)).toEqual(['Two', 'One']);
		const x = item({ key: 'b'.repeat(32), subject: 'Same' });
		const y = item({ key: 'c'.repeat(32), subject: 'Same' });
		expect(collapseRevisions([x, y])).toEqual([y]);
		expect(collapseRevisions([y, x])).toEqual([y]);
	});
});

describe('withinWindow', () => {
	const now = Date.parse('2026-11-18T12:00:00.000Z');
	it('keeps 14 days of sends and nothing from the future beyond 5 minutes', () => {
		expect(withinWindow(item({ sentAt: '2026-11-04T12:00:01.000Z' }), now)).toBe(true);
		expect(withinWindow(item({ sentAt: '2026-11-04T11:59:59.000Z' }), now)).toBe(false);
		expect(withinWindow(item({ sentAt: '2026-11-18T12:04:00.000Z' }), now)).toBe(true);
		expect(withinWindow(item({ sentAt: '2026-11-18T12:06:00.000Z' }), now)).toBe(false);
	});
});

describe('isEmailItem / isEmailIntakeRead', () => {
	it('accepts a well-formed item and read', () => {
		expect(isEmailItem(item())).toBe(true);
		expect(isEmailIntakeRead({ checkedAt: '2026-11-14T00:00:00.000Z', items: [item()] })).toBe(
			true
		);
	});

	it.each([
		['an unknown destination', { destination: 'everywhere' }],
		['a bad time', { sentAt: 'yesterday' }],
		['a link off GovDelivery', { permalink: 'https://evil.example/bulletins/1' }],
		['an empty subject', { subject: '' }],
		['non-string topics', { topics: [1] }],
		['a wrong version', { v: 2 }]
	])('rejects %s', (_, over) => expect(isEmailItem({ ...item(), ...over })).toBe(false));

	it('a read with a held item is not a valid public read', () => {
		expect(
			isEmailIntakeRead({
				checkedAt: '2026-11-14T00:00:00.000Z',
				items: [item({ destination: 'held', rule: 'unknown' })]
			})
		).toBe(false);
	});
});

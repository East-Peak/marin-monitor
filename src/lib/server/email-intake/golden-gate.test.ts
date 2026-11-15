// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FAKE_INBOUND, fixture } from './fixtures';
import { bulletinLink, firstParagraph, readGoldenGate, routeGoldenGate } from './golden-gate';
import { parsePostmark } from './postmark';

const read = (name: string) => readGoldenGate(parsePostmark(fixture(name))!, FAKE_INBOUND);

describe('routeGoldenGate: every sample lands where its rule says', () => {
	it.each([
		['transit-route-580', 'gg-transit-alert', 'transit', ['Route 580']],
		['transit-king-tides', 'gg-transit-alert', 'transit', ['Golden Gate Transit']],
		['ferry-larkspur-1104', 'gg-ferry-alert', 'transit', ['Larkspur Ferry']],
		['ferry-larkspur-1104-updated', 'gg-ferry-alert', 'transit', ['Larkspur Ferry']],
		['bridge-sidewalk-detour', 'gg-bridge-alert', 'roads', ['Golden Gate Bridge']],
		['bridge-sidewalk-detour-reminder', 'gg-bridge-alert', 'roads', ['Golden Gate Bridge']],
		['bridge-marathon', 'gg-bridge-alert', 'roads', ['Golden Gate Bridge']],
		['newsletter-october', 'gg-newsletter', 'news', ['Golden Gate Transit']],
		['public-meeting-reminder', 'gg-public-meeting', 'news', ['Larkspur Ferry']],
		['account-welcome', 'gg-account', 'dropped', []],
		['account-subscription-change', 'gg-account', 'dropped', []]
	])('%s → %s (%s)', (name, rule, destination, topics) => {
		expect(read(name)).toMatchObject({ rule, destination, topics });
	});

	it('the Richmond-San Rafael "Bridge Closure" is a transit alert, not a bridge one', () => {
		expect(
			routeGoldenGate(
				'Rider Alert Route GGTransit Route 580 Sunday, 11/15, WB Richmond-San Rafael Bridge Closure',
				'https://content.govdelivery.com/accounts/CAGOLDEN/bulletins/1'
			).rule
		).toBe('gg-transit-alert');
	});

	it('anything the rules cannot place is held', () => {
		const link = 'https://content.govdelivery.com/accounts/CAGOLDEN/bulletins/1';
		expect(routeGoldenGate('Valkyries Parade Service Notice', link)).toEqual({
			rule: 'unknown',
			destination: 'held',
			topics: []
		});
	});

	it('a shown rule without a bulletin link is held; account mail is dropped regardless', () => {
		expect(routeGoldenGate('Rider Alert GGTransit King Tides', null)).toMatchObject({
			rule: 'gg-no-bulletin',
			destination: 'held'
		});
		expect(routeGoldenGate('Welcome New User', null).destination).toBe('dropped');
	});
});

describe('bulletinLink', () => {
	it('extracts the public bulletin page, its query dropped', () => {
		expect(read('ferry-larkspur-1104').permalink).toBe(
			'https://content.govdelivery.com/accounts/CAGOLDEN/bulletins/4319d18'
		);
		expect(read('ferry-larkspur-1104-updated').permalink).toBe(
			'https://content.govdelivery.com/accounts/CAGOLDEN/bulletins/431aeb0'
		);
	});

	it('takes only Golden Gate’s own account', () => {
		expect(
			bulletinLink('[ https://content.govdelivery.com/accounts/CAOTHER/bulletins/12ab ]')
		).toBeNull();
		expect(bulletinLink('no link')).toBeNull();
	});
});

describe('firstParagraph', () => {
	it('is the body’s first paragraph, links and emphasis removed', () => {
		expect(read('bridge-marathon').description).toBe(
			'On Sunday, November 01, 2026 from 5 AM - 11 AM the east and west sidewalks will be closed for the Golden Gate Half Marathon.'
		);
		expect(read('transit-route-580').description).toBe(
			'The Richmond-San Rafael Bridge will be closed in the westbound direction starting Saturday night, 11/14, at 11pm through Sunday, 11/15, at 8am.'
		);
	});

	it('keeps a revision marker written into the text', () => {
		expect(read('ferry-larkspur-1104-updated').description).toMatch(
			/^\[Updated 1:00PM\] Wednesday 11\/4/
		);
	});

	it('never carries the inbound address and is capped', () => {
		expect(firstParagraph(`Sent to ${FAKE_INBOUND} today.`, FAKE_INBOUND)).toBe('Sent to today.');
		expect(firstParagraph('x'.repeat(900), FAKE_INBOUND)!.length).toBeLessThanOrEqual(500);
		expect(firstParagraph('   \n\n ', FAKE_INBOUND)).toBeNull();
	});
});

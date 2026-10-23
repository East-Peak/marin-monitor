import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GG_PROMO_HEADLINES, parseGgAlertsPage } from './parse';

/** goldengate.org/alerts/ as served 2026-10-23 05:00 PT: day 5 of the ferry disruption. */
const PAGE = readFileSync(
	join(process.cwd(), 'src/lib/server/__fixtures__/gg-alerts-2026-10-23.html'),
	'utf8'
);
const DISRUPTION = '10/19-10/23 GGFERRY WEEKDAY SERVICE DISRUPTIONS ON ALL ROUTES';

describe('parseGgAlertsPage', () => {
	it('reads every ferry and bus group with its published count', () => {
		expect(parseGgAlertsPage(PAGE).groups).toEqual([
			{ section: 'ferry', name: 'General Ferry', count: 2 },
			{ section: 'ferry', name: 'Larkspur Ferry', count: 2 },
			{ section: 'ferry', name: 'Sausalito Ferry', count: 1 },
			{ section: 'ferry', name: 'Tiburon Ferry', count: 1 },
			{ section: 'ferry', name: 'Angel Island', count: 2 },
			{ section: 'ferry', name: 'Oracle Park Service', count: 0 },
			{ section: 'bus', name: 'General Bus', count: 1 },
			{ section: 'bus', name: 'Route 101', count: 1 },
			{ section: 'bus', name: 'Route 114', count: 2 },
			{ section: 'bus', name: 'Route 120', count: 2 },
			{ section: 'bus', name: 'Route 132', count: 1 },
			{ section: 'bus', name: 'Route 154', count: 1 },
			{ section: 'bus', name: 'Route 172', count: 1 },
			{ section: 'bus', name: 'Route 580/580X', count: 1 }
		]);
	});

	it('the 10/19–10/23 disruption is one row, by its page ID, naming its routes', () => {
		const rows = parseGgAlertsPage(PAGE).alerts.filter((a) => a.headline === DISRUPTION);
		expect(rows).toEqual([
			{
				id: '549',
				headline: DISRUPTION,
				routes: [
					'General Ferry',
					'Larkspur Ferry',
					'Sausalito Ferry',
					'Tiburon Ferry',
					'Angel Island'
				]
			}
		]);
	});

	it('the Angel Island cancellations are their own row', () => {
		expect(parseGgAlertsPage(PAGE).alerts).toContainEqual({
			id: '534',
			headline: '10/19-10/23 GGFERRY ANGEL ISLAND SERVICE DISRUPTIONS',
			routes: ['Angel Island']
		});
	});

	it('drops the three standing notices by exact headline, and keeps "MAY FLOOD" as written', () => {
		const { alerts } = parseGgAlertsPage(PAGE);
		expect(alerts.map((a) => a.headline)).toEqual([
			DISRUPTION,
			'10/19-10/23 GGFERRY ANGEL ISLAND SERVICE DISRUPTIONS',
			'ALERT MANZANITA PARK & RIDE MAY FLOOD'
		]);
		expect(alerts.find((a) => a.id === '155')?.routes).toEqual(['Route 114', 'Route 120']);
		expect(GG_PROMO_HEADLINES).toEqual([
			'SF CUSTOMERS BUY TICKETS FROM GATE C',
			'PARK SMART AT GOLDEN GATE FERRY',
			'TAP ON AND OFF GOLDEN GATE TRANSIT!'
		]);
	});

	it('an unknown new notice shows: nothing is filtered by keyword', () => {
		const page = PAGE.replace(
			'<b>PARK SMART AT GOLDEN GATE FERRY</b>',
			'<b>PARK SMART AT GOLDEN GATE FERRY: LOT CLOSED</b>'
		);
		expect(parseGgAlertsPage(page).alerts.map((a) => a.id)).toContain('411');
	});

	it('a group whose count is not its items fails the read', () => {
		const page = PAGE.replace(
			/(Sausalito Ferry<\/div>\s*<div class="service-alert">\s*)1 Alert/,
			'$12 Alerts'
		);
		expect(page).not.toBe(PAGE);
		expect(() => parseGgAlertsPage(page)).toThrow(/Sausalito Ferry: 2 listed, 1 read/);
	});

	it('a page missing the bus section fails the read', () => {
		const page = PAGE.replace('Bus Alerts by Route', 'Bus Notices');
		expect(() => parseGgAlertsPage(page)).toThrow(/no bus section/);
	});

	it('a page with the alerts region removed fails the read', () => {
		const start = PAGE.indexOf('<div class="accordion">');
		const end = PAGE.indexOf('</main>');
		const page = PAGE.slice(0, start) + PAGE.slice(end);
		expect(() => parseGgAlertsPage(page)).toThrow(/no ferry section/);
	});

	it('an item without its page ID fails the read: it could not be deduped honestly', () => {
		const page = PAGE.replace(/<a id="[^"]+" name="534"><\/a>/, '');
		expect(() => parseGgAlertsPage(page)).toThrow(/without an ID/);
	});

	it('an unreadable count fails the read', () => {
		const page = PAGE.replace(
			/(Tiburon Ferry<\/div>\s*<div class="service-alert">\s*)1 Alert/,
			'$1Some'
		);
		expect(() => parseGgAlertsPage(page)).toThrow(/Tiburon Ferry: unreadable count/);
	});

	it('a section with no groups fails the read', () => {
		const start = PAGE.indexOf('Bus Alerts by Route');
		const from =
			PAGE.indexOf('<div class="  by-agency">', start) + '<div class="  by-agency">'.length;
		const to = PAGE.indexOf('Notices to Customers');
		const page = PAGE.slice(0, from) + '</div></div>' + PAGE.slice(PAGE.lastIndexOf('<button', to));
		expect(() => parseGgAlertsPage(page)).toThrow(/bus section lists no groups/);
	});
});

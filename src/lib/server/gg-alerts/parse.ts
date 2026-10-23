/**
 * goldengate.org/alerts/ (GGALERT1): the ferry and bus sections, each a list of route groups that
 * publish their own count ("2 Alerts"). A read is whole or it fails: every group's count must equal
 * the items read in it before anything is dropped, and both sections must be there. A failure is
 * never "no alerts". Nothing is classified by keywords; only the named standing notices are dropped.
 */
import { parseHTML } from 'linkedom/worker';
import type { GgAlert } from '$lib/gg-alerts';

/** Standing notices, not disruptions: dropped by exact headline (whitespace collapsed). */
export const GG_PROMO_HEADLINES: readonly string[] = [
	'SF CUSTOMERS BUY TICKETS FROM GATE C',
	'PARK SMART AT GOLDEN GATE FERRY',
	'TAP ON AND OFF GOLDEN GATE TRANSIT!'
];

const SECTIONS = [
	{ section: 'ferry', title: 'ferry alerts by route' },
	{ section: 'bus', title: 'bus alerts by route' }
] as const;
type Section = (typeof SECTIONS)[number]['section'];

export interface GgGroup {
	section: Section;
	name: string;
	count: number;
}

const text = (el: Element | null | undefined) =>
	(el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** "General Ferry Alerts" names the group "General Ferry"; route names stay as written. */
const groupName = (name: string) => name.replace(/ Alerts$/, '');

function readGroups(section: Section, content: Element) {
	const groups: { group: GgGroup; items: Omit<GgAlert, 'routes'>[] }[] = [];
	const list = content.querySelector('.by-agency');
	for (const toggle of list ? [...list.children] : []) {
		if (!toggle.classList.contains('accordion-toggle')) continue;
		const name = groupName(text(toggle.querySelector('.service-name')));
		const counted = /^(\d+) Alerts?$/.exec(text(toggle.querySelector('.service-alert')));
		if (!name || !counted) throw new Error(`${section} group ${name || '?'}: unreadable count`);
		const body = toggle.nextElementSibling;
		const items: Omit<GgAlert, 'routes'>[] = [];
		let id: string | null = null;
		for (const el of body?.classList.contains('accordion-content') ? [...body.children] : []) {
			if (el.tagName === 'A' && el.hasAttribute('name')) id = el.getAttribute('name');
			if (!el.classList.contains('alert-item')) continue;
			const headline = text(el.querySelector('p b, p strong'));
			if (!id) throw new Error(`${name}: an item without an ID`);
			if (!headline) throw new Error(`${name}: item ${id} has no headline`);
			items.push({ id, headline });
			id = null;
		}
		const count = Number(counted[1]);
		if (count !== items.length) throw new Error(`${name}: ${count} listed, ${items.length} read`);
		groups.push({ group: { section, name, count }, items });
	}
	if (groups.length === 0) throw new Error(`${section} section lists no groups`);
	return groups;
}

/** Every ferry and bus group, and each notice once (by its page ID), standing notices dropped. */
export function parseGgAlertsPage(html: string): { groups: GgGroup[]; alerts: GgAlert[] } {
	const { document } = parseHTML(html);
	const buttons = [...document.querySelectorAll('button.alert-type')];
	const read = SECTIONS.flatMap(({ section, title }) => {
		const button = buttons.find((b) => text(b).toLowerCase() === title);
		if (!button?.nextElementSibling) throw new Error(`no ${section} section`);
		return readGroups(section, button.nextElementSibling);
	});
	const byId = new Map<string, GgAlert>();
	for (const { group, items } of read)
		for (const { id, headline } of items) {
			const seen = byId.get(id);
			if (seen) seen.routes.push(group.name);
			else byId.set(id, { id, headline, routes: [group.name] });
		}
	return {
		groups: read.map((r) => r.group),
		alerts: [...byId.values()].filter((a) => !GG_PROMO_HEADLINES.includes(a.headline))
	};
}

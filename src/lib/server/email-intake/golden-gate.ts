/**
 * The reader for goldengate@service.govdelivery.com (GovDelivery account CAGOLDEN). The mail has
 * no topic header or List-Id, so the route comes from explicit subject rules, first match wins,
 * matched on the subject without its resend markers. Each rule's id is stored with the item.
 * Nothing is classified by keywords beyond this table; what it can't place is held privately.
 */
import { revisionBase, type EmailDestination } from '$lib/email-intake';
import type { PostmarkInbound } from './postmark';

export type Route = EmailDestination | 'dropped';

export interface Routed {
	rule: string;
	destination: Route;
	topics: string[];
}

export interface ReadEmail extends Routed {
	subject: string;
	description: string | null;
	permalink: string | null;
}

interface Rule {
	id: string;
	destination: Route;
	matches: (base: string) => boolean;
}

const ACCOUNT_SUBJECTS = new Set(['welcome new user', 'subscription change confirmation']);
const RIDER_ALERT = /^Rider Alert\b/i;

/** The routing table (email intake v1, 2026-11-14). Order matters: first match wins. */
export const GG_RULES: readonly Rule[] = [
	{
		id: 'gg-account',
		destination: 'dropped',
		matches: (s) => ACCOUNT_SUBJECTS.has(s.toLowerCase())
	},
	{
		id: 'gg-transit-alert',
		destination: 'transit',
		matches: (s) => RIDER_ALERT.test(s) && /\b(?:GGTransit|Route \d{2,3}[A-Z]?)\b/i.test(s)
	},
	{
		id: 'gg-ferry-alert',
		destination: 'transit',
		matches: (s) => RIDER_ALERT.test(s) && /\b(?:GGFerry|Golden Gate Ferry)\b/i.test(s)
	},
	{
		id: 'gg-bridge-alert',
		destination: 'roads',
		matches: (s) => /^Alert\b/i.test(s) && /\b(?:GGBRIDGE|Golden Gate Bridge)\b/i.test(s)
	},
	{ id: 'gg-newsletter', destination: 'news', matches: (s) => /\bNewsletter$/i.test(s) },
	{ id: 'gg-public-meeting', destination: 'news', matches: (s) => /\bPublic Meeting\b/i.test(s) }
];

const TERMINALS = ['Larkspur', 'Sausalito', 'Tiburon', 'Angel Island', 'San Francisco'];

/** What the item is about, said the way goldengate.org names its route groups. */
function topicsOf(base: string): string[] {
	const routes = [...base.matchAll(/\bRoute (\d{2,3}[A-Z]?)\b/gi)].map((m) => `Route ${m[1]}`);
	if (routes.length) return [...new Set(routes)];
	if (/\bGGBRIDGE\b|\bGolden Gate Bridge\b/i.test(base)) return ['Golden Gate Bridge'];
	if (/\bFerry\b|\bGGFerry\b/i.test(base)) {
		const terminal = TERMINALS.find((t) => new RegExp(`\\b${t}\\b`, 'i').test(base));
		return [terminal ? `${terminal} Ferry` : 'Golden Gate Ferry'];
	}
	return ['Golden Gate Transit'];
}

export function routeGoldenGate(subject: string, permalink: string | null): Routed {
	const base = revisionBase(subject);
	const rule = GG_RULES.find((r) => r.matches(base));
	if (!rule) return { rule: 'unknown', destination: 'held', topics: [] };
	if (rule.destination === 'dropped') return { rule: rule.id, destination: 'dropped', topics: [] };
	// Anything shown links to its public bulletin; without one it waits for a person.
	if (permalink === null) return { rule: 'gg-no-bulletin', destination: 'held', topics: [] };
	return { rule: rule.id, destination: rule.destination, topics: topicsOf(base) };
}

const BULLETIN =
	/https:\/\/content\.govdelivery\.com\/accounts\/CAGOLDEN\/bulletins\/([0-9a-f]+)\b/i;

/** The public bulletin page ("Bookmark and Share"), canonical: no query, no tracking. */
export function bulletinLink(text: string): string | null {
	const id = BULLETIN.exec(text)?.[1];
	return id
		? `https://content.govdelivery.com/accounts/CAGOLDEN/bulletins/${id.toLowerCase()}`
		: null;
}

const DESCRIPTION_MAX = 500;

/** A GovDelivery click-tracking URL: its path encodes the recipient, so it is never kept. */
const TRACKED_LINK = /https?:\/\/links-\d*\.govdelivery\.com\/CL0\/\S*/gi;

/** The body's first paragraph as plain words: "[ url ]" annotations and *emphasis* removed. */
export function firstParagraph(text: string, inbound: string): string | null {
	const first = text
		.split(/\n\s*\n/)
		.map((p) =>
			p
				.split(inbound)
				.join('')
				.replace(/\[\s*https?:\/\/[^\]]*\]/gi, '')
				.replace(TRACKED_LINK, '')
				.replace(/\*/g, '')
				.replace(/\s+/g, ' ')
				.replace(/\s+([.,;:!?])/g, '$1')
				.trim()
		)
		.find((p) => p !== '');
	if (!first) return null;
	return first.length > DESCRIPTION_MAX
		? `${first.slice(0, DESCRIPTION_MAX - 1).trimEnd()}…`
		: first;
}

export function readGoldenGate(p: PostmarkInbound, inbound: string): ReadEmail {
	const subject = p.Subject.replace(/\s+/g, ' ').trim();
	const permalink = bulletinLink(p.TextBody);
	return {
		...routeGoldenGate(subject, permalink),
		subject,
		description: firstParagraph(p.TextBody, inbound),
		permalink
	};
}

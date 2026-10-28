/**
 * One row anatomy for status lists (plan-text-system.md rule 2): a `label` names the thing, a
 * `body` says it, a `meta` line carries provenance, timing words and qualifications. Three
 * variants: static (no action), link (one external destination: the whole row is the anchor)
 * and detail (opens a panel; any external links live inside it). Never two destinations in a
 * row, never one we made up. `body` clamps only where the destination shows the full text.
 */

export interface MetaField {
	text: string;
	/** In the status colour: a qualification that needs attention ("timing unverified"). */
	attention: boolean;
}
type MetaInput = string | { text: string; attention?: boolean } | null | undefined;

/** A panel's content: the full text a clamped row stands for, and the row's links. */
export interface RowDetail {
	title: string;
	paragraphs: string[];
	meta: string[];
	links: { label: string; body: string; href: string }[];
}

interface Base {
	id: string;
	label: string | null;
	/** Chips inside the label slot (routes, "toward Marin"). */
	chips: string[];
	/** The severity a road row's meta already says in words, as a dot (roads only). */
	tone: 'closed' | 'major' | 'unknown' | 'moderate' | 'minor' | null;
	body: string;
	bodyAttention: boolean;
	/** A category colour the body's words already say (the AQI's), as a swatch before them. */
	swatch: string | null;
	meta: MetaField[];
	clamp: boolean;
	/** The source's own words, when the body shows them recased (rule 4). */
	original: string | null;
}
export type StatusRow =
	| (Base & { kind: 'static' })
	| (Base & { kind: 'link'; href: string })
	| (Base & { kind: 'detail'; detail: RowDetail });

interface RowInput {
	id: string;
	label?: string | null;
	chips?: string[];
	tone?: Base['tone'];
	body: string;
	bodyAttention?: boolean;
	swatch?: string | null;
	meta?: MetaInput[];
	original?: string | null;
}

const fields = (meta: MetaInput[] = []): MetaField[] =>
	meta.flatMap((m) =>
		!m
			? []
			: typeof m === 'string'
				? [{ text: m, attention: false }]
				: m.text
					? [{ text: m.text, attention: !!m.attention }]
					: []
	);

const base = (r: RowInput, clamp: boolean): Base => ({
	id: r.id,
	label: r.label ?? null,
	chips: r.chips ?? [],
	tone: r.tone ?? null,
	body: r.body,
	bodyAttention: r.bodyAttention ?? false,
	swatch: r.swatch ?? null,
	meta: fields(r.meta),
	clamp,
	original: r.original ?? null
});

export const staticRow = (r: RowInput): StatusRow => ({ ...base(r, false), kind: 'static' });

/** A destination we'll link to: a well-formed http(s) URL, normalised; anything else is null. */
export function webHref(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		const u = new URL(url);
		return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname ? u.href : null;
	} catch {
		return null;
	}
}

/** `href` comes through webHref first: a row never links to what it can't vouch for. */
export function linkRow(r: RowInput & { href: string; clamp?: boolean }): StatusRow {
	const href = webHref(r.href);
	if (href === null) throw new Error(`link row ${r.id}: not a web destination`);
	return { ...base(r, r.clamp ?? false), kind: 'link', href };
}

export const detailRow = (r: RowInput & { detail: RowDetail; clamp?: boolean }): StatusRow => ({
	...base(r, r.clamp ?? false),
	kind: 'detail',
	detail: r.detail
});

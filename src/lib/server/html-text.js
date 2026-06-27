// Shared HTML→text helpers for the server scrapers AND the standalone .mjs sync
// scripts (both import this file — TS via $lib, scripts via relative path).
//
// Uses linkedom's DOM parser for tag stripping rather than regexes, so there is
// no bypassable tag filter (CodeQL js/bad-tag-filter) and no incomplete
// multi-character sanitization. Entity decoding is single-pass (no &amp;→& then
// &lt;→< double-decode — CodeQL js/double-escaping).

import { parseHTML } from 'linkedom/worker';

/** @type {Record<string, string>} */
const NAMED_ENTITIES = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' '
};

/**
 * Decode HTML entities (named + numeric) in a single left-to-right pass,
 * preserving everything else — including literal `<`/`>` that decoding produces.
 * Single-pass means `&amp;lt;` decodes to `&lt;`, never to `<`.
 * @param {string} [s]
 * @returns {string}
 */
export function decodeEntities(s = '') {
	if (!s) return '';
	return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity) => {
		if (entity[0] === '#') {
			const isHex = entity[1] === 'x' || entity[1] === 'X';
			const code = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
			// Guard the valid Unicode range — fromCodePoint throws (RangeError) otherwise.
			return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
		}
		return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
	});
}

/**
 * Strip all HTML to plain display text: removes tags via the DOM (script/style
 * content dropped, `<br>`/`</p>` treated as breaks), decodes entities, normalizes
 * curly quotes to straight (legacy behaviour), and collapses whitespace.
 * @param {string} [raw]
 * @returns {string}
 */
export function stripHtml(raw = '') {
	if (!raw) return '';
	// CDATA markers would be parsed as bogus comments and lost; drop the markers
	// (not the content) first, matching the prior regex behaviour.
	// Strip CDATA markers and the structural html/head/body tags (→ space, matching
	// the old "every tag becomes a space"). Removing body/html here means a stray
	// </body> in the input can't break out of the wrapper below and truncate the
	// rest — we're flattening to text anyway.
	const cleaned = raw
		.replace(/<!\[CDATA\[|\]\]>/g, '')
		.replace(/<\/?(?:html|head|body)\b[^>]*>/gi, ' ');
	// linkedom only exposes a usable `body` when the input is a full document, so
	// wrap fragments. (Safe now that the input's own body/html tags are gone.)
	const { document } = parseHTML(`<!DOCTYPE html><html><body>${cleaned}</body></html>`);
	const root = document.body;
	if (!root) return '';
	for (const el of root.querySelectorAll('script, style')) el.remove();
	// Insert whitespace at every element boundary (the prior regex replaced each
	// tag with a space) so block / list / table boundaries don't fuse adjacent
	// text — scrapers run regexes over the flattened text and rely on the gaps.
	for (const el of root.querySelectorAll('*')) el.after(' ');
	const text = root.textContent ?? '';
	return text
		.replace(/[‘’]/g, "'") // curly single quotes → straight
		.replace(/[“”]/g, '"') // curly double quotes → straight
		.replace(/\s+/g, ' ')
		.trim();
}

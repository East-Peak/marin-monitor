/**
 * HTML fragment → plain display text, identical in the browser and on the
 * server (htmlparser2 is a pure-JS tokenizer; no DOM, no DOMParser).
 *
 * - Tags are dropped by the tokenizer, never by regex (no bypassable tag
 *   filter, CodeQL js/bad-tag-filter).
 * - Entities are decoded in ONE pass by the tokenizer (`&amp;lt;` → `&lt;`,
 *   never `<`; CodeQL js/double-escaping).
 * - script/style/noscript content is discarded.
 * - Block boundaries (p, br, li, …) become spaces so paragraphs don't fuse.
 */
import { Parser } from 'htmlparser2';

const SKIPPED = new Set(['script', 'style', 'noscript']);
const BLOCKS = new Set([
	'br',
	'p',
	'div',
	'li',
	'ul',
	'ol',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'tr',
	'td',
	'th',
	'blockquote',
	'section',
	'article',
	'figure',
	'figcaption',
	'hr'
]);

export function htmlToText(input: string): string {
	if (!input) return '';
	// CDATA markers inside already-extracted text would tokenize as bogus
	// comments and swallow their content; drop the markers, keep the content.
	const cleaned = input.replace(/<!\[CDATA\[|\]\]>/g, '');
	let out = '';
	let skipDepth = 0;
	const parser = new Parser(
		{
			onopentag(name) {
				if (SKIPPED.has(name)) skipDepth += 1;
				else if (BLOCKS.has(name)) out += ' ';
			},
			onclosetag(name) {
				if (SKIPPED.has(name)) skipDepth = Math.max(0, skipDepth - 1);
				else if (BLOCKS.has(name)) out += ' ';
			},
			ontext(text) {
				if (skipDepth === 0) out += text;
			}
		},
		{ decodeEntities: true }
	);
	parser.write(cleaned);
	parser.end();
	return out.replace(/\s+/g, ' ').trim();
}

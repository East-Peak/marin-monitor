/**
 * Lexical well-formedness check for feed XML (XML 1.0 well-formedness
 * constraints that apply without a DTD). htmlparser2 is a forgiving
 * tokenizer; this pass is the contract that a document is complete and
 * well-formed before any item can replace a source's last-good collection.
 * Its verdicts are proven against saxes (a W3C-conformance-tested strict XML
 * parser) by a differential test over fixtures, mutations and live feeds.
 *
 * Checked:
 * - only XML characters (no C0 controls except tab/LF/CR, no U+FFFE/FFFF);
 * - an XML declaration only at the very start; at most one DOCTYPE, before
 *   the root, of the form <!DOCTYPE name> or with a SYSTEM/PUBLIC external ID
 *   — any internal subset ([ … ]) is rejected, never interpreted;
 *   the root; exactly one root element; outside it only whitespace, comments
 *   and processing instructions;
 * - start tags: a name, then attributes that are quoted, unique, contain no
 *   "<", and whose every "&" starts a complete reference;
 * - end tags match the innermost open element;
 * - comments are terminated and contain no "--"; CDATA sections are
 *   terminated and only inside the root; PIs are terminated;
 * - text contains no "]]>"; every "&" starts a complete reference;
 *   numeric references name a legal XML character. Named references are
 *   checked for syntax only — declaring them is a DTD concern, and the text
 *   stage decodes HTML names (&nbsp; &mdash;) that real feeds use.
 */
// XML names (Unicode letters, marks, digits, "_", ":", "-", ".", "·").
const NAME = String.raw`[\p{L}\p{Nl}_:][\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}_:.\-·]*`;
// XML white space is exactly space, tab, CR and LF (not JavaScript's \s).
const S = String.raw`[ \t\r\n]`;
const START_TAG_OPEN = new RegExp(`<(${NAME})`, 'yu');
const ATTRIBUTE = new RegExp(`${S}+(${NAME})${S}*=${S}*(?:"([^"<]*)"|'([^'<]*)')`, 'yu');
const START_TAG_CLOSE = new RegExp(`${S}*(/?)>`, 'y');
const END_TAG = new RegExp(`</(${NAME})${S}*>`, 'yu');
const REFERENCE = new RegExp(`&(?:(${NAME})|#([0-9]+)|#x([0-9A-Fa-f]+));`, 'yu');
// Only <!DOCTYPE name> and <!DOCTYPE name SYSTEM "…"> / PUBLIC "…" "…".
// An internal subset ([ … ]) is rejected outright, never validated: real
// feeds never use one, and refusing DTD internals closes XXE-style risk.
const PUBID_LITERAL = String.raw`(?:"[- 
a-zA-Z0-9'()+,./:=?;!*#@$_%]*"|'[- 
a-zA-Z0-9()+,./:=?;!*#@$_%]*')`;
const SYSTEM_LITERAL = String.raw`(?:"[^"]*"|'[^']*')`;
const DOCTYPE = new RegExp(
	String.raw`<!DOCTYPE${S}+${NAME}(?:${S}+(?:SYSTEM${S}+${SYSTEM_LITERAL}|PUBLIC${S}+${PUBID_LITERAL}${S}+${SYSTEM_LITERAL}))?${S}*>`,
	'yu'
);
const DOCTYPE_SUBSET = new RegExp(String.raw`<!DOCTYPE[^>\[]*\[`, 'y');
const XML_DECL = new RegExp(
	String.raw`<\?xml${S}+version${S}*=${S}*(?:"1\.[0-9]+"|'1\.[0-9]+')` +
		String.raw`(?:${S}+encoding${S}*=${S}*(?:"[A-Za-z][A-Za-z0-9._-]*"|'[A-Za-z][A-Za-z0-9._-]*'))?` +
		String.raw`(?:${S}+standalone${S}*=${S}*(?:"(?:yes|no)"|'(?:yes|no)'))?${S}*\?>`,
	'y'
);
const XML_DECL_START = new RegExp(String.raw`<\?xml(?:${S}|\?>)`, 'y');
const PI_TARGET = new RegExp(String.raw`<\?(${NAME})(?:${S}|\?>)`, 'yu');
const SPECIAL = /[<&]/g;

/** A raw character XML 1.0 forbids (C0 controls other than tab/LF/CR, U+FFFE, U+FFFF). */
function hasIllegalChar(xml: string): boolean {
	for (let k = 0; k < xml.length; k++) {
		const c = xml.charCodeAt(k);
		if ((c < 0x20 && c !== 0x9 && c !== 0xa && c !== 0xd) || c === 0xfffe || c === 0xffff)
			return true;
	}
	return false;
}

export interface WellFormedness {
	root: string | null;
	problem: string | null;
}

function legalCodePoint(cp: number): boolean {
	return (
		cp === 0x9 ||
		cp === 0xa ||
		cp === 0xd ||
		(cp >= 0x20 && cp <= 0xd7ff) ||
		(cp >= 0xe000 && cp <= 0xfffd) ||
		(cp >= 0x10000 && cp <= 0x10ffff)
	);
}

/** Validate every "&…;" in a run of text or an attribute value. */
function referencesProblem(text: string): string | null {
	let at = text.indexOf('&');
	while (at >= 0) {
		REFERENCE.lastIndex = at;
		const ref = REFERENCE.exec(text);
		if (!ref) return 'malformed entity reference';
		const cp = ref[2] ? Number.parseInt(ref[2], 10) : ref[3] ? Number.parseInt(ref[3], 16) : null;
		if (cp !== null && !legalCodePoint(cp)) return 'character reference to an illegal character';
		at = text.indexOf('&', REFERENCE.lastIndex);
	}
	return null;
}

export function checkWellFormed(xml: string): WellFormedness {
	const stack: string[] = [];
	let root: string | null = null;
	let rootClosed = false;
	let doctypeSeen = false;
	const result = (problem: string | null): WellFormedness => ({ root, problem });
	if (hasIllegalChar(xml)) return result('illegal XML character');

	let i = xml.charCodeAt(0) === 0xfeff ? 1 : 0;
	XML_DECL_START.lastIndex = i;
	if (XML_DECL_START.test(xml)) {
		XML_DECL.lastIndex = i;
		if (!XML_DECL.test(xml)) return result('malformed XML declaration');
		i = XML_DECL.lastIndex;
	}

	while (i < xml.length) {
		const outside = stack.length === 0;
		SPECIAL.lastIndex = i;
		const found = SPECIAL.exec(xml);
		const next = found ? found.index : xml.length;
		if (next > i) {
			const text = xml.slice(i, next);
			if (outside && /[^ \t\r\n]/.test(text)) return result('text outside the root element');
			if (text.includes(']]>')) return result('"]]>" in text');
			i = next;
			continue;
		}

		if (xml[i] === '&') {
			if (outside) return result('reference outside the root element');
			REFERENCE.lastIndex = i;
			const ref = REFERENCE.exec(xml);
			if (!ref) return result('malformed entity reference');
			const after = REFERENCE.lastIndex; // referencesProblem reuses the regex
			const problem = referencesProblem(ref[0]);
			if (problem) return result(problem);
			i = after;
			continue;
		}

		// xml[i] === '<'
		if (xml.startsWith('<!--', i)) {
			const end = xml.indexOf('-->', i + 4);
			if (end < 0) return result('unterminated comment');
			const body = xml.slice(i + 4, end);
			if (body.includes('--') || body.endsWith('-')) return result('"--" inside a comment');
			i = end + 3;
		} else if (xml.startsWith('<![CDATA[', i)) {
			if (outside) return result('CDATA outside the root element');
			const end = xml.indexOf(']]>', i + 9);
			if (end < 0) return result('unterminated CDATA section');
			i = end + 3;
		} else if (xml.startsWith('<?', i)) {
			PI_TARGET.lastIndex = i;
			const pi = PI_TARGET.exec(xml);
			if (!pi) return result('malformed processing instruction');
			if (pi[1].toLowerCase() === 'xml') return result('XML declaration not at the start');
			const end = xml.indexOf('?>', i + 2);
			if (end < 0) return result('unterminated processing instruction');
			i = end + 2;
		} else if (xml.startsWith('<!', i)) {
			DOCTYPE_SUBSET.lastIndex = i;
			if (DOCTYPE_SUBSET.test(xml)) return result('DOCTYPE internal subset not allowed');
			DOCTYPE.lastIndex = i;
			if (root !== null || doctypeSeen || !DOCTYPE.test(xml)) {
				return result('malformed, misplaced or repeated declaration');
			}
			doctypeSeen = true;
			i = DOCTYPE.lastIndex;
		} else if (xml.startsWith('</', i)) {
			END_TAG.lastIndex = i;
			const end = END_TAG.exec(xml);
			if (!end) return result('malformed end tag');
			const open = stack.pop();
			if (open !== end[1]) {
				return result(
					open ? `malformed XML: unclosed <${open}>` : `unexpected end tag </${end[1]}>`
				);
			}
			if (stack.length === 0) rootClosed = true;
			i = END_TAG.lastIndex;
		} else {
			START_TAG_OPEN.lastIndex = i;
			const open = START_TAG_OPEN.exec(xml);
			if (!open) return result('malformed start tag');
			if (rootClosed) return result(`content after the root element (<${open[1]}>)`);
			root ??= open[1];
			let at = START_TAG_OPEN.lastIndex;
			const seen = new Set<string>();
			for (;;) {
				ATTRIBUTE.lastIndex = at;
				const attribute = ATTRIBUTE.exec(xml);
				if (!attribute) break;
				if (seen.has(attribute[1])) return result(`duplicate attribute ${attribute[1]}`);
				seen.add(attribute[1]);
				at = ATTRIBUTE.lastIndex;
				const problem = referencesProblem(attribute[2] ?? attribute[3] ?? '');
				if (problem) return result(`${problem} in attribute ${attribute[1]}`);
			}
			START_TAG_CLOSE.lastIndex = at;
			const close = START_TAG_CLOSE.exec(xml);
			if (!close) return result(`malformed XML: unterminated or malformed <${open[1]}> tag`);
			if (close[1] !== '/') stack.push(open[1]);
			else if (stack.length === 0) rootClosed = true;
			i = START_TAG_CLOSE.lastIndex;
		}
	}

	if (root === null) return result('empty document');
	if (stack.length > 0) return result(`malformed XML: unclosed <${stack[stack.length - 1]}>`);
	return result(null);
}

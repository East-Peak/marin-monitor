import { SaxesParser } from 'saxes';
import { describe, expect, it } from 'vitest';
import { checkWellFormed } from './xml-well-formed';
import { ATOM_FEED, HTML_ERROR_PAGE, RSS_DATE_CASES, RSS_WORDPRESS } from './feed-fixtures';

/**
 * Oracle: saxes, a strict, W3C-conformance-tested XML parser, with two policy
 * differences: (1) any syntactically valid named reference counts as declared
 * (feeds use HTML names like &nbsp; without a DTD); (2) a DOCTYPE internal
 * subset is refused outright (never interpreted); (3) saxes does not check
 * DOCTYPE syntax, so only the allowed DOCTYPE forms are accepted.
 */
const ALLOWED_DOCTYPE =
	/^<!DOCTYPE[ \t\r\n]+[A-Za-z_:][\w.:-]*(?:[ \t\r\n]+(?:SYSTEM[ \t\r\n]+(?:"[^"]*"|'[^']*')|PUBLIC[ \t\r\n]+(?:"[^"]*"|'[^']*')[ \t\r\n]+(?:"[^"]*"|'[^']*')))?[ \t\r\n]*>$/;

function saxesAccepts(xml: string): boolean {
	// Policy difference #2: a DOCTYPE internal subset is refused, never parsed.
	if (/<!DOCTYPE[^>[]*\[/.test(xml)) return false;
	// Policy difference #3: saxes does not validate DOCTYPE syntax; we allow only
	// <!DOCTYPE name> and SYSTEM "…" / PUBLIC "…" "…" external ids.
	const doctype = /<!DOCTYPE[^>]*>/.exec(xml)?.[0];
	if (doctype && !ALLOWED_DOCTYPE.test(doctype)) return false;
	const parser = new SaxesParser();
	parser.ENTITIES = new Proxy({} as Record<string, string>, {
		get: (_t, name) =>
			typeof name === 'string' && /^[A-Za-z_:][\w.:-]*$/.test(name) ? '' : undefined
	});
	let ok = true;
	parser.on('error', () => {
		ok = false;
	});
	try {
		parser.write(xml).close();
	} catch {
		ok = false;
	}
	return ok;
}

const GOOD = [
	RSS_WORDPRESS,
	RSS_DATE_CASES,
	ATOM_FEED,
	HTML_ERROR_PAGE,
	'﻿<?xml version="1.0"?><?xml-stylesheet href="x.xslt"?><!DOCTYPE rss><!-- a --><rss><channel/></rss><!-- b -->\n',
	'<!DOCTYPE rss PUBLIC "-//Netscape Communications//DTD RSS 0.91//EN" "http://my.netscape.com/publish/formats/rss-0.91.dtd"><rss><channel/></rss>',
	"<!DOCTYPE rss SYSTEM 'rss.dtd'><rss><channel/></rss>",
	"<rss v='2.0'><channel><title>A &amp; B &#8217; &#x2014; &nbsp;</title></channel></rss>",
	'<rss><channel><link href="a?b=1&amp;c=2"/></channel></rss>'
];

const BAD: [string, string, RegExp][] = [
	[
		'a truncated start tag after the root',
		'<rss><channel/></rss><item',
		/after the root|malformed/
	],
	['trailing CDATA after the root', '<rss><channel/></rss><![CDATA[', /CDATA outside/],
	[
		'a trailing reference after the root',
		'<rss><channel/></rss>&amp;',
		/reference outside the root/
	],
	[
		'an unterminated CDATA section',
		'<rss><channel><![CDATA[abc</channel></rss>',
		/unterminated CDATA/
	],
	['an unquoted attribute', '<rss><channel><link href=x/></channel></rss>', /malformed <link>/],
	[
		'a bare & in an attribute',
		'<rss><channel x="bare &"/></rss>',
		/entity reference in attribute x/
	],
	['a < in an attribute', '<rss><channel x="a<b"/></rss>', /malformed <channel>/],
	['a duplicate attribute', '<rss a="1" a="2"><channel/></rss>', /duplicate attribute/],
	['a stray end tag', '<rss><channel></b></channel></rss>', /unclosed <channel>|unexpected/],
	['mismatched nesting', '<rss><a><b></a></b></rss>', /unclosed <b>/],
	['an end tag with no open element', '</rss>', /unexpected end tag/],
	['a second root', '<rss><channel/></rss><rss/>', /after the root/],
	['text after the root', '<rss><channel/></rss>junk', /outside the root/],
	['text before the root', 'junk<rss><channel/></rss>', /outside the root/],
	['an unterminated comment', '<rss><channel/></rss><!-- cut', /unterminated comment/],
	['"--" inside a comment', '<rss><!-- a -- b --><channel/></rss>', /"--" inside a comment/],
	['a comment ending in "--->"', '<rss><!-- a ---><channel/></rss>', /"--" inside a comment/],
	['an unterminated PI', '<rss><channel/><?pi data</rss>', /unterminated processing instruction/],
	[
		'an XML declaration not at the start',
		' <?xml version="1.0"?><rss/>',
		/XML declaration not at the start/
	],
	[
		'a duplicate DOCTYPE',
		'<!DOCTYPE rss><!DOCTYPE rss><rss><channel/></rss>',
		/repeated declaration/
	],
	['a DOCTYPE inside the root', '<rss><!DOCTYPE x><channel/></rss>', /declaration/],
	[
		'a DOCTYPE internal subset (never interpreted)',
		'<!DOCTYPE rss [<!ENTITY x "y">]><rss><channel/></rss>',
		/internal subset/
	],
	[
		'an internal subset hiding a bad comment',
		'<!DOCTYPE rss [<!-- a -- b -->]><rss><channel/></rss>',
		/internal subset/
	],
	[
		'an internal subset hiding a broken PI',
		'<!DOCTYPE rss [<?broken]><rss><channel/></rss>',
		/internal subset/
	],
	[
		'an XXE-style external entity',
		'<!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss><channel>&xxe;</channel></rss>',
		/internal subset/
	],
	['an empty DOCTYPE', '<!DOCTYPE ><rss><channel/></rss>', /malformed/],
	[
		'a DOCTYPE with an unquoted system id',
		'<!DOCTYPE rss SYSTEM rss.dtd><rss><channel/></rss>',
		/malformed/
	],
	['a bare ampersand', '<rss><channel><title>AT&T</title></channel></rss>', /entity reference/],
	[
		'an unterminated reference',
		'<rss><channel><title>&amp</title></channel></rss>',
		/entity reference/
	],
	['a reference to NUL', '<rss><channel><title>&#0;</title></channel></rss>', /illegal character/],
	[
		'a reference to a surrogate',
		'<rss><channel><title>&#xD800;</title></channel></rss>',
		/illegal character/
	],
	[
		'a reference beyond Unicode',
		'<rss><channel><title>&#x110000;</title></channel></rss>',
		/illegal character/
	],
	[
		'a raw control character',
		'<rss><channel><title>a\u0001b</title></channel></rss>',
		/illegal XML character/
	],
	['"]]>" in text', '<rss><channel><title>a]]>b</title></channel></rss>', /"\]\]>" in text/],
	['truncation mid-document', '<rss><channel><item><title>Half', /unclosed <title>/],
	['an empty document', '   ', /empty document/]
];

describe('checkWellFormed — fixtures', () => {
	it.each(GOOD.map((xml) => [xml.slice(0, 40), xml]))('accepts %s…', (_label, xml) => {
		expect(checkWellFormed(xml).problem).toBeNull();
	});
	it.each(BAD)('rejects %s', (_label, xml, problem) => {
		expect(checkWellFormed(xml).problem).toMatch(problem);
	});
	it('reports the root element name', () => {
		expect(checkWellFormed(ATOM_FEED).root).toBe('feed');
		expect(checkWellFormed(HTML_ERROR_PAGE).root).toBe('html');
	});
});

/** Deterministic PRNG so the mutation corpus is reproducible. */
function prng(seed: number) {
	return () => (seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
}

function mutations(xml: string, count: number, seed: number): string[] {
	const rand = prng(seed);
	const noise = [
		'<',
		'>',
		'&',
		'"',
		"'",
		'-',
		'--',
		']]>',
		'</x>',
		'<!--',
		'&#0;',
		'&amp;',
		'/',
		'='
	];
	const out: string[] = [];
	for (let k = 0; k < count; k++) {
		const at = Math.floor(rand() * xml.length);
		const kind = rand();
		if (kind < 0.34)
			out.push(xml.slice(0, at)); // truncation
		else if (kind < 0.67)
			out.push(xml.slice(0, at) + xml.slice(at + 1)); // deletion
		else out.push(xml.slice(0, at) + noise[Math.floor(rand() * noise.length)] + xml.slice(at)); // insertion
	}
	return out;
}

describe('checkWellFormed — agrees with saxes (differential)', () => {
	it.each([...GOOD, ...BAD.map(([, xml]) => xml)].map((xml) => [xml.slice(0, 40), xml]))(
		'fixture %s…',
		(_label, xml) => {
			expect(checkWellFormed(xml).problem === null).toBe(saxesAccepts(xml));
		}
	);

	it('on 3,000 seeded mutations of the fixtures (truncations, deletions, insertions)', () => {
		const corpus = [RSS_WORDPRESS, RSS_DATE_CASES, ATOM_FEED].flatMap((xml, i) =>
			mutations(xml, 1_000, 42 + i)
		);
		const disagreements = corpus.filter(
			(xml) => (checkWellFormed(xml).problem === null) !== saxesAccepts(xml)
		);
		expect(
			disagreements
				.slice(0, 5)
				.map((xml) => ({ ours: checkWellFormed(xml).problem, xml: xml.slice(0, 160) }))
		).toEqual([]);
	});
});

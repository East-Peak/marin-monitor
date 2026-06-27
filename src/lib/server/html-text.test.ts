import { describe, it, expect } from 'vitest';
import { stripHtml, decodeEntities } from './html-text.js';

describe('stripHtml', () => {
	it('returns empty string for empty / undefined input', () => {
		expect(stripHtml('')).toBe('');
		expect(stripHtml()).toBe('');
	});

	it('strips tags, keeping text', () => {
		expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
	});

	it('strips CDATA markers', () => {
		expect(stripHtml('<![CDATA[Some <b>text</b>]]>')).toBe('Some text');
	});

	it('drops script and style content', () => {
		expect(stripHtml('<script>alert("x")</script>content')).toBe('content');
		expect(stripHtml('<style>.a{color:red}</style>content')).toBe('content');
	});

	it('separates block elements with whitespace', () => {
		expect(stripHtml('<p>Para one</p><p>Para two</p>')).toBe('Para one Para two');
	});

	it('separates div / list / table boundaries too (no fused text)', () => {
		expect(stripHtml('<div>a</div><div>b</div>')).toBe('a b');
		expect(stripHtml('<ul><li>x</li><li>y</li></ul>')).toBe('x y');
		expect(stripHtml('<table><tr><td>1</td><td>2</td></tr></table>')).toBe('1 2');
	});

	it('does not truncate on a stray </body> in the input', () => {
		expect(stripHtml('before</body>after')).toBe('before after');
	});

	it('decodes common named entities', () => {
		expect(stripHtml('A &amp; B')).toBe('A & B');
		expect(stripHtml('&quot;quoted&quot;')).toBe('"quoted"');
		expect(stripHtml('&lt;tag&gt;')).toBe('<tag>');
		expect(stripHtml('&nbsp;space')).toBe('space');
	});

	it('normalizes curly quotes to straight, keeps dashes', () => {
		expect(stripHtml('&#8220;hello&#8221;')).toBe('"hello"');
		expect(stripHtml('&#8217;')).toBe("'");
		expect(stripHtml('&#8211;')).toBe('–');
		expect(stripHtml('&#8212;')).toBe('—');
		expect(stripHtml('&#x2013;')).toBe('–');
		expect(stripHtml('&#x2014;')).toBe('—');
	});

	it('decodes numeric references', () => {
		expect(stripHtml('&#65;')).toBe('A');
	});

	it('collapses whitespace', () => {
		expect(stripHtml('  a   b  ')).toBe('a b');
	});

	it('removes script/style with attributes and any case (bad-tag-filter)', () => {
		// A naive /<script>...<\/script>/ regex misses these; the DOM does not.
		expect(stripHtml('<SCRIPT type="x">bad()</SCRIPT>visible')).toBe('visible');
		expect(stripHtml('<script\n  src="evil.js">x</script>after')).toBe('after');
		expect(stripHtml('<style media="all">.a{}</style>shown')).toBe('shown');
	});
});

describe('decodeEntities', () => {
	it('decodes named and numeric entities but preserves literal tags', () => {
		expect(decodeEntities('A &amp; B')).toBe('A & B');
		expect(decodeEntities('&lt;b&gt;')).toBe('<b>');
		expect(decodeEntities('keep <b>tags</b>')).toBe('keep <b>tags</b>');
		expect(decodeEntities('&#65;')).toBe('A');
	});

	it('decodes a single pass — does NOT double-decode &amp;lt;', () => {
		expect(decodeEntities('&amp;lt;')).toBe('&lt;');
		expect(decodeEntities('a &amp;amp; b')).toBe('a &amp; b');
	});

	it('leaves unknown entities untouched', () => {
		expect(decodeEntities('&unknownentity;')).toBe('&unknownentity;');
	});

	it('is case-insensitive for named entities', () => {
		expect(decodeEntities('&AMP; &LT; &GT;')).toBe('& < >');
	});

	it('does not throw (returns literal) on out-of-range numeric entities', () => {
		expect(decodeEntities('&#999999999999;')).toBe('&#999999999999;');
		expect(decodeEntities('&#x110000;')).toBe('&#x110000;');
	});
});

import { describe, expect, it } from 'vitest';
import { htmlToText } from './html-to-text';

describe('htmlToText', () => {
	it('drops tags and keeps their text', () => {
		expect(htmlToText('<p>Paragraph with <a href="#">link</a> and <strong>bold</strong></p>')).toBe(
			'Paragraph with link and bold'
		);
	});
	it('decodes the full HTML entity set in one pass', () => {
		expect(htmlToText('Caf&eacute; &mdash; A&nbsp;B &#8217;s &amp; more')).toBe(
			'Café — A B ’s & more'
		);
	});
	it('never double-decodes: &amp;lt; stays literal text "&lt;"', () => {
		expect(htmlToText('&amp;lt;script&amp;gt;')).toBe('&lt;script&gt;');
	});
	it('discards script, style and noscript content', () => {
		expect(
			htmlToText('a<script>alert(1)</script>b<style>p{}</style>c<noscript>x</noscript>d')
		).toBe('abcd');
	});
	it('puts a space at block boundaries so paragraphs do not fuse', () => {
		expect(htmlToText('<p>One</p><p>Two</p>Three<br>Four')).toBe('One Two Three Four');
	});
	it('strips CDATA markers but keeps their content', () => {
		expect(htmlToText('<![CDATA[Some content here]]>')).toBe('Some content here');
	});
	it('collapses whitespace and trims', () => {
		expect(htmlToText('  Multiple   spaces   and\n\nnewlines  ')).toBe(
			'Multiple spaces and newlines'
		);
	});
	it('returns "" for empty input', () => {
		expect(htmlToText('')).toBe('');
	});
});

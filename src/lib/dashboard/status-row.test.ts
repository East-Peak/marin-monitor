import { describe, expect, it } from 'vitest';
import { detailRow, linkRow, staticRow, webHref } from './status-row';

describe('StatusRow (rule 2: three variants of one anatomy)', () => {
	it('a static row never clamps and has no destination', () => {
		const r = staticRow({ id: 'a', label: 'SFO', body: 'Ground delay', meta: ['FAA'] });
		expect(r).toMatchObject({ kind: 'static', clamp: false, label: 'SFO', body: 'Ground delay' });
		expect(r).not.toHaveProperty('href');
		expect(r.meta).toEqual([{ text: 'FAA', attention: false }]);
	});

	it('a link row has exactly one external destination, and may clamp only when it shows the full text', () => {
		const r = linkRow({
			id: 'b',
			label: 'Marin Transit',
			body: 'No disruptions listed on 511 now',
			href: 'https://marintransit.gov/service-alerts'
		});
		expect(r).toMatchObject({ kind: 'link', href: 'https://marintransit.gov/service-alerts' });
		expect(r.clamp).toBe(false);
		expect(linkRow({ id: 'c', body: 'x', href: 'https://a.test', clamp: true }).clamp).toBe(true);
	});

	it('webHref: a parsed http(s) destination, or null; never a throw (Codex 1b #1)', () => {
		expect(webHref('https://511.org/a')).toBe('https://511.org/a');
		expect(webHref('HTTP://marintransit.gov/x')).toBe('http://marintransit.gov/x');
		expect(webHref('')).toBeNull();
		expect(webHref(null)).toBeNull();
		expect(webHref('javascript:alert(1)')).toBeNull();
		expect(webHref('https://')).toBeNull();
		expect(webHref('http://exa mple.com')).toBeNull();
	});

	it('a link row takes only a web destination', () => {
		expect(() => linkRow({ id: 'd', body: 'x', href: 'javascript:alert(1)' })).toThrow();
		expect(linkRow({ id: 'd', body: 'x', href: 'http://a.test/' }).kind).toBe('link');
	});

	it('a detail row carries what its panel shows; links live inside the panel', () => {
		const r = detailRow({
			id: 'e',
			label: 'Golden Gate Ferry',
			body: 'Modified service',
			clamp: true,
			detail: {
				title: 'Golden Gate Ferry',
				paragraphs: ['Modified service', 'Golden Gate Ferry reports modified service.'],
				meta: ['511 · updated 6 min ago'],
				links: [{ label: '511', body: 'All transit alerts on 511', href: 'https://511.org/' }]
			}
		});
		expect(r.kind).toBe('detail');
		expect(r.clamp).toBe(true);
		if (r.kind !== 'detail') throw new Error('not a detail row');
		expect(r.detail.links).toHaveLength(1);
	});

	it('qualifications in meta keep their words; attention marks the ones in the status colour', () => {
		const r = staticRow({
			id: 'f',
			body: 'Alerts unavailable',
			bodyAttention: true,
			meta: ['511', { text: 'timing unverified', attention: true }]
		});
		expect(r.bodyAttention).toBe(true);
		expect(r.meta).toEqual([
			{ text: '511', attention: false },
			{ text: 'timing unverified', attention: true }
		]);
	});

	it('drops empty meta fields, never a qualifier', () => {
		expect(staticRow({ id: 'g', body: 'x', meta: [null, '', 'reported 3 h ago'] }).meta).toEqual([
			{ text: 'reported 3 h ago', attention: false }
		]);
	});
});

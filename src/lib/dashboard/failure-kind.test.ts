import { describe, expect, it } from 'vitest';
import { FAILURE_KINDS, FAILURE_WORDS, failureKindOf } from './failure-kind';

describe('failureKindOf (the typed code each catch site records)', () => {
	it.each([
		// The news producer and the goldengate.org sync: `<BoundedFetchFailure>: detail`.
		['redirect-not-allowed: https://sanrafael.gov is not allowlisted', 'redirect-rejected'],
		['too-many-redirects: 4 hops', 'redirect-rejected'],
		['http-status: HTTP 404', 'http-error'],
		['timeout: no answer in 10000 ms', 'timeout'],
		['parse: unexpected end of input', 'parse-failed'],
		['too-large: items are 3000000 bytes (max 2000000)', 'parse-failed'],
		['network: fetch failed', 'unknown'],
		['host-not-allowed: http://x.test is not allowlisted', 'unknown'],
		// A dataset or 511 read's thrown error, as the client caught it.
		['HTTP 502', 'http-error'],
		['Transit proxy failed for GG: 503', 'http-error'],
		['Marin Transit: Transit proxy failed for MA: 502', 'http-error'],
		['dataset traffic: timed out after 12000 ms', 'timeout'],
		['The operation was aborted due to timeout', 'timeout'],
		['Unexpected token < in JSON at position 0', 'parse-failed'],
		// The health report's own words around a code.
		[
			'since Oct 22 (last error: redirect-not-allowed: https://sanrafael.gov is not allowlisted)',
			'redirect-rejected'
		]
	])('%s → %s', (diagnostic, kind) => {
		expect(failureKindOf(diagnostic)).toBe(kind);
	});

	it('reads the code, not words that happen to sit in a URL or message (Codex 1a #2)', () => {
		expect(failureKindOf('http-status: HTTP 503 https://x.test/timeout')).toBe('http-error');
		expect(failureKindOf('network: JSON feed unavailable')).toBe('unknown');
		expect(failureKindOf('redirect-not-allowed: https://x.test/parse: y')).toBe(
			'redirect-rejected'
		);
		expect(failureKindOf('feed said: timeout soon')).toBe('unknown');
	});

	it('nothing recorded, or nothing it recognises, is unknown: never a guess', () => {
		expect(failureKindOf(null)).toBe('unknown');
		expect(failureKindOf(undefined)).toBe('unknown');
		expect(failureKindOf('')).toBe('unknown');
		expect(failureKindOf('something odd happened')).toBe('unknown');
	});

	it('a read’s own name before its message is not a code (Codex 1a #2)', () => {
		expect(failureKindOf('transit: HTTP 503')).toBe('http-error');
		expect(failureKindOf('nps: timed out after 8000 ms')).toBe('timeout');
		expect(failureKindOf('transit: something else')).toBe('unknown');
	});
});

describe('FAILURE_WORDS (rule 7: plain, conservative, no diagnostics)', () => {
	it('has words for every kind', () => {
		expect(Object.keys(FAILURE_WORDS).sort()).toEqual([...FAILURE_KINDS].sort());
	});

	it.each(Object.entries(FAILURE_WORDS))('%s reads as plain words', (_, words) => {
		expect(words).not.toMatch(/https?:|allowlist|HTTP \d|ECONN|\d{3}|[A-Z]{3,}|-[a-z]+-/);
		expect(words).toMatch(/^[a-z]/); // continues a sentence after "Unavailable: "
	});

	it('never claims when a failure started or that nothing was published', () => {
		for (const words of Object.values(FAILURE_WORDS)) {
			expect(words).not.toMatch(/since|nothing (new|published)|no (news|alerts)/i);
		}
	});
});

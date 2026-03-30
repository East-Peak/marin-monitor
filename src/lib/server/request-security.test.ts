import { afterEach, describe, expect, it } from 'vitest';
import {
	checkRateLimit,
	getClientIp,
	isTrustedMutationRequest,
	redactIp,
	resetRequestSecurityStateForTests,
	safeEquals
} from './request-security';

afterEach(() => {
	resetRequestSecurityStateForTests();
});

describe('safeEquals', () => {
	it('returns true for matching values', () => {
		expect(safeEquals('secret', 'secret')).toBe(true);
	});

	it('returns false for different values', () => {
		expect(safeEquals('secret', 'secrex')).toBe(false);
	});

	it('returns false when either side is missing', () => {
		expect(safeEquals('secret', null)).toBe(false);
		expect(safeEquals(undefined, 'secret')).toBe(false);
	});
});

describe('isTrustedMutationRequest', () => {
	it('allows matching origin', () => {
		const request = new Request('https://marinmonitor.com/api/feedback', {
			method: 'POST',
			headers: { origin: 'https://marinmonitor.com' }
		});
		expect(isTrustedMutationRequest(request, 'https://marinmonitor.com')).toBe(true);
	});

	it('rejects cross-origin requests', () => {
		const request = new Request('https://marinmonitor.com/api/feedback', {
			method: 'POST',
			headers: { origin: 'https://evil.example' }
		});
		expect(isTrustedMutationRequest(request, 'https://marinmonitor.com')).toBe(false);
	});

	it('allows same-origin fetch metadata when origin is absent', () => {
		const request = new Request('https://marinmonitor.com/api/feedback', {
			method: 'POST',
			headers: { 'sec-fetch-site': 'same-origin' }
		});
		expect(isTrustedMutationRequest(request, 'https://marinmonitor.com')).toBe(true);
	});

	it('rejects cross-site fetch metadata when origin is absent', () => {
		const request = new Request('https://marinmonitor.com/api/feedback', {
			method: 'POST',
			headers: { 'sec-fetch-site': 'cross-site' }
		});
		expect(isTrustedMutationRequest(request, 'https://marinmonitor.com')).toBe(false);
	});
});

describe('getClientIp', () => {
	it('prefers the first x-forwarded-for address', () => {
		const request = new Request('https://marinmonitor.com/api/feedback', {
			headers: { 'x-forwarded-for': '203.0.113.8, 10.0.0.1' }
		});
		expect(getClientIp(request)).toBe('203.0.113.8');
	});

	it('falls back to adapter address', () => {
		const request = new Request('https://marinmonitor.com/api/feedback');
		expect(getClientIp(request, () => '198.51.100.4')).toBe('198.51.100.4');
	});
});

describe('redactIp', () => {
	it('redacts ipv4 addresses', () => {
		expect(redactIp('203.0.113.8')).toBe('203.0.*.*');
	});

	it('redacts ipv6 addresses', () => {
		expect(redactIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:0db8:*');
	});
});

describe('checkRateLimit', () => {
	it('allows requests under the configured limit', () => {
		expect(checkRateLimit({ bucket: 'feedback', key: 'ip-1', limit: 2, windowMs: 60000 }).allowed).toBe(
			true
		);
		expect(checkRateLimit({ bucket: 'feedback', key: 'ip-1', limit: 2, windowMs: 60000 }).allowed).toBe(
			true
		);
	});

	it('blocks requests that exceed the configured limit', () => {
		checkRateLimit({ bucket: 'feedback', key: 'ip-1', limit: 1, windowMs: 60000, now: 0 });
		const result = checkRateLimit({ bucket: 'feedback', key: 'ip-1', limit: 1, windowMs: 60000, now: 1 });
		expect(result.allowed).toBe(false);
		expect(result.retryAfterSec).toBeGreaterThan(0);
	});

	it('resets after the window expires', () => {
		checkRateLimit({ bucket: 'feedback', key: 'ip-1', limit: 1, windowMs: 1000, now: 0 });
		const result = checkRateLimit({ bucket: 'feedback', key: 'ip-1', limit: 1, windowMs: 1000, now: 1001 });
		expect(result.allowed).toBe(true);
	});
});

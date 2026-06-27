import { describe, it, expect, vi } from 'vitest';
import { cronErrorResponse } from './cron-response';

describe('cronErrorResponse', () => {
	it('returns 500 with a generic message — never leaks the internal error string', async () => {
		const res = cronErrorResponse(
			'sync-test',
			new Error('connect ECONNREFUSED 10.0.0.5:5432 secret-db'),
			Date.now()
		);
		expect(res.status).toBe(500);
		const body = await res.json();
		expect(body).toEqual({ ok: false, error: 'sync failed' });
		expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
		expect(JSON.stringify(body)).not.toContain('secret-db');
	});

	it('logs the full Error (with stack) server-side for debugging', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const err = new Error('boom detail');
		cronErrorResponse('sync-test', err, Date.now() - 5);
		expect(spy).toHaveBeenCalledWith(expect.stringContaining('[sync-test] FAILED'), err);
		spy.mockRestore();
	});

	it('handles non-Error throws', async () => {
		const res = cronErrorResponse('sync-test', 'string failure', Date.now());
		const body = await res.json();
		expect(body.error).toBe('sync failed');
	});

	it('sends JSON content-type', () => {
		const res = cronErrorResponse('sync-test', new Error('x'), Date.now());
		expect(res.headers.get('Content-Type')).toBe('application/json');
	});
});

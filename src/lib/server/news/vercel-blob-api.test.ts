// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

class MockPreconditionFailed extends Error {}
const mockGet = vi.fn();
const mockPut = vi.fn();
const mockDel = vi.fn();

vi.mock('@vercel/blob', () => ({
	get: mockGet,
	put: mockPut,
	del: mockDel,
	BlobPreconditionFailedError: MockPreconditionFailed
}));

const { vercelBlobApi } = await import('./vercel-blob-api');
const { BlobWriteConflict } = await import('./snapshot-store');

const go = () => new AbortController().signal;
const found = (text: string, etag = '"e1"') => ({
	statusCode: 200,
	stream: new Response(text).body,
	blob: { etag }
});
const never = () => new Promise(() => {});

beforeEach(() => {
	mockGet.mockReset();
	mockPut.mockReset();
	mockDel.mockReset();
});

describe('vercelBlobApi', () => {
	const api = vercelBlobApi('tok');

	it('reads private blobs uncached, passing the abort signal, and returns body + etag together', async () => {
		mockGet.mockResolvedValue(found('{"a":1}', '"e7"'));
		const signal = go();
		expect(await api.read('k', signal)).toEqual({ text: '{"a":1}', etag: '"e7"' });
		expect(mockGet).toHaveBeenCalledWith(
			'k',
			expect.objectContaining({
				access: 'private',
				useCache: false,
				token: 'tok',
				abortSignal: signal
			})
		);
	});

	it('returns the strong etag when a compressed read reports it weak (put ifMatch rejects W/)', async () => {
		// Live 2026-09-29: a 320 KB snapshot read back as W/"3cc4…" while head() and put()
		// used "3cc4…"; put({ ifMatch: 'W/…' }) failed with "ETag mismatch", so every
		// scheduled run after the first reported 'superseded'.
		mockGet.mockResolvedValue(found('{"a":1}', 'W/"3cc4"'));
		expect(await api.read('k', go())).toEqual({ text: '{"a":1}', etag: '"3cc4"' });
	});

	it('maps a missing blob to null', async () => {
		mockGet.mockResolvedValue(null);
		expect(await api.read('k', go())).toBeNull();
	});

	it('writes conditionally with ifMatch and the abort signal', async () => {
		mockPut.mockResolvedValue({ etag: '"e2"' });
		const signal = go();
		expect(await api.write('k', '{}', { ifMatch: '"e1"' }, signal)).toEqual({ etag: '"e2"' });
		expect(mockPut.mock.calls[0][2]).toMatchObject({
			ifMatch: '"e1"',
			access: 'private',
			addRandomSuffix: false,
			abortSignal: signal
		});
		expect(mockPut.mock.calls[0][2]).not.toHaveProperty('allowOverwrite');
	});

	it('writes createOnly with allowOverwrite: false', async () => {
		mockPut.mockResolvedValue({ etag: '"e1"' });
		await api.write('k', '{}', { createOnly: true }, go());
		expect(mockPut.mock.calls[0][2]).toMatchObject({ allowOverwrite: false });
	});

	it('maps a precondition failure to BlobWriteConflict', async () => {
		mockPut.mockRejectedValue(new MockPreconditionFailed());
		await expect(api.write('k', '{}', { ifMatch: '"e1"' }, go())).rejects.toBeInstanceOf(
			BlobWriteConflict
		);
	});

	it('maps a failed createOnly to BlobWriteConflict only when the blob now exists', async () => {
		mockPut.mockRejectedValue(new Error('Vercel Blob: This blob already exists'));
		mockGet.mockResolvedValueOnce(found('{}'));
		await expect(api.write('k', '{}', { createOnly: true }, go())).rejects.toBeInstanceOf(
			BlobWriteConflict
		);
		mockGet.mockResolvedValueOnce(null);
		await expect(api.write('k', '{}', { createOnly: true }, go())).rejects.toThrow(
			'already exists'
		);
	});

	it.each([
		['read', () => api.read('k', AbortSignal.timeout(20))],
		[
			'write (SDK still retrying)',
			() => api.write('k', '{}', { ifMatch: '"e"' }, AbortSignal.timeout(20))
		],
		['remove', () => api.remove('k', '"e"', AbortSignal.timeout(20))]
	])('gives up on a stalled %s when its signal aborts', async (_label, call) => {
		mockGet.mockImplementation(never);
		mockPut.mockImplementation(never);
		mockDel.mockImplementation(never);
		const started = Date.now();
		await expect(call()).rejects.toThrow();
		expect(Date.now() - started).toBeLessThan(200);
	});

	it('deletes with ifMatch and maps a moved etag to BlobWriteConflict', async () => {
		mockDel.mockResolvedValueOnce(undefined);
		const signal = go();
		await api.remove('k', '"e1"', signal);
		expect(mockDel).toHaveBeenCalledWith('k', {
			ifMatch: '"e1"',
			token: 'tok',
			abortSignal: signal
		});
		mockDel.mockRejectedValueOnce(new MockPreconditionFailed());
		await expect(api.remove('k', '"e1"', go())).rejects.toBeInstanceOf(BlobWriteConflict);
	});
});

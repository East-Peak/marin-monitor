// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockList = vi.fn();
vi.mock('@vercel/blob', () => ({ list: mockList }));

const { vercelBlobLister, MAX_LIST_PAGES } = await import('./vercel-lister');

const page = (names: string[], cursor?: string) => ({
	blobs: names.map((pathname) => ({ pathname, uploadedAt: new Date('2026-11-14T00:00:00.000Z') })),
	hasMore: cursor !== undefined,
	cursor
});

beforeEach(() => mockList.mockReset());

describe('vercelBlobLister', () => {
	it('follows every page of a prefix, passing token, prefix and signal', async () => {
		mockList.mockResolvedValueOnce(page(['a'], 'c1')).mockResolvedValueOnce(page(['b']));
		const signal = new AbortController().signal;
		expect(await vercelBlobLister('tok').list('email-intake/v1/', signal)).toEqual([
			{ key: 'a', uploadedAt: '2026-11-14T00:00:00.000Z' },
			{ key: 'b', uploadedAt: '2026-11-14T00:00:00.000Z' }
		]);
		expect(mockList).toHaveBeenLastCalledWith(
			expect.objectContaining({
				token: 'tok',
				prefix: 'email-intake/v1/',
				cursor: 'c1',
				abortSignal: signal
			})
		);
	});

	it('is bounded: past its page cap it throws rather than scan on', async () => {
		mockList.mockResolvedValue(page(['a'], 'more'));
		await expect(vercelBlobLister('tok').list('p/', new AbortController().signal)).rejects.toThrow(
			/pages/
		);
		expect(mockList).toHaveBeenCalledTimes(MAX_LIST_PAGES);
	});
});

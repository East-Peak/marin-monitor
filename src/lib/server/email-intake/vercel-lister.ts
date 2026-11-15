/** BlobLister over @vercel/blob's list: pathname order, every page, at most MAX_LIST_PAGES. */
import { list } from '@vercel/blob';
import { abortable } from '$lib/server/news/abortable';
import type { BlobLister } from './store';

/** 3 × 1000 blobs: years of one sender's mail. Past it the listing is refused, not scanned. */
export const MAX_LIST_PAGES = 3;

export function vercelBlobLister(token: string): BlobLister {
	return {
		async list(prefix, signal) {
			const out: { key: string; uploadedAt: string }[] = [];
			let cursor: string | undefined;
			for (let pages = 1; ; pages++) {
				const res = await abortable(list({ token, prefix, cursor, abortSignal: signal }), signal);
				out.push(
					...res.blobs.map((b) => ({ key: b.pathname, uploadedAt: b.uploadedAt.toISOString() }))
				);
				if (!res.hasMore || !res.cursor) return out;
				if (pages >= MAX_LIST_PAGES)
					throw new Error(`blob list ${prefix} exceeds ${MAX_LIST_PAGES} pages`);
				cursor = res.cursor;
			}
		}
	};
}

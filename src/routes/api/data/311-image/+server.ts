import { head } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';

/**
 * Serve 311 photos from private Vercel Blob storage.
 * Usage: /api/data/311-image?id=12345&size=full
 */
export const GET: RequestHandler = async ({ url }) => {
	const issueId = url.searchParams.get('id');
	const size = url.searchParams.get('size') || 'full';

	if (!issueId || !/^\d+$/.test(issueId)) {
		return new Response('Invalid issue ID', { status: 400 });
	}

	if (size !== 'full' && size !== 'thumb') {
		return new Response('Invalid size', { status: 400 });
	}

	const blobKey = `311-images/${issueId}-${size}.jpg`;

	try {
		const blob = await head(blobKey, { token: env.BLOB_READ_WRITE_TOKEN });
		const response = await fetchWithTimeout(
			blob.downloadUrl,
			{ headers: { Authorization: `Bearer ${env.BLOB_READ_WRITE_TOKEN}` } },
			8000
		);

		if (response.ok) {
			return new Response(await response.arrayBuffer(), {
				headers: {
					'Content-Type': blob.contentType || 'image/jpeg',
					'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800'
				}
			});
		}
	} catch {
		// Blob not found
	}

	return new Response('Image not found', { status: 404 });
};

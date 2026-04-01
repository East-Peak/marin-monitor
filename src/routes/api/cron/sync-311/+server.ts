import { put } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { verifyCronAuth } from '$lib/server/cron-auth';
import { fetchWithTimeout } from '$lib/server/fetch-utils';
import type { RequestHandler } from './$types';

export const config = { maxDuration: 60 };

const SEECLICKFIX_API = 'https://seeclickfix.com/api/v2/issues';
const BLOB_KEY = 'marin-311.json';

interface SeeClickFixMedia {
	image_full?: string | null;
	image_square_100x100?: string | null;
}

interface SeeClickFixIssue {
	id: number;
	media?: SeeClickFixMedia;
	[key: string]: unknown;
}

/** Download an image from SeeClickFix (follows redirects) and store in Vercel Blob. */
async function storeImage(issueId: number, imageUrl: string, size: 'full' | 'thumb'): Promise<string | null> {
	const blobKey = `311-images/${issueId}-${size}.jpg`;

	try {
		const response = await fetchWithTimeout(imageUrl, {
			headers: { 'User-Agent': 'MarinMonitor/1.0' },
			redirect: 'follow'
		}, 10000);

		if (!response.ok) {
			console.warn(`[sync-311] Image fetch failed for ${issueId}: HTTP ${response.status}`);
			return null;
		}

		const imageData = await response.arrayBuffer();
		if (imageData.byteLength < 100) {
			console.warn(`[sync-311] Image too small for ${issueId}: ${imageData.byteLength} bytes`);
			return null;
		}

		const contentType = response.headers.get('content-type') || 'image/jpeg';
		await put(blobKey, Buffer.from(imageData), {
			access: 'private',
			contentType,
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		return `/api/data/311-image?id=${issueId}&size=${size}`;
	} catch (err) {
		console.warn(`[sync-311] Image store error for ${issueId}: ${err instanceof Error ? err.message : String(err)}`);
		return null;
	}
}

export const GET: RequestHandler = async ({ request }) => {
	const authError = verifyCronAuth(request);
	if (authError) return authError;

	const start = Date.now();

	try {
		const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
		const params = new URLSearchParams({
			place_url: 'marin-county',
			per_page: '100',
			status: 'open,acknowledged,closed',
			sort: 'created_at',
			sort_direction: 'DESC',
			after: cutoff
		});

		const url = `${SEECLICKFIX_API}?${params}`;
		const response = await fetchWithTimeout(
			url,
			{ headers: { 'User-Agent': 'MarinMonitor/1.0' } },
			15000
		);

		if (!response.ok) {
			throw new Error(`SeeClickFix API returned ${response.status}`);
		}

		const data = await response.json();
		const issues: SeeClickFixIssue[] = data.issues ?? [];

		// Download and store photos, rewrite URLs to our blob CDN
		let photosStored = 0;
		for (const issue of issues) {
			if (!issue.media) continue;

			if (issue.media.image_full) {
				const storedUrl = await storeImage(issue.id, issue.media.image_full, 'full');
				if (storedUrl) {
					issue.media.image_full = storedUrl;
					photosStored++;
				}
			}

			if (issue.media.image_square_100x100) {
				const storedUrl = await storeImage(issue.id, issue.media.image_square_100x100, 'thumb');
				if (storedUrl) {
					issue.media.image_square_100x100 = storedUrl;
				}
			}
		}

		const blob = {
			issues,
			lastUpdated: new Date().toISOString(),
			count: issues.length
		};

		await put(BLOB_KEY, JSON.stringify(blob), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			allowOverwrite: true,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		console.log(`[sync-311] OK: ${issues.length} issues, ${photosStored} photos stored in ${Date.now() - start}ms`);
		return new Response(
			JSON.stringify({ ok: true, count: issues.length, photosStored }),
			{ headers: { 'Content-Type': 'application/json' } }
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`[sync-311] FAILED after ${Date.now() - start}ms:`, message);
		return new Response(
			JSON.stringify({ ok: false, error: message }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } }
		);
	}
};

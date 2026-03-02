import { put, list } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

interface FeedbackEntry {
	type: 'feed-request' | 'bug-report' | 'general';
	message: string;
	email?: string;
	timestamp: string;
	ip?: string;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { type, message, email } = body as FeedbackEntry;

		if (!message || typeof message !== 'string' || !message.trim()) {
			return new Response(JSON.stringify({ error: 'Message is required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		if (!['feed-request', 'bug-report', 'general'].includes(type)) {
			return new Response(JSON.stringify({ error: 'Invalid type' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const entry: FeedbackEntry = {
			type,
			message: message.trim().slice(0, 2000),
			email: email ? String(email).trim().slice(0, 200) : undefined,
			timestamp: new Date().toISOString()
		};

		// Append to a running JSON array in Blob storage
		let existing: FeedbackEntry[] = [];
		try {
			const blobs = await list({ prefix: 'feedback.json', token: env.BLOB_READ_WRITE_TOKEN });
			if (blobs.blobs.length > 0) {
				const res = await fetch(blobs.blobs[0].downloadUrl);
				if (res.ok) {
					existing = await res.json();
				}
			}
		} catch {
			// First submission or blob not found — start fresh
		}

		existing.push(entry);

		await put('feedback.json', JSON.stringify(existing), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		console.log('[feedback]', entry.type, entry.message.slice(0, 80));

		return new Response(JSON.stringify({ ok: true }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('[feedback]', message);
		return new Response(JSON.stringify({ error: 'Internal error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

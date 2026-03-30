import { put, list } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import {
	checkRateLimit,
	getClientIp,
	isJsonRequest,
	isTrustedMutationRequest,
	redactIp
} from '$lib/server/request-security';
import type { RequestHandler } from './$types';

interface FeedbackEntry {
	type: 'feed-request' | 'bug-report' | 'general';
	message: string;
	email?: string;
	timestamp: string;
	ip?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FEEDBACK_RATE_LIMIT = { limit: 5, windowMs: 60 * 60 * 1000 };

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	try {
		if (!isTrustedMutationRequest(request, url.origin)) {
			return new Response(JSON.stringify({ error: 'Forbidden' }), {
				status: 403,
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
			});
		}

		if (!isJsonRequest(request)) {
			return new Response(JSON.stringify({ error: 'Expected application/json' }), {
				status: 415,
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
			});
		}

		const clientIp = getClientIp(request, getClientAddress);
		const rateLimit = checkRateLimit({
			bucket: 'feedback',
			key: clientIp,
			limit: FEEDBACK_RATE_LIMIT.limit,
			windowMs: FEEDBACK_RATE_LIMIT.windowMs
		});
		if (!rateLimit.allowed) {
			console.warn('[feedback] rate-limited', redactIp(clientIp));
			return new Response(JSON.stringify({ error: 'Too many requests' }), {
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'no-store',
					'Retry-After': String(rateLimit.retryAfterSec)
				}
			});
		}

		const contentLength = request.headers.get('content-length');
		if (contentLength && parseInt(contentLength) > 10000) {
			return new Response(JSON.stringify({ error: 'Request too large' }), {
				status: 413,
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
			});
		}

		const body = await request.json();
		const { type, message, email, website } = body as FeedbackEntry & { website?: string };

		if (typeof website === 'string' && website.trim()) {
			return new Response(JSON.stringify({ ok: true }), {
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
			});
		}

		if (!message || typeof message !== 'string' || !message.trim()) {
			return new Response(JSON.stringify({ error: 'Message is required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
			});
		}

		if (!['feed-request', 'bug-report', 'general'].includes(type)) {
			return new Response(JSON.stringify({ error: 'Invalid type' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
			});
		}

		if (email && (!EMAIL_PATTERN.test(String(email).trim()) || String(email).trim().length > 200)) {
			return new Response(JSON.stringify({ error: 'Invalid email' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
			});
		}

		const entry: FeedbackEntry = {
			type,
			message: message.trim().slice(0, 2000),
			email: email ? String(email).trim().slice(0, 200) : undefined,
			timestamp: new Date().toISOString(),
			ip: redactIp(clientIp)
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

		// Cap feedback entries to prevent unbounded blob growth
		const MAX_FEEDBACK_ENTRIES = 1000;
		if (existing.length > MAX_FEEDBACK_ENTRIES) {
			existing = existing.slice(-MAX_FEEDBACK_ENTRIES);
		}

		await put('feedback.json', JSON.stringify(existing), {
			access: 'private',
			contentType: 'application/json',
			addRandomSuffix: false,
			token: env.BLOB_READ_WRITE_TOKEN
		});

		console.log('[feedback]', entry.type, entry.email ? 'with-email' : 'no-email', entry.ip);

		return new Response(JSON.stringify({ ok: true }), {
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error('[feedback]', message);
		return new Response(JSON.stringify({ error: 'Internal error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
		});
	}
};

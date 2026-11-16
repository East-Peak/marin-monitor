import { serverFrameCamera, stripFrameUrl } from '$lib/dashboard/cam-strip';
import type { RequestHandler } from './$types';

/** One deadline for headers and body: a stalled source is offline, not a hung first paint. */
const DEADLINE_MS = 5_000;

const offline = () =>
	new Response('camera offline', { status: 503, headers: { 'Cache-Control': 'no-store' } });

/**
 * A strip camera's latest thumbnail, same-origin, so `/` can paint it before its scripts load
 * (LCP1). The bytes are the source's own, unmodified (ALERTCalifornia's info bar included,
 * CAMBAR1), with its own age when it gives one. A source that doesn't answer with a picture is
 * 503: the tile reads that as a failed frame.
 */
export const GET: RequestHandler = async ({ params }) => {
	const cam = serverFrameCamera(params.id);
	if (!cam) return new Response('no such camera', { status: 404 });
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), DEADLINE_MS);
	try {
		const res = await fetch(stripFrameUrl(cam), { signal: ctl.signal });
		const type = res.headers.get('content-type') ?? '';
		if (!res.ok || !type.startsWith('image/')) return offline();
		const body = await res.arrayBuffer();
		const headers: Record<string, string> = {
			'Content-Type': type,
			'Cache-Control': 'public, max-age=30, s-maxage=30, stale-while-revalidate=30'
		};
		const age = res.headers.get('last-modified');
		if (age) headers['Last-Modified'] = age;
		return new Response(body, { headers });
	} catch {
		return offline();
	} finally {
		clearTimeout(timer);
		ctl.abort(); // a refused answer's body is let go, not left running (no-op once read)
	}
};

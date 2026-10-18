import zlib from 'node:zlib';
import type { Page, Route } from '@playwright/test';

export const CAM_HOSTS =
	/cameras\.alertcalifornia\.org|cwwp2\.dot\.ca\.gov|cdns\.abclocal\.go\.com/;
export const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	'base64'
);

/** A solid grey PNG of the given size: a stand-in with a real frame's shape (CAMBAR1). */
export function png(width: number, height: number): Buffer {
	const chunk = (type: string, data: Buffer) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type), data]);
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(zlib.crc32(body));
		return Buffer.concat([len, body, crc]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr.set([8, 0, 0, 0, 0], 8); // 8-bit greyscale
	const rows = Buffer.alloc((width + 1) * height, 0x80);
	for (let y = 0; y < height; y++) rows[y * (width + 1)] = 0; // filter byte
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', zlib.deflateSync(rows)),
		chunk('IEND', Buffer.alloc(0))
	]);
}
/** ALERTCalifornia's thumbnail size (240×135, checked 2026-10-18): their frames are 16:9. */
export const FRAME_16_9 = png(240, 135);

/**
 * Stub every camera host; returns the URLs requested. `fail(url)` → 404. Caltrans gets
 * `Access-Control-Allow-Origin: *` unless `cors: false` (then another origin's), and
 * `Last-Modified` when given.
 */
export async function stubCams(
	page: Page,
	opts: {
		fail?: (url: string) => boolean;
		lastModified?: number;
		cors?: boolean;
		/** The PNG every other URL gets (default: 1×1). */
		png?: Buffer;
		/** A real frame's bytes (JPEG) for some URLs; the rest get the stub PNG. */
		jpeg?: (url: string) => Buffer | undefined;
	} = {}
): Promise<string[]> {
	const seen: string[] = [];
	await page.route(CAM_HOSTS, (r: Route) => {
		const url = r.request().url();
		seen.push(url);
		if (opts.fail?.(url)) return r.fulfill({ status: 404, body: 'gone' });
		const headers: Record<string, string> = {};
		// Playwright's fulfill adds `Access-Control-Allow-Origin: <origin>` when the header is
		// missing, so "no CORS" is a grant for another origin: Chrome rejects it as it would a
		// withdrawn one (the fetch fails; a plain <img> load is unaffected).
		headers['access-control-allow-origin'] =
			opts.cors === false ? 'https://not-marinmonitor.example' : '*';
		if (opts.lastModified !== undefined)
			headers['last-modified'] = new Date(opts.lastModified).toUTCString();
		const jpeg = opts.jpeg?.(url);
		return jpeg
			? r.fulfill({ status: 200, contentType: 'image/jpeg', headers, body: jpeg })
			: r.fulfill({ status: 200, contentType: 'image/png', headers, body: opts.png ?? PNG });
	});
	return seen;
}

/** Requests for one camera (by its ALERTCalifornia axis id or Caltrans image id). */
export const requestsFor = (seen: string[], key: string) =>
	seen.filter((u) => u.includes(key)).length;

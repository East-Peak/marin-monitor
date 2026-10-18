import type { Page, Route } from '@playwright/test';

export const CAM_HOSTS =
	/cameras\.alertcalifornia\.org|cwwp2\.dot\.ca\.gov|cdns\.abclocal\.go\.com/;
export const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
	'base64'
);

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
			: r.fulfill({ status: 200, contentType: 'image/png', headers, body: PNG });
	});
	return seen;
}

/** Requests for one camera (by its ALERTCalifornia axis id or Caltrans image id). */
export const requestsFor = (seen: string[], key: string) =>
	seen.filter((u) => u.includes(key)).length;

#!/usr/bin/env node
/**
 * Marin Monitor Scrape Proxy
 *
 * A lightweight HTTP proxy server that runs on the Mac mini and forwards
 * fetch requests through its residential IP. Vercel cron jobs and GitHub
 * Actions call this proxy to avoid datacenter IP blocking.
 *
 * Exposed via Cloudflare Tunnel for public HTTPS access.
 *
 * Usage:
 *   node scripts/scrape-proxy.mjs
 *
 * Environment:
 *   PROXY_SECRET — shared secret for auth (required)
 *   PROXY_PORT — port to listen on (default: 8889)
 */

import { createServer } from 'node:http';

const PORT = parseInt(process.env.PROXY_PORT || '8889', 10);
const SECRET = process.env.PROXY_SECRET;

if (!SECRET) {
	console.error('PROXY_SECRET environment variable is required');
	process.exit(1);
}

/** Track request counts for observability */
const stats = {
	started: new Date().toISOString(),
	totalRequests: 0,
	successCount: 0,
	errorCount: 0,
	lastRequest: null,
	lastError: null
};

const ALLOWED_PROXY_HOSTS = new Set([
	'www.instacart.com',
	'instacart.com',
	'plumpjackwines.com',
	'www.plumpjackwines.com',
	'www.ikonpass.com',
	'ikonpass.com',
	'www.thumbtack.com',
	'thumbtack.com',
	'marinfamilies.com',
	'www.marinfamilies.com'
]);

const server = createServer(async (req, res) => {
	// CORS preflight
	if (req.method === 'OPTIONS') {
		res.writeHead(204, {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, GET',
			'Access-Control-Allow-Headers': 'Content-Type, Authorization'
		});
		res.end();
		return;
	}

	// Health check
	if (req.method === 'GET' && req.url === '/health') {
		const auth = req.headers['authorization'];
		if (auth !== `Bearer ${SECRET}`) {
			res.writeHead(401, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Unauthorized' }));
			return;
		}
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(
			JSON.stringify({
				ok: true,
				started: stats.started,
				totalRequests: stats.totalRequests,
				successCount: stats.successCount,
				errorCount: stats.errorCount
			})
		);
		return;
	}

	// Auth check
	const auth = req.headers['authorization'];
	if (auth !== `Bearer ${SECRET}`) {
		res.writeHead(401, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Unauthorized' }));
		return;
	}

	// Only accept POST /proxy
	if (req.method !== 'POST' || !req.url?.startsWith('/proxy')) {
		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Not found. Use POST /proxy' }));
		return;
	}

	// Read request body
	let body = '';
	for await (const chunk of req) body += chunk;

	let parsed;
	try {
		parsed = JSON.parse(body);
	} catch {
		res.writeHead(400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Invalid JSON body' }));
		return;
	}

	const { url, headers = {}, method = 'GET', timeout = 30000 } = parsed;
	if (!url) {
		res.writeHead(400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Missing url field' }));
		return;
	}

	let targetUrl;
	try {
		targetUrl = new URL(url);
	} catch {
		res.writeHead(400, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Invalid url field' }));
		return;
	}

	if (!['http:', 'https:'].includes(targetUrl.protocol) || !ALLOWED_PROXY_HOSTS.has(targetUrl.hostname)) {
		res.writeHead(403, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Target URL not allowed' }));
		return;
	}

	stats.totalRequests++;
	stats.lastRequest = { hostname: targetUrl.hostname, time: new Date().toISOString() };

	try {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeout);

			const response = await fetch(targetUrl, {
			method,
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.9',
				...headers
			},
			signal: controller.signal
		});

		clearTimeout(timer);

		const data = await response.text();
		stats.successCount++;

		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(
			JSON.stringify({
				status: response.status,
				headers: Object.fromEntries(response.headers.entries()),
				data,
				bytes: data.length
			})
		);
		} catch (err) {
			stats.errorCount++;
			stats.lastError = {
				hostname: targetUrl.hostname,
				error: err.message,
				time: new Date().toISOString()
			};

		res.writeHead(502, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Proxy fetch failed', message: err.message }));
	}
});

server.listen(PORT, '0.0.0.0', () => {
	console.log(`[scrape-proxy] Listening on 0.0.0.0:${PORT}`);
	console.log(`[scrape-proxy] Health: http://127.0.0.1:${PORT}/health`);
	console.log(`[scrape-proxy] Proxy: POST http://127.0.0.1:${PORT}/proxy (also via Tailscale at 100.67.183.14:${PORT})`);
});
